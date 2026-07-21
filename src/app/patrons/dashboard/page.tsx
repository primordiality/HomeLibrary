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

  const [activeTab, setActiveTab] = useState<TabType>('current');

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
          .select('id, patron_user_id, book_id, status, created_at')
          .eq('patron_user_id', user.id)
          .in('status', ['waiting', 'accepted'])
          .order('created_at', { ascending: false });

        if (holdsErr) throw new Error(holdsErr.message);
        setHolds((holdsData ?? []) as HoldRow[]);
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          View your active loans, holds, and borrowing activity.
        </p>
      </header>

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

      {/* My Holds */}
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
                  <th className="py-3 hidden sm:table-cell">Placed On</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {holds.map((hold) => (
                  <tr key={hold.id} className="hover:bg-slate-50">
                    <td className="py-3 pl-2">
                      <Link
                        href={`/catalog/${hold.book_id}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        {bookTitle(hold.book_id)}
                      </Link>
                    </td>
                    <td className="py-3">
                      {hold.status === 'waiting' ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          Waiting
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Accepted
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-slate-600 hidden sm:table-cell">
                      {formatDisplayDate(hold.created_at)}
                    </td>
                  </tr>
                ))}
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
