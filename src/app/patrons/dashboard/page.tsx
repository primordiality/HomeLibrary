'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BookInfo {
  id: string;
  title: string | null;
  cover_url: string | null;
}

interface BorrowRow {
  id: string;
  patron_user_id: string;
  copy_id: string;
  checkout_date: string;
  due_date: string | null;
  return_date: string | null;
}

interface HoldRow {
  id: string;
  patron_user_id: string;
  book_id: string;
  library_id: string;
  status: string;
  created_at: string;
}

type TabType = 'current' | 'past';

export default function PatronDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const [activeBorrows, setActiveBorrows] = useState<BorrowRow[]>([]);
  const [pastBorrows, setPastBorrows] = useState<BorrowRow[]>([]);
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, BookInfo>>({});
  // copy_id → book_id mapping
  const [copyToBook, setCopyToBook] = useState<Record<string, string>>({});
  // book_id → holds queue (all waiting holds) for position calc
  const [bookHoldQueues, setBookHoldQueues] = useState<Record<string, HoldRow[]>>({});
  // Library name map
  const [libraryMap, setLibraryMap] = useState<Record<string, string>>({});

  const [activeTab, setActiveTab] = useState<TabType>('current');
  const [cancelHoldId, setCancelHoldId] = useState<string | null>(null);
  const [cancelHoldLoading, setCancelHoldLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        // 1. Load active borrows (no return_date)
        const { data: borrows, error: borrowsErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user.id)
          .is('return_date', null)
          .order('due_date', { ascending: true });

        if (borrowsErr) throw new Error(borrowsErr.message);
        const activeList: BorrowRow[] = (borrows ?? []) as BorrowRow[];
        setActiveBorrows(activeList);

        // 2. Load past borrows (return_date IS NOT NULL)
        const { data: pastData, error: pastErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user.id)
          .not('return_date', 'is', null)
          .order('return_date', { ascending: false })
          .limit(50);
        if (pastErr) throw new Error(pastErr.message);
        setPastBorrows((pastData ?? []) as BorrowRow[]);

        // 3. Load book_copies for the copies in these borrows (both active and past)
        const allBorrows = [...activeList, ...((pastData ?? []) as BorrowRow[])];
        const copyIds = allBorrows.map((b) => b.copy_id);
        const copyIdToBookId: Record<string, string> = {};
        if (copyIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('id, book_id')
            .in('id', copyIds);
          if (copies) {
            for (const c of copies) {
              copyIdToBookId[c.id] = c.book_id;
            }
          }
        }
        setCopyToBook(copyIdToBookId);

        // 4. Load books batch
        const bookIds = [...new Set(Object.values(copyIdToBookId))];
        const bMap: Record<string, BookInfo> = {};
        if (bookIds.length > 0) {
          const { data: books } = await supabase
            .from('books')
            .select('id, title, cover_url')
            .in('id', bookIds);
          if (books) {
            for (const b of books) {
              bMap[b.id] = b as BookInfo;
            }
          }
        }
        setBookMap(bMap);

        // 5. Load holds (waiting or accepted)
        const { data: holdsData, error: holdsErr } = await supabase
          .from('holds')
          .select('id, patron_user_id, book_id, library_id, status, created_at')
          .eq('patron_user_id', user.id)
          .in('status', ['waiting', 'accepted'])
          .order('created_at', { ascending: false });

        if (holdsErr) throw new Error(holdsErr.message);
        const userHolds = (holdsData ?? []) as HoldRow[];
        setHolds(userHolds);

        // Build book→holds queue for position calculation: load ALL waiting holds for each book
        const heldBookIds = [...new Set(userHolds.map(h => h.book_id))];
        const queueMap: Record<string, HoldRow[]> = {};
        if (heldBookIds.length > 0) {
          const { data: allHolds } = await supabase
            .from('holds')
            .select('id, patron_user_id, book_id, library_id, status, created_at')
            .in('book_id', heldBookIds)
            .eq('status', 'waiting')
            .order('created_at', { ascending: true });
          if (allHolds) {
            for (const h of allHolds as HoldRow[]) {
              if (!queueMap[h.book_id]) queueMap[h.book_id] = [];
              queueMap[h.book_id].push(h);
            }
          }
        }
        setBookHoldQueues(queueMap);

        // 6. Load library names
        if (heldBookIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('book_id, library_id')
            .in('book_id', heldBookIds);
          if (copies) {
            const libIds = [...new Set(copies.map(c => c.library_id))];
            if (libIds.length > 0) {
              const { data: libs } = await supabase
                .from('libraries')
                .select('id, name')
                .in('id', libIds);
              if (libs) {
                const lMap: Record<string, string> = {};
                for (const l of libs) {
                  lMap[l.id] = l.name;
                }
                setLibraryMap(lMap);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load patron dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  // Derived stats
  const today = new Date().toISOString().split('T')[0];
  const overdueBorrows = activeBorrows.filter(
    (b) => b.due_date && b.due_date < today
  );
  const activeCount = activeBorrows.length;
  const holdsCount = holds.length;
  const overdueCount = overdueBorrows.length;
  const pastCount = pastBorrows.length;

  // Pick-up ready holds (status = 'accepted')
  const readyHolds = holds.filter(h => h.status === 'accepted');

  function isOverdue(borrow: BorrowRow): boolean {
    return !!borrow.due_date && borrow.due_date < today;
  }

  function daysRemaining(dueDate: string | null): string {
    if (!dueDate) return 'No due date';
    const due = new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `${diff} day${diff !== 1 ? 's' : ''} remaining`;
  }

  function formatDisplayDate(isoStr: string): string {
    return new Date(isoStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function bookTitle(bookId: string): string {
    const book = bookMap[bookId];
    return book?.title || 'Untitled Book';
  }

  // Calculate hold position in queue
  function getHoldPosition(hold: HoldRow): number {
    const queue = bookHoldQueues[hold.book_id] || [];
    return queue.findIndex(h => h.id === hold.id) + 1;
  }

  // Days until hold expires (accepted holds expire 3 days after creation)
  function daysUntilHoldExpires(created_at: string): number {
    const created = new Date(created_at);
    const expires = new Date(created);
    expires.setDate(expires.getDate() + 3);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    expires.setHours(0, 0, 0, 0);
    return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  async function handleCancelHold(holdId: string): Promise<void> {
    setCancelHoldLoading(holdId);
    try {
      const { error } = await supabase
        .from('holds')
        .update({ status: 'cancelled' })
        .eq('id', holdId);

      if (error) {
        alert('Failed to cancel hold: ' + error.message);
      } else {
        // Update local state
        setHolds(prev => prev.filter(h => h.id !== holdId));
        // Refresh book queue for position updates
        const bookToHold = holds.find(h => h.id === holdId);
        if (bookToHold) {
          const { data: refreshedQueue } = await supabase
            .from('holds')
            .select('id, patron_user_id, book_id, library_id, status, created_at')
            .eq('book_id', bookToHold.book_id)
            .eq('status', 'waiting')
            .order('created_at', { ascending: true });
          if (refreshedQueue) {
            setBookHoldQueues(prev => ({ ...prev, [bookToHold.book_id]: refreshedQueue as HoldRow[] }));
          }
        }
        setCancelHoldId(null);
      }
    } catch (e: any) {
      alert('Failed to cancel hold: ' + e.message);
    } finally {
      setCancelHoldLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          View your active loans, holds, and borrowing activity.
        </p>
      </header>

      {/* Pick-up ready banner */}
      {readyHolds.length > 0 && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold text-green-800">Hold ready for pick-up!</p>
              <div className="mt-2 space-y-2">
                {readyHolds.map(hold => {
                  const daysLeft = daysUntilHoldExpires(hold.created_at);
                  return (
                    <div key={hold.id} className="flex items-center justify-between text-sm">
                      <div>
                        <Link
                          href={`/catalog/${hold.book_id}`}
                          className="font-medium text-green-800 hover:text-green-900 underline"
                        >
                          {bookTitle(hold.book_id)}
                        </Link>
                        {libraryMap && hold.library_id && libraryMap[hold.library_id] && (
                          <span className="text-green-600 ml-2">({libraryMap[hold.library_id]})</span>
                        )}
                      </div>
                      <div className="text-right">
                        {daysLeft > 0 ? (
                          <span className="text-green-700 font-medium">Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                        ) : daysLeft === 0 ? (
                          <span className="text-red-600 font-medium">Expires today!</span>
                        ) : (
                          <span className="text-red-600 font-medium">Expired</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-green-600 mt-2">
                Visit the library to pick up your book. When you return it, the next hold in the queue will be notified.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {/* Active Loans */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-indigo-600">
            {loading ? '—' : activeCount}
          </p>
          <p className="text-sm text-slate-500">Active Loans</p>
        </div>
        {/* Past Loans */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-slate-600">
            {loading ? '—' : pastCount}
          </p>
          <p className="text-sm text-slate-500">Past Loans</p>
        </div>
        {/* Holds */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-amber-600">
            {loading ? '—' : holdsCount}
          </p>
          <p className="text-sm text-slate-500">Holds</p>
        </div>
        {/* Overdue */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-red-600">
            {loading ? '—' : overdueCount}
          </p>
          <p className="text-sm text-slate-500">Overdue</p>
        </div>
      </div>

      {/* Active Loans with tabs */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">My Borrowing History</h2>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setActiveTab('current')}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                activeTab === 'current'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Current Loans
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                activeTab === 'past'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Past Loans
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : activeTab === 'current' ? (
          activeCount > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-3 pl-2">Book</th>
                    <th className="py-3">Checkout Date</th>
                    <th className="py-3">Due Date</th>
                    <th className="py-3">Status</th>
                    <th className="py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeBorrows.map((borrow) => {
                    const bookId = copyToBook[borrow.copy_id];
                    const overdue = isOverdue(borrow);
                    const days = borrow.due_date ? daysRemaining(borrow.due_date) : 'No due date';
                    return (
                      <tr key={borrow.id} className={`hover:bg-slate-50 ${overdue ? 'bg-red-50/50' : ''}`}>
                        <td className="py-3 pl-2">
                          {bookId ? (
                            <Link
                              href={`/catalog/${bookId}`}
                              className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                              {bookTitle(bookId)}
                            </Link>
                          ) : (
                            <span className="text-slate-400">Book not found</span>
                          )}
                        </td>
                        <td className="py-3 text-slate-600">
                          {formatDisplayDate(borrow.checkout_date)}
                        </td>
                        <td className="py-3">
                          {borrow.due_date ? (
                            <span className={overdue ? 'text-red-600 font-medium' : 'text-slate-600'}>
                              {formatDisplayDate(borrow.due_date)}
                            </span>
                          ) : (
                            <span className="text-slate-400">No due date set</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col gap-1">
                            {overdue ? (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 self-start">
                                Overdue
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 self-start">
                                Active
                              </span>
                            )}
                            <span className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                              {days}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/profile`}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Return
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-sm font-medium text-slate-600 mb-2">No active loans</p>
              <p className="text-sm text-slate-500">
                You don't currently have any books checked out. Browse the catalog to borrow!
              </p>
              <Link
                href="/catalog"
                className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Browse Catalog
              </Link>
            </div>
          )
        ) : (
          /* Past Loans tab */
          pastCount > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-3 pl-2">Book</th>
                    <th className="py-3">Checkout Date</th>
                    <th className="py-3">Return Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pastBorrows.map((borrow) => {
                    const bookId = copyToBook[borrow.copy_id];
                    return (
                      <tr key={borrow.id} className="hover:bg-slate-50">
                        <td className="py-3 pl-2">
                          {bookId ? (
                            <Link
                              href={`/catalog/${bookId}`}
                              className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                              {bookTitle(bookId)}
                            </Link>
                          ) : (
                            <span className="text-slate-400">Book not found</span>
                          )}
                        </td>
                        <td className="py-3 text-slate-600">
                          {formatDisplayDate(borrow.checkout_date)}
                        </td>
                        <td className="py-3 text-slate-600">
                          {borrow.return_date ? formatDisplayDate(borrow.return_date) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-sm font-medium text-slate-600">No past borrows</p>
              <p className="text-sm text-slate-500">Your returned books will appear here.</p>
            </div>
          )
        )}
      </section>

      {/* My Holds - Enhanced */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">My Holds</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : holdsCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pl-2">Book</th>
                  <th className="py-3">Status</th>
                  <th className="py-3 hidden sm:table-cell">Queue Position</th>
                  <th className="py-3 hidden sm:table-cell">Placed On</th>
                  <th className="py-3 hidden md:table-cell">Expires</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {holds.map((hold) => {
                  const position = getHoldPosition(hold);
                  const expiryDays = daysUntilHoldExpires(hold.created_at);
                  return (
                    <tr key={hold.id} className="hover:bg-slate-50">
                      <td className="py-3 pl-2">
                        <Link
                          href={`/catalog/${hold.book_id}`}
                          className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          {bookTitle(hold.book_id)}
                        </Link>
                        {libraryMap && hold.library_id && libraryMap[hold.library_id] && (
                          <div className="text-xs text-slate-400">{libraryMap[hold.library_id]}</div>
                        )}
                      </td>
                      <td className="py-3">
                        {hold.status === 'waiting' ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            Waiting (#{position})
                          </span>
                        ) : hold.status === 'accepted' ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            Ready to pick up
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            Cancelled
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-slate-600 hidden sm:table-cell">
                        {hold.status === 'waiting' ? (
                          <span className="font-medium">{position} of {bookHoldQueues[hold.book_id]?.length || 0}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-600 hidden sm:table-cell">
                        {formatDisplayDate(hold.created_at)}
                      </td>
                      <td className="py-3 text-slate-600 hidden md:table-cell">
                        {hold.status === 'accepted' ? (
                          expiryDays > 0 ? (
                            <span className="text-green-700">{expiryDays} day{expiryDays !== 1 ? 's' : ''} remaining</span>
                          ) : expiryDays === 0 ? (
                            <span className="text-red-600 font-medium">Expires today</span>
                          ) : (
                            <span className="text-red-600 font-medium">Expired</span>
                          )
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {hold.status === 'waiting' && cancelHoldId === hold.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleCancelHold(hold.id)}
                              disabled={cancelHoldLoading === hold.id}
                              className="bg-red-600 px-2 py-1 text-xs font-medium rounded text-white hover:bg-red-700 transition disabled:opacity-50"
                            >
                              {cancelHoldLoading === hold.id ? 'Cancelling...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setCancelHoldId(null)}
                              className="bg-slate-200 px-2 py-1 text-xs font-medium rounded text-slate-700 hover:bg-slate-300 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : hold.status === 'waiting' ? (
                          <button
                            onClick={() => setCancelHoldId(hold.id)}
                            className="text-sm text-red-600 hover:text-red-800 font-medium"
                          >
                            Cancel Hold
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {hold.status === 'accepted' ? 'Pick up at library' : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm font-medium text-slate-600 mb-2">No holds</p>
            <p className="text-sm text-slate-500">
              You don't have any active holds. Place a hold on a book from the catalog.
            </p>
            <Link
              href="/catalog"
              className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Browse Catalog
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
