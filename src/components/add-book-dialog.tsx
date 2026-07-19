'use client';

import { useState, useEffect, useImperativeHandle, forwardRef, useLayoutEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchBookByIsbn, searchWorksByTitle, cleanIsbn } from '@/lib/openlibrary';
import type { RefObject } from 'react';

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
  { isOpen: boolean; onClose: () => void }
>(({ isOpen, onClose }, ref) => {
  /* ── state ───────────────────────────── */
  const [mode, setMode] = useState<DialogMode>('isbn');
  const [step, setStep] = useState<DialogStep>('search');
  const [error, setError] = useState<string | null>(null);
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

  // libs
  const [libraries, setLibraries] = useState<any[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState('');

  /* ── ref for form reset (from parent) ── */
  useImperativeHandle(ref, () => ({
    resetForm: () => {
      setQuery('');
      setManualTitle('');
      setManualAuthor('');
      setWorks([]);
      setError(null);
      setLoading(false);
      setStep('search');
      setForm(formDefault());
    },
  }));

  const formDefault = (): FormValues => ({
    isbn: '', title: '', subtitle: '', authors: '',
    publisher: '', publishDate: '', pages: '', coverUrl: '',
  });

  /* ── effect: load libs ─────────────── */
  useEffect(() => {
    const loadLibraries = async () => {
      try {
        const { data } = await supabase
          .from('libraries')
          .select('*')
          .eq('is_archived', false)
          .order('name');
        setLibraries(data || []);
        if ((data?.length ?? 0) === 1 && !selectedLibraryId) {
          setSelectedLibraryId(data[0].id as string);
        }
      } catch (err: unknown) {
        console.error('Failed to load libraries:', err);
      }
    };
    if (isOpen) loadLibraries();
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
        pages: String(metadata.pages),
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
    setError(null);
    setLoading(true);
    try {
      const cleaned = cleanIsbn(query);
      if (cleaned.length !== 10 && cleaned.length !== 13) {
        setError('Enter a valid ISBN (10 or 13 digits).');
        setLoading(false);
        return;
      }
      await populateFormFromIsbn(cleaned);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('OpenLibrary search failed:', msg);
      setForm(formDefault());
      setForm(prev => ({ ...prev, isbn: cleanIsbn(query) }));
      setError(
        'Search failed — please fill in the details manually.'
      );
      setStep('review');
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSearch(): Promise<void> {
    setError(null);
    setLoading(true);
    setWorks([]);
    try {
      const title = manualTitle.trim();
      const author = manualAuthor.trim();
      if (!title) {
        setError('Enter a book title to search.');
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
      setError(
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
    setError(null);

    // Title is required at minimum
    if (!form.title?.trim()) {
      setError('A book title is required.');
      setStep('review');
      return;
    }

    const cleaned = cleanIsbn(form.isbn);
    const hasISBN = cleaned.length > 0;

    try {
         // Build base book record (no isbn — we add it only when present)
       const bookData: Record<string, unknown> = {
          title: form.title.trim(),
          subtitle: form.subtitle?.trim() || null,
          authors: form.authors.trim()
              ? [form.authors.split(',')[0]!.trim()]
              : [],
          publisher: form.publisher?.trim() || null,
          publish_date: form.publishDate?.trim() || null,
          pages: parseInt(form.pages, 10) || null,
          cover_url: form.coverUrl?.trim() || null,
         };

         // ISBN present → upsert on unique isbn constraint for dedup safety
         // No ISBN → bare insert; omitting isbn key avoids NOT NULL violations entirely
       let saveResult!: { error: unknown };
       if (hasISBN) {
         const bookDataWithIsbn = { ...bookData, isbn: cleaned };
         saveResult = await supabase.from('books').upsert(bookDataWithIsbn, { onConflict: 'isbn' });
         } else {
          delete bookData.isbn; // ensure isbn is not in payload (avoids null NOT NULL)
         saveResult = await supabase.from('books').insert(bookData);
         }

       if (saveResult?.error) {
        console.error('Book insert/upsert failed:', saveResult.error);
        throw saveResult.error;
         }

         // Insert book_copies only when ISBN exists
      if (hasISBN && selectedLibraryId) {
        await supabase.from('book_copies').insert({
          book_isbn: cleaned,
          library_id: selectedLibraryId,
          location_id: null,
          barcode: null,
          condition: 'new' as const,
          purchase_price: null,
          acquired_date: new Date().toISOString().split('T')[0],
          notes: null,
        });
      }

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
        else if (c.hint?.trim())  detail = c.hint;
        else                          detail += ` (${c.code ?? ''})`;
      } else if (typeof err === 'object' &&
                 (err as Record<string, unknown>).error_description) {
        detail = (err as Record<string, unknown>).error_description as string;
      }
      setError(detail);
      setStep('review');
    }
  }

  function handleModeSwitch(m: DialogMode): void {
    setMode(m);
    setManualTitle('');
    setManualAuthor('');
    setWorks([]);
    setError(null);
    setLoading(false);
    if (m === 'isbn') setStep('search');
    else                setStep('search'); // same step, different inputs
  }

  function handleClose(): void {
    setQuery('');
    setManualTitle('');
    setManualAuthor('');
    setWorks([]);
    setError(null);
    setLoading(false);
    setStep('search');
    setForm(formDefault());
    onClose();
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
    return (
      <div className="space-y-4">
        {/* Library selector */}
        {libraries.length > 0 && (
          <div>
            <label
              htmlFor="lib-select"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Copy to Library
            </label>
            <select
              id="lib-select"
              value={selectedLibraryId}
              onChange={(e) => setSelectedLibraryId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">Select...</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Editable book metadata form */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Book Details (editable)
          </h3>
          {renderField('ISBN', form.isbn, 'isbn')}
          {renderField('Title', form.title, 'title', true)}
          {renderField('Subtitle', form.subtitle, 'subtitle')}
          {renderField('Authors', form.authors, 'authors')}
          {renderField('Publisher', form.publisher, 'publisher')}
          {renderField('Publish Date', form.publishDate, 'publishDate')}
          {renderField('Pages', form.pages, 'pages')}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-yellow-50 text-sm text-yellow-700 rounded-lg">
            {error}
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
              {error && (
                <div className="p-3 bg-red-50 text-sm text-red-700 rounded-lg">
                  {error}
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
              {error || 'Failed to add book. Please try again.'}
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
