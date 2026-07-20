'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AddBookDialog from '@/components/add-book-dialog';

function CatalogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeLibId = searchParams.get('library') ?? '';

  const [books, setBooks] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [libraries, setLibraries] = useState([]);

    // Load libraries once on mount
  useEffect(() => {
    supabase.from('libraries').select('*')
       .eq('is_archived', false)
       .order('name')
       .then(({ data }) => { if (data) setLibraries(data); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    // Refresh catalog when library or search changes
  useEffect(() => {
    loadCatalog(activeLibId, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLibId, searchQuery]);

  async function findIsbnLibrary(isbn, copies) {
      for (let i = 0; i < copies.length; i++) {
          if (copies[i].book_isbn === isbn) return copies[i].library_id;
      }
      return null;
  }

  async function loadCatalog(libId, query) {
    setLoading(true);
    try {
        // Fetch ALL books and book_copies - no library filter at query level
        const [{ data: copies, error: cErr },
               { data: allBooks, error: bErr }] = await Promise.all([
            supabase.from('book_copies').select('*'),
            supabase.from('books').select('*'),
        ]);

        if (cErr) console.error('copies query failed:', cErr);
        if (bErr) console.error('books query failed:', bErr);

        // Build entries from book table (primary source -- always works)
        const isbnSet = new Set();
        const entries = [];

        for (const bk of (allBooks || [])) {
            const isbn = bk.isbn || '';
            isbnSet.add(isbn);
            let libIdForIsbn = null;
            if (copies && copies.length > 0) {
                libIdForIsbn = findIsbnLibrary(isbn, copies);
            }
            entries.push({
                id: bk.id,
                isbn,
                title: bk.title ?? null,
                authors: bk.authors ?? [],
                cover_url: bk.cover_url ?? null,
                library_id: libIdForIsbn,
            });
        }

        // Also include standalone books from book_copies (no-ISBN, not yet cataloged)
        for (const copy of (copies || [])) {
            if (!isbnSet.has(copy.book_isbn ?? '')) {
                entries.push({
                    id: 'copy-' + copy.id,
                    isbn: copy.book_isbn ?? '',
                    title: null,
                    authors: [],
                    cover_url: null,
                    library_id: copy.library_id,
                });
            }
        }

        // Filter by selected library
        let filtered = entries;
        if (libId) {
            filtered = entries.filter(e => e.library_id === libId);
        }

        // Apply search filter
        if (query) {
            const q = query.toLowerCase();
            filtered = filtered.filter(
                e => (e.title || '').toLowerCase().includes(q) ||
                     (e.isbn || '').includes(query)
            );
        }

        setBooks(filtered);
    } catch (err) {
        console.error('Failed to load catalog:', err);
    } finally {
        setLoading(false);
    }
  }

  function onBookAdded() {
    setShowDialog(false);
    loadCatalog(activeLibId, searchQuery);
  }

  const selectedLibrary = libraries.find(l => l.id === activeLibId);
  const showAll = !activeLibId;

  return (
      <div className="space-y-6">
        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catalog</h1>
          <p className="mt-2 text-sm text-slate-500">Browse and manage your library catalog.</p>
        </header>

        {/* Library Selector */}
        <div>
          <label htmlFor="catalog-library" className="block text-sm font-medium text-slate-700 mb-1">
            Library
          </label>
          <select
            id="catalog-library"
            value={activeLibId}
            onChange={(e) => {
              const v = e.target.value;
              const params = new URLSearchParams(window.location.search);
              if (v) { params.set('library', v); } else { params.delete('library'); }
              router.push(`/catalog?${params.toString()}`, { scroll: false });
            }}
            className="w-full sm:w-72 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="">All Libraries</option>
            {libraries.map(lib => (
              <option key={lib.id} value={lib.id}>{lib.name}</option>
            ))}
          </select>

          {/* When viewing a specific library: show management link */}
          {activeLibId && selectedLibrary ? (
            <div className="mt-3">
              <Link href={`/libraries/${activeLibId}/manage-books`}
                    className="text-sm text-indigo-600 hover:text-indigo-800">
                Manage books in {selectedLibrary.name} &rarr;
              </Link>
            </div>
          ) : null}

          {/* Quick cross-library links when viewing all */}
          {showAll && libraries.length > 1 ? (
            <>
              <hr className="my-4 border-slate-200" />
              <p className="text-xs text-slate-400 mb-1">Browse by library:</p>
              <div className="flex flex-wrap gap-2">
                {libraries.map(lib => (
                  <Link key={lib.id} href={`/catalog?library=${lib.id}`}
                        className="text-sm text-indigo-600 hover:text-indigo-800">
                    {lib.name}
                  </Link>
                ))}
              </div>
            </>
          ) : null}

          <p className="mt-2 text-xs text-slate-400">
            Select a library to filter the catalog. If no books appear for that library,
            add them through the {showAll ? '"Manage Books"' : 'library'} interface.
          </p>
        </div>

        {/* Search */}
        <div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or ISBN..."
            className="w-full sm:w-96 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        {/* Results count */}
        <p className="text-sm text-slate-600">
          {books.length || 0} book{books.length !== 1 ? 's' : ''} found
        </p>

        {/* Add Book Button */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            + Add Book
          </button>
        </div>

        {/* Books List */}
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : books.length > 0 ? (
          <ul className="space-y-3">
            {books.map(book => (
              <li key={book.id + book.isbn}
                  className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md">
                {/* Cover */}
                {book.cover_url ? (
                  <img src={book.cover_url} alt={`${book.title || ''} cover`}
                       className="h-[80px] w-16 shrink-0 object-cover rounded-lg" />
                ) : (
                  <span className="text-2xl text-slate-300">&#x1F4D6;</span>
                )}

                {/* Title / Author */}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-slate-900 truncate">{book.title || 'Unknown'}</p>
                  {book.authors?.length ? (
                    <p className="text-sm text-slate-500 mt-1">
                      {(Array.isArray(book.authors) ? book.authors : [book.authors]).join(', ')}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">Unknown</p>
                  )}

                  {/* Show library name when browsing all */}
                  {showAll && book.library_id ? (() => {
                    const lib = libraries.find(l => l.id === book.library_id);
                    return lib ? <p key={book.isbn + 'lib'} className="text-xs text-indigo-500 mt-1">{lib.name}</p> : null;
                  })() : null}

                  {/* Show when no library assigned */}
                  {!showAll && !book.library_id && (
                    <p className="text-xs text-slate-400 mt-1">No library copy</p>
                  )}
                </div>

                {/* ISBN + Edit */}
                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-xs text-slate-400">{book.isbn}</span>
                  <Link href={`/books/${encodeURIComponent(book.isbn || '-' + book.id)}/edit`}
                       className="rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 whitespace-nowrap">Edit</Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            {searchQuery
              ? <p className="text-sm font-medium text-slate-600 mb-2">No books found for "{searchQuery}".</p>
              : (
                  <>
                    <p className="text-sm font-medium text-slate-600 mb-2">
                      {activeLibId ? `No books in ${selectedLibrary?.name || 'this library'}.` : 'No books anywhere.'}
                    </p>
                    <p className="text-sm text-slate-500">Add your first book.</p>
                  </>
                )}
          </div>
        )}

        {/* Add Book Dialog Modal */}
        <AddBookDialog
          isOpen={showDialog}
          onClose={() => { setShowDialog(false); loadCatalog(activeLibId, searchQuery); }}
        />
      </div>
  );
}

export default function CatalogPage() {
  return (
      <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
          <CatalogContent />
      </Suspense>
  );
}
