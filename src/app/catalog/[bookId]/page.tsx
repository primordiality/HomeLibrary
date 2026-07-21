'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import type { Book } from '@/types/db';

const CONDITION_COLORS: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-800',
  good: 'bg-blue-100 text-blue-800',
  fair: 'bg-amber-100 text-amber-800',
  poor: 'bg-orange-100 text-orange-800',
  damaged: 'bg-red-100 text-red-800',
};

type CopyDetail = {
  id: string;
  condition: string;
  barcode?: string | null;
  location_name?: string | null;
  status: 'available' | 'checked_out' | 'on_hold';
  checkedOutBy?: string;
  dueDate?: string | null;
};

export default function BookDetailPage({ params }: { params: { bookId: string } }) {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [copies, setCopies] = useState<any[]>([]);
  const [borrows, setBorrows] = useState<any[]>([]);
  const [holds, setHolds] = useState<any[]>([]);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [placeHoldLoading, setPlaceHoldLoading] = useState(false);
  const [placeHoldError, setPlaceHoldError] = useState<string | null>(null);
  const [placeHoldSuccess, setPlaceHoldSuccess] = useState<string | null>(null);
  const [holdPosition, setHoldPosition] = useState<number | null>(null);

  // Borrow state
  const [borrowLoading, setBorrowLoading] = useState(false);
  const [borrowSuccess, setBorrowSuccess] = useState<string | null>(null);
  const [borrowError, setBorrowError] = useState<string | null>(null);

  const bookId = params.bookId;

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData(): Promise<void> {
    setLoading(true);
    try {
      // Load book details
      const { data: bookData } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      if (bookData) setBook(bookData as Book);

      // Load all copies
      const { data: copiesData } = await supabase
        .from('book_copies')
        .select('*')
        .eq('book_id', bookId);
      if (copiesData) setCopies(copiesData);

      // Load active borrows (no return_date)
      const copyIds = copiesData?.map((c: any) => c.id) || [];
      if (copyIds.length > 0) {
        const { data: borrowsData } = await supabase
          .from('borrows')
          .select('*')
          .in('copy_id', copyIds);
        if (borrowsData) setBorrows(borrowsData);
      }

      // Load holds for this book
      const { data: holdsData } = await supabase
        .from('holds')
        .select('*')
        .eq('book_id', bookId)
        .in('status', ['waiting', 'accepted']);
      if (holdsData) setHolds(holdsData);

      // Load libraries
      const { data: libsData } = await supabase
        .from('libraries')
        .select('id, name')
        .eq('is_archived', false)
        .order('name');
      if (libsData) setLibraries(libsData);

      // Load locations
      const libraryIds = [...new Set((copiesData || []).map((c: any) => c.library_id))];
      if (libraryIds.length > 0) {
        const { data: locsData } = await supabase
          .from('locations')
          .select('id, library_id, name')
          .in('library_id', libraryIds);
        if (locsData) setLocations(locsData);
      }
    } catch (err) {
      console.error('Failed to load book details:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleBookUpdate(field: string, value: string | null): Promise<void> {
    const { error } = await supabase.from('books').update({ [field]: value }).eq('id', bookId);

    if (!error) {
      setBook((prev) => (prev ? { ...prev, [field]: value } : null));
      alert('Updated successfully.');
    } else {
      alert(`Update failed: ${error.message}`);
    }
  }

  async function handleUploadCover(file: File): Promise<void> {
    const fileName = `book-covers/${bookId}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('library-images').upload(fileName, file);
    
    if (error) { alert(`Upload failed: ${error.message}`); return; }

    const { data } = await supabase.storage.from('library-images').getPublicUrl(fileName);

    await supabase.from('books').update({ cover_url: data?.publicUrl }).eq('id', bookId);
    setBook((prev) => (prev ? { ...prev, cover_url: data?.publicUrl } : null));
    alert('Cover image uploaded.');
  }

  async function handleUploadPersonalPhoto(file: File): Promise<void> {
    const fileName = `book-personal/${bookId}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('library-images').upload(fileName, file);
    
    if (error) alert(`Upload failed: ${error.message}`);
    else alert('Photo uploaded.');
  }

  async function handleDeleteCover(): Promise<void> {
    const confirmed = window.confirm('Delete the cover image from storage? This cannot be undone.');
    if (!confirmed) return;

    setBook((prev) => (prev ? { ...prev, cover_url: null } : null));
  }

  async function handlePlaceHold(): Promise<void> {
    if (!user) return;
    setPlaceHoldLoading(true);
    setPlaceHoldError(null);
    setPlaceHoldSuccess(null);
    setHoldPosition(null);
    try {
      // Pick the library with the most copies for this book
      const libraryCounts: Record<string, number> = {};
      for (const copy of copies) {
        libraryCounts[copy.library_id] = (libraryCounts[copy.library_id] || 0) + 1;
      }
      const targetLibrary = Object.entries(libraryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

      const { error } = await supabase
        .from('holds')
        .insert({
          patron_user_id: user.id,
          book_id: bookId,
          library_id: targetLibrary,
          status: 'waiting',
        });

      if (error) {
        setPlaceHoldError(error.message);
      } else {
        // Calculate position: count waiting holds for this book + library created before this one
        // We need to refresh holds and find our position
        const { data: refreshedHolds } = await supabase
          .from('holds')
          .select('*')
          .eq('book_id', bookId)
          .eq('library_id', targetLibrary)
          .eq('status', 'waiting')
          .order('created_at', { ascending: true });
        
        if (refreshedHolds) {
          setHolds(refreshedHolds);
          const myPosition = refreshedHolds.findIndex((h: any) => h.patron_user_id === user.id);
          if (myPosition >= 0) {
            setHoldPosition(myPosition + 1);
            setPlaceHoldSuccess(`Hold placed. You are #${myPosition + 1} in the queue.`);
          } else {
            setPlaceHoldSuccess('Hold placed successfully!');
            setHoldPosition(1);
          }
        } else {
          setPlaceHoldSuccess('Hold placed successfully!');
          setHoldPosition(1);
        }
        // Hide success message after 5 seconds
        setTimeout(() => setPlaceHoldSuccess(null), 5000);
      }
    } catch (err) {
      setPlaceHoldError('Failed to place hold. Please try again.');
    } finally {
      setPlaceHoldLoading(false);
    }
  }

  // Borrow book flow
  async function handleBorrow(copyId: string): Promise<void> {
    if (!user) return;
    setBorrowLoading(true);
    setBorrowError(null);
    setBorrowSuccess(null);
    try {
      const today = new Date();
      const checkoutDate = today.toISOString().split('T')[0];
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 14);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const { error } = await supabase.from('borrows').insert({
        patron_user_id: user.id,
        copy_id: copyId,
        checkout_date: checkoutDate,
        due_date: dueDateStr,
      });

      if (error) {
        setBorrowError(error.message);
      } else {
        // Optimistic update: remove the copy from available, add to borrows
        const dueDateDisplay = new Date(dueDateStr).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        setBorrowSuccess(`Book borrowed successfully. Due ${dueDateDisplay}.`);
        // Remove the borrowed copy from copies list
        setCopies((prev) => prev.filter((c) => c.id !== copyId));
        // Add to borrows list
        setBorrows((prev) => [...prev, {
          patron_user_id: user.id,
          copy_id: copyId,
          checkout_date: checkoutDate,
          due_date: dueDateStr,
          return_date: null,
        }]);
        // Hide success message after 3 seconds
        setTimeout(() => setBorrowSuccess(null), 3000);
        // Refresh the page to sync state
        router.refresh();
      }
    } catch (err) {
      setBorrowError('Failed to borrow book. Please try again.');
    } finally {
      setBorrowLoading(false);
    }
  }

  // Build copies with status
  const copiesWithStatus: CopyDetail[] = copies.map((copy) => {
    const borrow = borrows.find((b: any) => b.copy_id === copy.id && !b.return_date);
    const hold = holds.find((h: any) => h.book_id === bookId && h.status === 'waiting');
    const location = locations.find((l: any) => l.id === copy.location_id);

    let status: CopyDetail['status'] = 'available';
    if (borrow) {
      status = 'checked_out';
    } else if (hold && hold.patron_user_id !== user?.id) {
      status = 'on_hold';
    }

    return {
      id: copy.id,
      condition: copy.condition,
      barcode: copy.barcode,
      location_name: location?.name || null,
      status,
      checkedOutBy: borrow?.patron_user_id || undefined,
      dueDate: borrow?.due_date || null,
    };
  });

  const totalCopies = copies.length;
  const availableCopies = copiesWithStatus.filter(c => c.status === 'available').length;
  const allCheckedOut = availableCopies === 0 && totalCopies > 0;

  // Check if user already has this book checked out
  const userHasBook = user && borrows.some(
    (b: any) => b.patron_user_id === user.id && !b.return_date
  );

  // Check if user already has an active hold for this book
  const userHasHold = user && holds.some(
    (h: any) => h.patron_user_id === user.id && (h.status === 'waiting' || h.status === 'accepted')
  );

  // Get an available copy for the borrow button
  const availableCopy = copiesWithStatus.find((c) => c.status === 'available');

  if (loading || authLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!book) return <p className="text-red-600">Book not found.</p>;

  const isPatron = profile?.role === 'patron';
  const isStaff = profile?.role && ['system_admin', 'library_owner', 'librarian'].includes(profile.role);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <header>
        <Link href="/catalog" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-2 inline-block">
          ← Back to Catalog
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{book.title || 'Unknown Book'}</h1>
            <p className="mt-1 text-lg text-slate-500">
              {book.authors?.join(', ') || 'Unknown author'}
            </p>
            {book.subtitle && (
              <p className="mt-1 text-sm text-slate-400 italic">{book.subtitle}</p>
            )}
          </div>
          {book.cover_url && (
            <img
              src={book.cover_url}
              alt={`${book.title} cover`}
              className="w-20 h-28 object-cover rounded-lg shadow-sm shrink-0"
            />
          )}
        </div>
      </header>

      {/* Patron Borrow Section */}
      {isPatron && user && !allCheckedOut && !userHasBook && availableCopy && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-900">Available to borrow</p>
              <p className="text-xs text-indigo-600 mt-0.5">Due in 14 days</p>
            </div>
            <button
              onClick={() => handleBorrow(availableCopy.id)}
              disabled={borrowLoading}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {borrowLoading ? 'Borrowing...' : 'Borrow This Book'}
            </button>
          </div>
          {borrowSuccess && (
            <p className="mt-2 text-sm text-green-700 font-medium">{borrowSuccess}</p>
          )}
          {borrowError && (
            <p className="mt-2 text-sm text-red-600">{borrowError}</p>
          )}
        </div>
      )}

      {/* Already have this book */}
      {isPatron && user && userHasBook && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            You already have this book checked out.
          </p>
          <Link
            href="/patrons/dashboard"
            className="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            View your dashboard →
          </Link>
        </div>
      )}

      {/* Already have a hold */}
      {isPatron && user && userHasHold && !userHasBook && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            You already have a hold on this book.
          </p>
          <Link
            href="/patrons/dashboard"
            className="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            View your holds →
          </Link>
        </div>
      )}

      {/* Full Book Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Book Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {book.publisher && (
            <div>
              <dt className="text-slate-500">Publisher</dt>
              <dd className="text-slate-900">{book.publisher}</dd>
            </div>
          )}
          {book.publish_date && (
            <div>
              <dt className="text-slate-500">Published</dt>
              <dd className="text-slate-900">{book.publish_date}</dd>
            </div>
          )}
          {book.pages && (
            <div>
              <dt className="text-slate-500">Pages</dt>
              <dd className="text-slate-900">{book.pages}</dd>
            </div>
          )}
          {book.isbn && (
            <div>
              <dt className="text-slate-500">ISBN</dt>
              <dd className="text-slate-900 font-mono">{book.isbn}</dd>
            </div>
          )}
          {book.language && (
            <div>
              <dt className="text-slate-500">Language</dt>
              <dd className="text-slate-900">{book.language}</dd>
            </div>
          )}
          {book.genres?.length > 0 && (
            <div>
              <dt className="text-slate-500">Genres</dt>
              <dd className="text-slate-900">{book.genres.join(', ')}</dd>
            </div>
          )}
        </div>
      </div>

      {/* Copy Status */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Copies{totalCopies > 0 && ` (${totalCopies} in this library)`}
          </h2>
          {totalCopies > 0 && (
            <span className="text-sm text-slate-500">
              {availableCopies} of {totalCopies} available
            </span>
          )}
        </div>

        {/* Place Hold button - patrons only when all checked out */}
        {isPatron && allCheckedOut && !userHasHold && (
          <div>
            {!user ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                <p className="text-sm text-slate-600 mb-2">
                  All copies are currently checked out.
                </p>
                <Link
                  href="/signin"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Sign in to place a hold →
                </Link>
              </div>
            ) : (
              <div>
                <button
                  onClick={handlePlaceHold}
                  disabled={placeHoldLoading}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {placeHoldLoading ? 'Placing hold...' : 'Place Hold'}
                </button>
                {placeHoldSuccess && (
                  <p className="mt-2 text-sm text-green-600">{placeHoldSuccess}</p>
                )}
                {holdPosition !== null && holdPosition > 1 && (
                  <p className="mt-1 text-xs text-slate-500">
                    There are {holdPosition - 1} person{holdPosition - 1 !== 1 ? 's' : ''} ahead of you in the queue.
                  </p>
                )}
                {placeHoldError && (
                  <p className="mt-2 text-sm text-red-600">{placeHoldError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Already have a hold notice */}
        {isPatron && user && userHasHold && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800 font-medium">You have a hold on this book</p>
            <p className="text-xs text-amber-600 mt-1">Check your dashboard to see the status of your hold.</p>
          </div>
        )}

        {/* Copy list */}
        {totalCopies === 0 ? (
          <p className="text-sm text-slate-500">No copies registered yet.</p>
        ) : (
          <ul className="space-y-2">
            {copiesWithStatus.map((copy) => (
              <li
                key={copy.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status dot */}
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      copy.status === 'available'
                        ? 'bg-emerald-500'
                        : copy.status === 'checked_out'
                        ? 'bg-red-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">Copy</span>{' '}
                    <span className="text-slate-500">
                      #{copies.indexOf(copy) + 1}
                    </span>
                    {copy.barcode && (
                      <span className="text-slate-400 ml-2 font-mono text-xs">
                        {copy.barcode}
                      </span>
                    )}
                    {copy.location_name && (
                      <span className="text-slate-400 ml-2">
                        at {copy.location_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${CONDITION_COLORS[copy.condition] || 'bg-slate-100 text-slate-700'}`}>
                    {copy.condition}
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-0.5 text-xs font-medium ${
                      copy.status === 'available'
                        ? 'bg-emerald-100 text-emerald-700'
                        : copy.status === 'checked_out'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {copy.status === 'available'
                      ? 'Available'
                      : copy.status === 'checked_out'
                      ? 'Checked Out'
                      : 'On Hold'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Legend */}
        {totalCopies > 0 && (
          <div className="flex items-center gap-4 pt-2 border-t border-slate-100 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Available
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span> Checked Out
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> On Hold
            </span>
          </div>
        )}
      </div>

      {/* Staff: Edit link (keep existing admin interface) */}
      {isStaff && (
        <div className="flex gap-3">
          <Link
            href={`/books/${bookId}/edit`}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
          >
            Edit Book Details
          </Link>
        </div>
      )}
    </div>
  );
}
