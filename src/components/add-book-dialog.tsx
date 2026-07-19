'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { fetchBookByIsbn, cleanIsbn } from '@/lib/openlibrary';

// ─── Types ────────────────────────────────────────────────────────

export type DialogMode = 'isbn' | 'manual';
export type DialogStep = 'search' | 'review' | 'saved' | 'error';

interface FormValues {
  isbn: string;
  title: string;
  subtitle: string;
  authors: string;
  publisher: string;
  publishDate: string;
  pages: string;
  coverUrl: string;
}

// ─── Component ────────────────────────────────────────────────────

export default function AddBookDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  // State
  const [mode, setMode] = useState<DialogMode>('isbn');
  const [step, setStep] = useState<DialogStep>('search');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [libraries, setLibraries] = useState<any[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState('');

  // Form values (editable after search fills them)
  const [form, setForm] = useState<FormValues>({
    isbn: '', title: '', subtitle: '', authors: '',
    publisher: '', publishDate: '', pages: '', coverUrl: '',
  });

  // Load libraries on mount
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
             setSelectedLibraryId(data[0].id);
        }
      } catch (err: unknown) {
        console.error('Failed to load libraries:', err);
      }
    };
    loadLibraries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

// ── Handlers ────────────────────────────────────────

async function handleISBNSearch() {
  setError(null);
  setLoading(true);
  try {
    const cleaned = cleanIsbn(query);
    if (cleaned.length !== 10 && cleaned.length !== 13) {
      setError('Enter a valid ISBN (10 or 13 digits).');
      setLoading(false);
      return;
    }

    // Call OpenLibrary API to fetch book metadata
    const metadata = await fetchBookByIsbn(query);

    if (metadata && metadata.title) {
        // Prefill form from search results
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
      // No match found — proceed to manual entry with ISBN prefilled
      setForm({ isbn: cleaned, title: '', subtitle: '', authors: '', publisher: '', publishDate: '', pages: '', coverUrl: '' });
      setStep('review');    // go to review step to edit fields manually
    }
  } catch (err: unknown) {
    // Log full error for debugging
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('OpenLibrary search failed:', msg);

    // Default to manual form so user can still add the book
    setForm({ isbn: cleanIsbn(query), title: '', subtitle: '', authors: '', publisher: '', publishDate: '', pages: '', coverUrl: '' });
    setError('Search failed — editing fields manually. Please fill in a valid ISBN and title to save.');
    setStep('review');     // show error on review page so user can proceed
  } finally {
    setLoading(false);
  }
}

// ── Error Formatting Helpers ────────────────

function getDbErrorMessage(error: any): string {
  if (!error || typeof error !== 'object') return 'Database operation failed.';
  const msg = error.message;
  if (msg && msg.trim()) return msg;
  
  // Extract useful info from supabase error structure
  if (error.code?.includes('23')) {
    // Integrity constraint violation (duplicate PK, FK, etc.)
    return 'Duplicate or conflicting record — please check the title and ISBN.';
  }
  if (error.hint?.trim()) return error.hint;
  if (error.detail?.trim()) return error.detail;
  if (error.code) return `Database constraint violated (${error.code}).`;
  
  return 'Check that Supabase credentials are correct, or try again later.';
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message?.trim()) return err.message;
  if (typeof err === 'string') return err || 'An unexpected error occurred — please try again.';
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    return (obj.message as string) ?? 
           (obj.error_description as string) ?? 
           (obj.detail as string) ??
           'An unexpected error occurred — check the Supabase dashboard or try again.';
  }
  return 'An unexpected error occurred — please try again.';
}

async function handleSubmit() {
  setError(null);
  const cleaned = cleanIsbn(form.isbn);

  if (!form.title?.trim()) {
    setError('A book title is required.');
    return;
  }

  try {
     // Upsert book metadata into books table (idempotent by ISBN PK)
    const { error: upsertErr } = await supabase.from('books').upsert({
       isbn: cleaned || null,
      title: form.title.trim(),
       subtitle: form.subtitle?.trim() || null,
      authors: form.authors.trim() ? [form.authors.split(',')[0]!.trim()] : [],
       publisher: null,
     publish_date: form.publishDate?.trim() || null,
      pages: parseInt(form.pages, 10) || null,
       cover_url: form.coverUrl?.trim() || null,
      }, { onConflict: 'isbn' });

    if (upsertErr) throw new Error(getDbErrorMessage(upsertErr));

      // Add a physical copy for selected library (only if library and isbn selected)
    if (selectedLibraryId && cleaned) {
      const { error: insertErr } = await supabase.from('book_copies').insert({
        book_isbn: cleaned,
        library_id: selectedLibraryId,
         location_id: null,
          condition: 'new' as const,
       barcode: null,
        purchase_price: null,
       acquired_date: new Date().toISOString().split('T')[0],
        notes: null,
         });

       if (insertErr) throw new Error(getDbErrorMessage(insertErr));
      }

      // Success — dialog stays open until user closes it manually
     setStep('saved');
    } catch (err: unknown) {
     console.error('Save failed:', err);
   setError(getErrorMessage(err));
     setStep('error');
    }
  }

function resetForm() {
  setQuery('');
  setError(null);
  setLoading(false);
  setStep('search');
  setForm({ isbn: '', title: '', subtitle: '', authors: '', publisher: '', publishDate: '', pages: '', coverUrl: '' });
}

function handleClose() {
   resetForm();
   onClose();
};

const handleModeSwitch = (m: DialogMode) => {
  setMode(m);
    setError(null);
};

 // ─── Render Fields ──────────────────────────────────

  function renderField(label: string, value: string, field: keyof FormValues, required = false): JSX.Element {
     return (
        <div>
         <label htmlFor={`field-${field}`} className="block text-sm font-medium text-slate-700 mb-1">
           {label}
          {required && <span className="text-red-500 ml-1">*</span>}
         </label>
         <input
          id={`field-${field}`}
          type="text"
          value={value}
          onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value as string }))}
         className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
         />
        </div>
      );
    }

 // ─── Render Search Step ──────────────────────────────

  function renderSearchStep(): JSX.Element {
    return (
       <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button onClick={() => handleModeSwitch('isbn')} className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${mode === 'isbn' ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'hover:bg-slate-50'}`}>
            ISBN Lookup</button>
           <button onClick={() => handleModeSwitch('manual')} className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${mode === 'manual' ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'hover:bg-slate-50'}`}>
            Manual Entry</button>
        </div>

        {/* Error message */}
         {error && (
          <div className="p-3 bg-red-50 text-sm text-red-700 rounded-lg">
           {error}
          </div>
         )}

         {/* ISBN Lookup Mode */}
        {mode === 'isbn' && (
         <div className="space-y-3">
           <p className="text-sm text-slate-500">Enter an ISBN and we'll look up the book details automatically.</p>
           <div>
              <label htmlFor="field-isbn-search" className="block text-sm font-medium text-slate-700 mb-1">ISBN</label>
               <input id="field-isbn-search" type="text" value={query} placeholder="978-0441172719" onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
            </div>
           <button onClick={handleISBNSearch} disabled={loading || !query.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Searching...' : 'Search OpenLibrary'}
           </button>
          </div>
         )}

        {/* Manual Entry Mode */}
         {mode === 'manual' && (
          <div className="space-y-3">
           <p className="text-sm text-slate-500">Enter the book details manually. You can always update them later.</p>

            <div>
              <label htmlFor="field-isbn" className="block text-sm font-medium text-slate-700 mb-1">ISBN</label>
              <input id="field-isbn" type="text" value={form.isbn} onChange={(e) => setForm((prev) => ({ ...prev, isbn: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
            </div>

           {renderField('Title', form.title, 'title', true)}
            {renderField('Subtitle', form.subtitle, 'subtitle')}
           {renderField('Authors', form.authors, 'authors')}
            {renderField('Publisher', form.publisher, 'publisher')}
            {renderField('Pages', form.pages, 'pages')}

          {/* Submit button to proceed to review/save */}
          <div className="flex gap-3 pt-4 border-t">
              <button onClick={() => handleModeSwitch('isbn')} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50">
               Switch to ISBN Lookup</button>
             <button   onClick={() => setStep('review')} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              Continue</button>
          </div>
        </div>
      )}
     </div>
    );
 }

 // ─── Render Review/Save Step ──────────────────────────

  function renderReviewStep(): JSX.Element {
    return (
       <div className="space-y-4">
         {/* Library selector */}
        {libraries.length > 0 && (
          <div>
           <label htmlFor="lib-select" className="block text-sm font-medium text-slate-700 mb-1">Copy to Library</label>
            <select id="lib-select" value={selectedLibraryId} onChange={(e) => setSelectedLibraryId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500">
              <option value="">Select...</option>
             {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>{lib.name}</option>
              ))}
            </select>
          </div>
        )}

         {/* Editable book metadata form */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Edit Book Details</h3>
         {renderField('ISBN', form.isbn, 'isbn')}
           {renderField('Title', form.title, 'title', true)}
           {renderField('Subtitle', form.subtitle, 'subtitle')}
           {renderField('Authors', form.authors, 'authors')}
          {renderField('Publisher', form.publisher, 'publisher')}
           {renderField('Pages', form.pages, 'pages')}
        </div>

         {/* Error message */}
         {error && (
          <div className={`p-3 ${step === 'error' ? 'bg-red-50 text-sm text-red-700' : 'bg-yellow-50 text-sm text-yellow-700'} rounded-lg`}>
           {error}
          </div>
         )}

         {/* Action buttons - back or save */}
        <div className="flex gap-3 pt-4 border-t">
          <button onClick={() => setStep('search')} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50">Back</button>
           <button onClick={handleSubmit} className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50" >
           Add to Library</button>
        </div>
       </div>
     );
   }

  // ─── Main Render ──────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
       <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
         <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-slate-900">Add Book to Library</h2>
           <button type="button" onClick={handleClose} aria-label="Close" className="p-1 rounded-full hover:bg-slate-100">
            <span className="text-xl text-slate-400">&times;</span>
          </button>
         </div>

        {/* Content */}
        <div className="px-6 py-8 space-y-4">
         {step === 'search' && renderSearchStep()}
           {(step === 'review') && (renderReviewStep())}
         {step === 'saved' && (<div className="p-6 bg-green-50 text-sm text-green-700 rounded-lg text-center"><span className="text-2xl mr-2 block">✅</span>
           <strong>Book added successfully!</strong><br/><span className="mt-1 inline-block">Close this dialog when you see it below.</span>
         </div>)}
        {step === 'error' && (
           <div className="p-4 bg-red-50 text-sm text-red-700 rounded-lg text-center">
            <span className="text-xl mr-2 block">⚠️</span> 
            {error || 'Failed to add book. Please try again.'}
          </div>
         )}
        </div>

        {/* Footer close button */}
        <div className="px-6 py-3 border-t bg-slate-50">
         <button onClick={handleClose} className="w-full rounded-lg border px-4 py-2 text-sm font-medium hover:bg-white transition-colors">
           Close
         </button>
        </div>
       </div>
    </div>
  );
}
