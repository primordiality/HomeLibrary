'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AddBookDialog from '@/components/add-book-dialog';

interface Availability {
  total: number;
  checkedOut: number;
  available: number;
}

function CatalogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, profile } = useAuth();
  const isStaff = profile?.role && ['system_admin', 'library_owner', 'librarian'].includes(profile.role);
  const activeLibId = searchParams.get('library') ?? '';

  const [books, setBooks] = useState([]);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, Availability>>({});
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [libraries, setLibraries] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [userHoldsByBook, setUserHoldsByBook] = useState<Record<string, boolean>>({});
  const [visibilityFilter, setVisibilityFilter] = useState<'public' | 'all'>('public');

  // Load libraries once on mount
  useEffect(() => {
    supabase.from('libraries').select('*')
       .eq('is_archived', false)
       .order('name')
       .then(({ data }) => { if (data) setLibraries(data); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh catalog when library, visibility, or search changes
  useEffect(() => {
    loadCatalog(activeLibId, searchQuery, visibilityFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLibId, searchQuery, visibilityFilter]);

  // Load user's active holds to show indicator on cards
  useEffect(() => {
    if (!user) {
      setUserHoldsByBook({});
      return;
    }
    async function loadUserHolds() {
      try {
        const { data } = await supabase
          .from('holds')
          .select('book_id')
          .eq('patron_user_id', user.id)
          .in('status', ['waiting', 'accepted']);
        if (data) {
          const map: Record<string, boolean> = {};
          for (const h of data) {
            map[h.book_id] = true;
          }
          setUserHoldsByBook(map);
        }
      } catch (err) {
        console.error('Failed to load user holds:', err);
      }
    }
    loadUserHolds();
  }, [user]);

  async function loadCatalog(libId: string, query: string, vis: string = 'public') {
    setLoading(true);
    try {
        const [{ data: copies, error: cErr },
               { data: allBooks, error: bErr }] = await Promise.all([
            supabase.from('book_copies').select('*'),
            supabase.from('books').select('*'),
        ]);

        if (cErr) console.error('copies query failed:', cErr);
        if (bErr) console.error('books query failed:', bErr);

        // Filter copies by library (if a library is selected) and by visibility
        const copiesToConsider = libId
            ? (copies || []).filter((c: any) => c.library_id === libId)
            : (copies || []);

        // Respect visibility filter: hide non-public copies unless staff with "all"
        const showAllVisibility = isStaff && vis === 'all';
        const copiesFiltered = showAllVisibility
            ? copiesToConsider
            : copiesToConsider.filter((c: any) => c.public !== false);

        // Load borrows to compute availability
        const { data: borrows, error: borrowsErr } = await supabase
            .from('borrows')
            .select('copy_id')
            .is('return_date', null);
        if (borrowsErr) console.error('borrows query failed:', borrowsErr);

        // Build availability map: per book_id, count total copies and checked-out copies
        const availMap: Record<string, Availability> = {};
        const bookIdsSet = new Set<string>();

        for (const copy of copiesFiltered) {
            const bookId = copy.book_id;
            if (!bookId) continue;
            bookIdsSet.add(bookId);
            if (!availMap[bookId]) {
                availMap[bookId] = { total: 0, checkedOut: 0, available: 0 };
            }
            availMap[bookId].total++;
        }

        // Count checked-out per book
        for (const borrow of (borrows || [])) {
            const copyId = borrow.copy_id;
            // Find which book this copy belongs to
            const copy = copiesFiltered.find((c: any) => c.id === copyId);
            if (copy && copy.book_id && availMap[copy.book_id]) {
                availMap[copy.book_id].checkedOut++;
            }
        }

        // Compute available
        for (const bid of bookIdsSet) {
            const a = availMap[bid];
            if (a) a.available = Math.max(0, a.total - a.checkedOut);
        }

        setAvailabilityMap(availMap);

        // Build entries from copies (each unique book_id gets one entry)
        // When browsing a single library, one copy per book. When "all libraries",
        // collect per-library settings for each book.
        const entries: any[] = [];
        const seenBookIds = new Set<string>();
        const bookIds: string[] = [];
        // Accumulate per-copy settings per book_id
        const bookSettingsMap: Record<string, any[]> = {};

        for (const copy of copiesFiltered) {
            const bookId = copy.book_id;
            if (!bookId) continue;

            if (!bookSettingsMap[bookId]) bookSettingsMap[bookId] = [];
            bookSettingsMap[bookId].push({
                public: copy.public,
                holds_enabled: copy.holds_enabled,
                checkouts_enabled: copy.checkouts_enabled,
                library_id: copy.library_id,
            });

            if (!seenBookIds.has(bookId)) {
                seenBookIds.add(bookId);
                bookIds.push(bookId);
            }
        }

        // Batch-query books by unique ids
        let bookMap: Record<string, any> = {};
        if (bookIds.length > 0) {
            const { data: booksData, error: bmErr } = await supabase
                .from('books')
                .select('id, title, subtitle, authors, cover_url, publish_date, edition, isbn')
                .in('id', bookIds);
            if (bmErr) console.error('batch books query failed:', bmErr);
            if (booksData) {
                booksData.forEach((b: any) => { bookMap[b.id] = b; });
            }
        }

        for (const copy of copiesFiltered) {
            const bookId = copy.book_id;
            if (!bookId) continue;
            
            const book = bookMap[bookId];
            const avail = availMap[bookId] || { total: 0, checkedOut: 0, available: 0 };

            entries.push({
                id: book ? book.id : 'copy-' + copy.id,
                book_id: bookId,
                title: book?.title ?? null,
                subtitle: book?.subtitle ?? null,
                authors: book?.authors ?? [],
                cover_url: book?.cover_url ?? null,
                isbn: (book as any)?.isbn ?? null,
                publish_date: book?.publish_date ?? null,
                edition: book?.edition ?? null,
                library_id: copy.library_id,
                availability: avail,
                copy_settings: bookSettingsMap[bookId],
            });
        }

        // Apply search filter
        let filtered = entries;
        if (query) {
            const q = query.toLowerCase();
            filtered = filtered.filter(
                (e: any) => (e.title || '').toLowerCase().includes(q) ||
                     (e.subtitle || '').toLowerCase().includes(q) ||
                     (e.authors || []).some((a: string) => a.toLowerCase().includes(q)) ||
                     (e.isbn || '').includes(q)
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
    loadCatalog(activeLibId, searchQuery, visibilityFilter);
  }

  const selectedLibrary = libraries.find((l: any) => l.id === activeLibId);
  const showAll = !activeLibId;

  return (
      <div className="space-y-6">
        {/* Header */}
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catalog</h1>
          <p className="mt-2 text-sm text-slate-500">Browse and manage your library catalog.</p>
        </header>

        {/* Filter Controls Toggle */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Filters
          </button>
          <div className="flex items-center gap-3">
            <p className="text-sm text-slate-600">
              {books.length || 0} book{books.length !== 1 ? 's' : ''} found
            </p>
            <button
              onClick={() => setShowDialog(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
            >
              + Add Book
            </button>
          </div>
        </div>

        {/* Search — always visible */}
        <div>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, or ISBN..."
            className="w-full sm:w-96 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Panel (collapsible) — visibility, library selector + cross-library links */}
        {showFilters && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
            {/* Visibility Selector */}
            {isStaff && (
              <div>
                <label htmlFor="catalog-visibility" className="block text-sm font-medium text-slate-700 mb-1">
                  Show:
                </label>
                <select
                  id="catalog-visibility"
                  value={visibilityFilter}
                  onChange={(e) => setVisibilityFilter(e.target.value as 'public' | 'all')}
                  className="w-full sm:w-72 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="public">Public Only</option>
                  <option value="all">All Books</option>
                </select>
              </div>
            )}
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
                {libraries.map((lib: any) => (
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
                  <hr className="my-4 border-slate-300" />
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Browse by library:</p>
                  <div className="flex flex-wrap gap-2">
                    {libraries.map((lib: any) => (
                      <Link key={lib.id} href={`/catalog?library=${lib.id}`}
                            className="text-sm text-indigo-600 hover:text-indigo-800">
                        {lib.name}
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}

              <p className="mt-3 text-xs text-slate-400">
                Select a library to filter the catalog. If no books appear for that library,
                add them through the {showAll ? '"Manage Books"' : 'library'} interface.
              </p>
            </div>
          </div>
        )}

        {/* Books List */}
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : books.length > 0 ? (
          <ul className="space-y-3">
            {books.map((book: any, index: number) => {
              const avail = book.availability || { total: 0, checkedOut: 0, available: 0 };
              const showUnavailable = avail.total > 0 && avail.available === 0;
              const showPartial = avail.total > 1 && avail.available > 0 && avail.available < avail.total;

              return (
                <li key={book.id + '-' + index}
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
                    <Link href={`/catalog/${book.id}`} className="block hover:underline">
                      <p className="font-medium text-sm text-slate-900 truncate">{book.title || 'Unknown'}</p>
                    </Link>
                    {book.authors?.length ? (
                      <p className="text-sm text-slate-500 mt-1">
                        {(Array.isArray(book.authors) ? book.authors : [book.authors]).join(', ')}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 mt-1">Unknown</p>
                    )}

                    {/* Show library name when browsing all */}
                    {showAll && book.library_id ? (() => {
                      const lib = libraries.find((l: any) => l.id === book.library_id);
                      return lib ? <p key={book.isbn + 'lib'} className="text-xs text-indigo-500 mt-1">{lib.name}</p> : null;
                    })() : null}

                    {/* Show when no library assigned */}
                    {!showAll && !book.library_id && (
                      <p className="text-xs text-slate-400 mt-1">No library copy</p>
                    )}

                    {/* Edition */}
                    {book.edition && (
                      <p className="text-xs text-slate-500 mt-1">
                        {book.edition}
                      </p>
                    )}

                    {/* Publish Date */}
                    {book.publish_date && (
                      <p className="text-xs text-slate-500 mt-1">
                        {book.publish_date}
                      </p>
                    )}

                    {/* Availability badge */}
                    {showUnavailable && (
                      <span className="inline-block mt-2 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Checked out
                      </span>
                    )}
                    {showPartial && (
                      <span className="inline-block mt-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {avail.available} of {avail.total} available
                      </span>
                    )}

                    {/* "You have a hold" indicator */}
                    {user && userHoldsByBook[book.id] && (
                      <span className="inline-block mt-2 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        You have a hold
                      </span>
                    )}

                    {/* Staff-only badges */}
                    {isStaff && book.copy_settings && (
                      <>
                        {/* "Private" badge if any copy is non-public */}
                        {book.copy_settings.some((s: any) => s.public === false) && (
                          <span className="inline-block mt-2 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                            🔒 Private
                          </span>
                        )}
                        {/* "No Holds" badge if all copies have holds disabled */}
                        {book.copy_settings.length > 0 &&
                          book.copy_settings.every((s: any) => s.holds_enabled === false) && (
                          <span className="inline-block mt-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            No Holds
                          </span>
                        )}
                        {/* "No Checkouts" badge if all copies have checkouts disabled */}
                        {book.copy_settings.length > 0 &&
                          book.copy_settings.every((s: any) => s.checkouts_enabled === false) && (
                          <span className="inline-block mt-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            No Checkouts
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* ISBN + Edit */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs text-slate-400">{book.isbn}</span>
                    <Link href={`/books/${book.id}/edit`}
                         className="rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 whitespace-nowrap">Edit</Link>
                  </div>
                </li>
              );
            })}
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
          onClose={() => { setShowDialog(false); loadCatalog(activeLibId, searchQuery, visibilityFilter); }}
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
