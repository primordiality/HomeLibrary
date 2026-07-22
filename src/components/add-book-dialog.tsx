'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useLayoutEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchBookByIsbn, searchWorksByTitle, cleanIsbn } from '@/lib/openlibrary';
import { useAuth } from '@/contexts/AuthContext';
import type { RefObject } from 'react';
import type { Profile } from '@/types/db';

/* ═══════─ types ─────────────────────── */

export type DialogMode = 'isbn' | 'manual';
export type DialogStep = 'search' | 'review' | 'saved' | 'error';

type OLWork = {
  key: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  ISBN?: string[];
  publisher?: string[];
  first_publish_year?: number | null;
  cover_edition_id?: number | null;
};

type FormValues = {
  isbn: string;
  title: string;
  subtitle: string;
  authors: string;
  publisher: string;
  publishDate: string;
  pages: string;
  coverUrl: string;
};

/* ═══════─ props + refs ──────────────── */

type RefHandle = { resetForm: () => void };

const AddBookDialogComponent = forwardRef<
  RefHandle,
  { isOpen: boolean; onClose: () => void; profile?: Profile | null }
>(({ isOpen, onClose, profile: propProfile }, ref) => {
  const auth = useAuth();
  const { profileLoading } = auth;
  const { user } = auth;
  const profile = propProfile ?? auth.profile;

  /* ── Gates (must be after all hooks) ── */
  if (!isOpen) return null;
  if (!user) return null;
  if (!profile || profileLoading) {
    // Dialog is open but auth not ready — render an empty shell
    // so React keeps the component alive and it will re-render
    // once auth resolves.
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6 text-center">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }
  if (profile.role === 'patron') return null;

  /* ── Derived: which libraries does this user manage? ── */
  const isOwner = profile.role === 'library_owner';
  const isLibrarian = profile.role === 'librarian';
  const isAdmin = profile.role === 'system_admin';
  const isSelectable = isAdmin; // admin needs to pick, owner/librarian are locked

  // User's managed libraries (owner → their own, librarian → via membership, admin → none)
  const [managedLibraries, setManagedLibraries] = useState<any[]>([]);
  const [managedLibraryId, setManagedLibraryId] = useState<string | null>(null); // for locked mode
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>(''); // for selectable mode
  const [libraryError, setLibraryError] = useState<string | null>(null);

  /* ── State ──────────────────────────── */
  const [mode, setMode] = useState<DialogMode>('isbn');
  const [step, setStep] = useState<DialogStep>('search');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // search inputs
  const [query, setQuery] = useState('');           // ISBN or title/author text
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthor, setManualAuthor] = useState('');
  const [works, setWorks] = useState<OLWork[]>([]);

  // book data
  const [form, setForm] = useState<FormValues>({
    isbn: '', title: '', subtitle: '', authors: '',
    publisher: '', publishDate: '', pages: '', coverUrl: '',
  });
  const [coverImageData, setCoverImageData] = useState<{ bytes: number[]; contentType: string } | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverStatus, setCoverStatus] = useState<string | null>(null);

  // available libraries for admin dropdown
  const [libraries, setLibraries] = useState<any[]>([]);

  /* ── ref for form reset (from parent) ── */
  useImperativeHandle(ref, () => ({
    resetForm: () => {
      setQuery('');
      setManualTitle('');
      setManualAuthor('');
      setWorks([]);
      setFormError(null);
      setLibraryError(null);
      setLoading(false);
      setStep('search');
      setForm(formDefault());
      setCoverImageData(null);
      setCoverLoading(false);
      setCoverStatus(null);
    },
  }));

  const formDefault = (): FormValues => ({
    isbn: '', title: '', subtitle: '', authors: '',
    publisher: '', publishDate: '', pages: '', coverUrl: '',
  });

  /* ── Effect: resolve user's library on dialog open ── */
  useEffect(() => {
    if (!isOpen) return;

    // Reset selection on open
    setSelectedLibraryId('');
    setManagedLibraryId(null);
    setFormError(null);
    setLibraryError(null);

    // Role-based library resolution
    async function resolveLibrary() {
      try {
        if (isOwner) {
          // Owner: fetch their owned library
          const { data } = await supabase
            .from('libraries')
            .select('id, name')
            .eq('owner_id', user.id!)
            .eq('is_archived', false)
            .single();
          if (data) {
            setManagedLibraryId(data.id);
            setManagedLibraries([data]);
          } else {
            setLibraryError('You are not the owner of any library. Contact an admin.');
          }
        } else if (isLibrarian) {
          // Librarian: fetch from library_members
          const { data: members } = await supabase
            .from('library_members')
            .select('library_id, role')
            .eq('user_id', user.id!)
            .eq('role', 'librarian');

          if (!members || members.length === 0) {
            setLibraryError('You are not assigned to any library. Contact an admin.');
            return;
          }

          const libIds = members.map((m: any) => m.library_id);
          const { data: libs } = await supabase
            .from('libraries')
            .select('id, name')
            .in('id', libIds)
            .eq('is_archived', false);

          if (!libs || libs.length === 0) {
            setLibraryError('No active libraries found for your assignments. Contact an admin.');
            return;
          }

          if (libs.length === 1) {
            // Single library → locked
            setManagedLibraryId(libs[0].id);
            setManagedLibraries(libs);
          } else {
            // Multiple libraries → dropdown selectable
            setLibraries(libs);
          }
        } else if (isAdmin) {
          // Admin: load all active libraries for dropdown
          const { data } = await supabase
            .from('libraries')
            .select('id, name')
            .eq('is_archived', false)
            .order('name');
          setLibraries(data || []);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load libraries';
        setLibraryError(msg);
      }
    }

    resolveLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /* ═══════─ helpers ─────────────────── */

  function populateFormFromWork(work: OLWork): void {
    const isbnStr = work?.ISBN?.[0] ?? '';
    setForm({
      isbn: isbnStr,
      title: (work?.title ?? '').trim(),
      subtitle: '', // search doesn't return this reliably
      authors: work.authors?.join(', ') ?? '',
      publisher: work.publisher?.[0] ?? '',
      publishDate: work.first_publish_year
        ? String(work.first_publish_year)
        : '',
      pages: '',
      coverUrl: work.cover_edition_id
        ? `https://covers.openlibrary.org/b/id/${work.cover_edition_id}-M.jpg`
        : '',
    });
    setStep('review');
  }

  async function populateFormFromIsbn(isbnRaw: string): Promise<void> {
    const cleaned = cleanIsbn(isbnRaw);
    const metadata = await fetchBookByIsbn(cleaned);
    if (metadata && metadata.title) {
      setForm({
        isbn: cleaned,
        title: metadata.title ?? '',
        subtitle: metadata.subtitle || '',
        authors: (metadata.authors || []).join(', '),
        publisher: metadata.publisher || '',
        publishDate: String(metadata.publishDate),
        pages: metadata.pages ? String(metadata.pages) : '',
        coverUrl: metadata.coverUrl || '',
      });
      setStep('review');
    } else {
      // No OL match → leave form editable with ISBN prefilled
      setForm({
        ...formDefault(), isbn: cleaned,
      });
      setStep('review');
    }
  }

  /* ═══════─ event handlers ───────────── */

  async function handleISBNSearch(): Promise<void> {
    setFormError(null);
    setLoading(true);
    try {
      const cleaned = cleanIsbn(query);
      if (cleaned.length !== 10 && cleaned.length !== 13) {
        setFormError('Enter a valid ISBN (10 or 13 digits).');
        setLoading(false);
        return;
      }
      await populateFormFromIsbn(cleaned);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('OpenLibrary search failed:', msg);
      setForm(formDefault());
      setForm(prev => ({ ...prev, isbn: cleanIsbn(query) }));
      setFormError(
        'Search failed — please fill in the details manually.'
      );
      setStep('review');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSearch(): Promise<void> {
    setFormError(null);
    setLoading(true);
    setWorks([]);
    try {
      const title = manualTitle.trim();
      const author = manualAuthor.trim();
      if (!title) {
        setFormError('Enter a book title to search.');
        setLoading(false);
        return;
      }
      // Search OL works by title (optionally + author)
      const results = await searchWorksByTitle(title, author ? { author } : undefined);
      setWorks(results ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Manual search failed:', msg);
      // Still allow continuing with just the fields they entered manually
      setForm(formDefault());
      setForm(prev => ({ ...prev, title: manualTitle, authors: manualAuthor }));
      setFormError(
        'Search unavailable — please enter details and save directly.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleWorkSelect(work: OLWork): void {
    populateFormFromWork(work);
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    setLoading(true);

    // Title is required at minimum
    if (!form.title?.trim()) {
      setFormError('A book title is required.');
      setStep('review');
      setLoading(false);
      return;
    }

    // Library must be selected (admin) or resolved (owner/librarian)
    const libraryId = isSelectable
      ? selectedLibraryId
      : (managedLibraryId || '');

    if (!libraryId) {
      setFormError('Please select a library for this book, or contact an admin to assign you a library.');
      setStep('review');
      setLoading(false);
      return;
    }

    const cleaned = cleanIsbn(form.isbn);
    const hasISBN = cleaned.length > 0;

    try {
      // Build book metadata (title always required; isbn only when present)
      let coverUrl = form.coverUrl?.trim() || null;

      // If we have downloaded cover bytes, upload to Storage first
      if (coverImageData) {
        const extension = coverImageData.contentType?.split('/')[1] || 'jpg';
        const tempId = hasISBN && cleaned.length > 0 ? cleaned : `temp-${Date.now()}`;
        const fileName = `book-covers/${tempId}-${Date.now()}.${extension}`;
        const blob = new Blob([new Uint8Array(coverImageData.bytes)], { type: coverImageData.contentType });
        const { error: uploadErr } = await supabase.storage
          .from('library-images')
          .upload(fileName, blob, { upsert: true });
        if (uploadErr) {
          console.error('Cover upload failed:', uploadErr);
          // Non-fatal: fall back to remote URL
        } else {
          const { data: urlData } = supabase.storage
            .from('library-images')
            .getPublicUrl(fileName);
          coverUrl = urlData?.publicUrl || coverUrl;
        }
      }

      const bookData: Record<string, unknown> = {
        title: form.title.trim(),
        subtitle: form.subtitle?.trim() || null,
        authors: form.authors.trim()
          ? [form.authors.split(',')[0]!.trim()]
          : [],
        publisher: form.publisher?.trim() || null,
        publish_date: form.publishDate?.trim() || null,
        pages: parseInt(form.pages, 10) || null,
        cover_url: coverUrl,
      };
      if (hasISBN) {
        (bookData as Record<string, unknown>).isbn = cleaned;
      }

      let bookId: string;

      if (hasISBN) {
        // Check if a book with this ISBN already exists
        const { data: existing } = await supabase
          .from('books')
          .select('id')
          .eq('isbn', cleaned)
          .maybeSingle();

        if (existing?.id) {
          // Book exists — create a new copy pointing to the existing book
          bookId = existing.id;
          // Also update existing book's cover if we have new bytes
          if (coverUrl) {
            await supabase.from('books').update({ cover_url: coverUrl }).eq('id', bookId);
          }
        } else {
          // No existing book — create new master record
          const { data: newBook, error: insertErr } = await supabase
            .from('books')
            .insert(bookData)
            .select('id')
            .single();
          if (insertErr) throw insertErr;
          bookId = newBook!.id;
        }
      } else {
        // No ISBN — always create a new master record
        const { data: newBook, error: insertErr } = await supabase
          .from('books')
          .insert(bookData)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        bookId = newBook!.id;
      }

      // Insert book_copies row (with book_id instead of book_isbn)
      // Always insert — we validated libraryId above, no silent skips
      await supabase.from('book_copies').insert({
        book_id: bookId,
        library_id: libraryId,
        location_id: null,
        barcode: null,
        condition: 'new' as const,
        purchase_price: null,
        acquired_date: new Date().toISOString().split('T')[0],
        notes: null,
        public: true,
        holds_enabled: true,
        checkouts_enabled: true,
      });

      setStep('saved');
    } catch (err: unknown) {
      console.error('Save failed:', err);
      // Build a human-readable error from supabase-js structures
      let detail: string = 'Failed to save book. Please try again.';
      if (err instanceof Error && err.message?.trim()) {
        detail = err.message;
      } else if (typeof err === 'object' && (err as Record<string, unknown>).code) {
        const c = err as Record<string, string>;
        if (c.detail?.trim()) detail = c.detail;
        else if (c.hint?.trim()) detail = c.hint;
        else detail += ` (${c.code ?? ''})`;
      } else if (typeof err === 'object' &&
                 (err as Record<string, unknown>).error_description) {
        detail = (err as Record<string, unknown>).error_description as string;
      }
      setFormError(detail);
      setStep('review');
    } finally {
      setLoading(false);
    }
  }

  function handleModeSwitch(m: DialogMode): void {
    setMode(m);
    setManualTitle('');
    setManualAuthor('');
    setWorks([]);
    setFormError(null);
    setCoverStatus(null);
    setCoverImageData(null);
    setCoverLoading(false);
    setLoading(false);
    if (m === 'isbn') setStep('search');
    else                setStep('search'); // same step, different inputs
  }

  function handleClose(): void {
    setQuery('');
    setManualTitle('');
    setManualAuthor('');
    setWorks([]);
    setFormError(null);
    setCoverStatus(null);
    setCoverImageData(null);
    setCoverLoading(false);
    setLoading(false);
    setStep('search');
    setForm(formDefault());
    onClose();
  }

  /* ═══════─ cover image download & upload ────── */

  async function downloadAndUploadCover(coverUrlStr: string): Promise<void> {
    if (!coverUrlStr) {
      setCoverStatus('No cover URL available');
      return;
    }
    setCoverLoading(true);
    setCoverStatus('Downloading cover…');
    try {
      const imgRes = await fetch('/api/fetch-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: coverUrlStr }),
      });
      if (!imgRes.ok) {
        const errData = await imgRes.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${imgRes.status}`);
      }
      const imgData = await imgRes.json();
      if (!imgData.bytes || !imgData.bytes.length) {
        throw new Error('No image data received');
      }
      // Store the raw bytes for upload on save
      setCoverImageData({ bytes: imgData.bytes, contentType: imgData.contentType });
      setCoverStatus('Cover downloaded — will save to storage when you add the book');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.error('Cover download failed:', msg);
      setCoverStatus('Cover download failed: ' + msg);
    } finally {
      setCoverLoading(false);
    }
  }

  /* ═══════─ field renderer ────────────── */

  function renderField(
    label: string,
    value: string,
    field: keyof FormValues,
    required = false,
  ): React.ReactElement {
    return (
      <div>
        <label
          htmlFor={`field-${field}`}
          className="block text-sm font-medium text-slate-700 mb-1"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          id={`field-${field}`}
          type="text"
          value={value}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, [field]: e.target.value }))
          }
          className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>
    );
  }

  /* ═══════─ render ────────────────────── */

  if (!isOpen) return null;

  /* ── search step (isbn OR manual) ─── */

  function renderSearchStep(): React.ReactElement {
    if (mode === 'isbn') {
      // ISBN lookup mode
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter an ISBN and we'll look up the book details automatically.
          </p>
          <div>
            <label
              htmlFor="field-isbn-search"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              ISBN
            </label>
            <input
              id="field-isbn-search"
              type="text"
              value={query}
              placeholder="978-0441172719"
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleISBNSearch}
            disabled={loading || !query.trim()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search OpenLibrary'}
          </button>
        </div>
      );
    }

    // Manual entry mode
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Enter the book title (and optionally author), or add details manually.
        </p>

        {/* Optional: search by title/author */}
        <div className="space-y-2">
          <label
            htmlFor="field-manual-title"
            className="block text-sm font-medium text-slate-700"
          >
            Book Title (for OL search)
          </label>
          <input
            id="field-manual-title"
            type="text"
            value={manualTitle}
            placeholder="e.g. The Great Gatsby"
            onChange={(e) => setManualTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="field-manual-author"
            className="block text-sm font-medium text-slate-700"
          >
            Author (optional)
          </label>
          <input
            id="field-manual-author"
            type="text"
            value={manualAuthor}
            placeholder="e.g. F. Scott Fitzgerald"
            onChange={(e) => setManualAuthor(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={handleManualSearch}
          disabled={loading || !manualTitle.trim()}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search OpenLibrary'}
        </button>

        {/* Show fetched work results */}
        {works.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-700">
              Select a matching book:
            </h4>
            <ul className="max-h-56 overflow-y-auto space-y-1">
              {works.map((w) => (
                <li key={w.key}>
                  <button
                    type="button"
                    onClick={() => handleWorkSelect(w)}
                    disabled={loading}
                    className="w-full text-left rounded-md border p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-slate-900">
                      {w.title}
                    </div>
                    {w.authors?.length && (
                      <div className="text-xs text-slate-500">
                        by {w.authors.join(', ')}
                      </div>
                    )}
                    {w.first_publish_year && (
                      <div className="text-xs text-slate-400">
                        {w.first_publish_year}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Manual fields (always available for direct input) */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-slate-700">
            Or enter details manually:
          </h4>
          {renderField('Title', form.title, 'title', true)}
          {renderField('Subtitle', form.subtitle, 'subtitle')}
          {renderField('Authors', form.authors, 'authors')}
          {renderField('Publisher', form.publisher, 'publisher')}
          {renderField('Publish Date', form.publishDate, 'publishDate')}
          {renderField('Pages', form.pages, 'pages')}
        </div>

        {/* Continue to review step */}
        <button
          onClick={() => setStep('review')}
          className="w-full mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Continue to Review →
        </button>
      </div>
    );
  }

  /* ── review/save step ─────────────── */

  function renderReviewStep(): React.ReactElement {
    const isSelectable = !isOwner && !isLibrarian;

    return (
      <div className="space-y-4">
        {/* Library selector */}
        {isSelectable && libraries.length > 0 ? (
          <div>
            <label
              htmlFor="lib-select"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Copy to Library <span className="text-red-500">*</span>
            </label>
            <select
              id="lib-select"
              value={selectedLibraryId}
              onChange={(e) => setSelectedLibraryId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Select a library...</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
            {!selectedLibraryId && (
              <p className="text-xs text-amber-600 mt-1">Please select a library before adding.</p>
            )}
          </div>
        ) : (isOwner || isLibrarian) && managedLibraryId ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Copy to Library (your library)
            </label>
            <input
              value={managedLibraries[0]?.name || 'Loading...'}
              disabled
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm bg-slate-100 opacity-60 cursor-not-allowed"
            />
          </div>
        ) : null}

        {libraryError && (
          <div className="p-3 bg-red-50 text-sm text-red-700 rounded-lg">
            {libraryError}
          </div>
        )}

        {/* Editable book metadata form */}
        <div className="space-y-3">
          {/* Cover image section */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cover Image</label>
            <div className="flex items-start gap-3">
              <div className="w-16 h-24 bg-slate-100 rounded border flex items-center justify-center overflow-hidden shrink-0">
                {coverImageData ? (
                  <img
                    src={`data:${coverImageData.contentType};base64,${btoa(String.fromCharCode(...coverImageData.bytes))}`}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                  />
                ) : form.coverUrl ? (
                  <img
                    src={form.coverUrl}
                    alt="Cover preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement!.textContent = '📖';
                    }}
                  />
                ) : (
                  <span className="text-2xl">📖</span>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <button
                  type="button"
                  onClick={() => downloadAndUploadCover(form.coverUrl)}
                  disabled={coverLoading || !form.coverUrl}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                >
                  {coverLoading ? 'Downloading…' : 'Download Cover from OpenLibrary'}
                </button>
                {coverStatus && (
                  <p className={`text-xs ${coverStatus.includes('failed') ? 'text-red-600' : coverStatus.includes('Downloaded') ? 'text-green-600' : 'text-slate-500'}`}>
                    {coverStatus}
                  </p>
                )}
              </div>
            </div>
          </div>

          {renderField('ISBN', form.isbn, 'isbn')}
          {renderField('Title', form.title, 'title', true)}
          {renderField('Subtitle', form.subtitle, 'subtitle')}
          {renderField('Authors', form.authors, 'authors')}
          {renderField('Publisher', form.publisher, 'publisher')}
          {renderField('Publish Date', form.publishDate, 'publishDate')}
          {renderField('Pages', form.pages, 'pages')}
        </div>

        {/* Error message */}
        {formError && (
          <div className="p-3 bg-yellow-50 text-sm text-yellow-700 rounded-lg">
            {formError}
          </div>
        )}

        {/* Save action */}
        <button
          onClick={handleSubmit}
          disabled={loading || !form.title?.trim()}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Add to Library'}
        </button>

        {/* Back to search */}
        <button
          onClick={() => setStep('search')}
          className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to Edit Details
        </button>
      </div>
    );
  }

  /* ═══════─ full component ────────────── */

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Add Book to Library</h2>
          <button type="button" onClick={handleClose}>
            <span className="text-xl text-slate-400 hover:text-slate-600">&times;</span>
          </button>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {step === 'search' && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleModeSwitch('isbn')}
                  className={`text-sm py-1.5 px-3 rounded-lg border font-medium transition-colors flex-1 ${mode === 'isbn' ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'hover:bg-slate-50'}`}
                >
                  ISBN Lookup
                </button>
                <button
                  onClick={() => handleModeSwitch('manual')}
                  className={`text-sm py-1.5 px-3 rounded-lg border font-medium transition-colors flex-1 ${mode === 'manual' ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'hover:bg-slate-50'}`}
                >
                  Manual Entry
                </button>
              </div>

              {renderSearchStep()}

              {/* Error in search step */}
              {formError && (
                <div className="p-3 bg-red-50 text-sm text-red-700 rounded-lg">
                  {formError}
                </div>
              )}
            </>
          )}
          {step === 'review' && renderReviewStep()}
          {step === 'saved' && (
            <div className="p-6 bg-green-50 text-sm text-green-700 rounded-lg text-center">
              <span className="text-2xl block mb-2">✅</span>
              <strong>Book added successfully!</strong>
              <br />
              <span className="mt-1 inline-block">Close this dialog when you see it below.</span>
            </div>
          )}
          {step === 'error' && (
            <div className="p-4 bg-red-50 text-sm text-red-700 rounded-lg text-center">
              <span className="text-xl block mb-2">⚠️</span>
              {formError || 'Failed to add book. Please try again.'}
              <br />
              <button
                onClick={() => setStep('search')}
                className="mt-3 text-sm underline text-red-800"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-slate-50 shrink-0">
          <button
            onClick={handleClose}
            className="w-full rounded-lg border px-4 py-2 text-sm font-medium hover:bg-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

AddBookDialogComponent.displayName = 'AddBookDialog';

export default AddBookDialogComponent;
