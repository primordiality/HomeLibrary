'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface BorrowRow {
  id: string;
  copy_id: string;
  checkout_date: string;
  due_date: string | null;
  return_date: string | null;
}

interface BookInfo {
  id: string;
  title: string | null;
  cover_url: string | null;
}

type TabType = 'current' | 'past';

export default function ProfilePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentBorrows, setCurrentBorrows] = useState<BorrowRow[]>([]);
  const [pastBorrows, setPastBorrows] = useState<BorrowRow[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, BookInfo>>({});
  const [copyToBook, setCopyToBook] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabType>('current');

  useEffect(() => {
    if (!user || authLoading) return;

    async function loadData() {
      setLoading(true);
      try {
        // Load active borrows
        const { data: activeData, error: activeErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user.id)
          .is('return_date', null)
          .order('due_date', { ascending: true });

        if (activeErr) throw new Error(activeErr.message);
        const activeList: BorrowRow[] = (activeData ?? []) as BorrowRow[];
        setCurrentBorrows(activeList);

        // Load past borrows
        const { data: pastData, error: pastErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user.id)
          .not('return_date', 'is', null)
          .order('return_date', { ascending: false })
          .limit(50);
        if (pastErr) throw new Error(pastErr.message);
        setPastBorrows((pastData ?? []) as BorrowRow[]);

        // Load copy → book mappings
        const allBorrows = [...activeList, ...((pastData ?? []) as BorrowRow[])];
        const copyIds = allBorrows.map((b) => b.copy_id);
        if (copyIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('id, book_id')
            .in('id', copyIds);
          if (copies) {
            const map: Record<string, string> = {};
            for (const c of copies) {
              map[c.id] = c.book_id;
            }
            setCopyToBook(map);
          }
        }

        // Load book info
        const bookIds = [...new Set(Object.values(copyToBook))];
        if (bookIds.length > 0) {
          const { data: books } = await supabase
            .from('books')
            .select('id, title, cover_url')
            .in('id', bookIds);
          if (books) {
            const bMap: Record<string, BookInfo> = {};
            for (const b of books) {
              bMap[b.id] = b as BookInfo;
            }
            setBookMap(bMap);
          }
        }
      } catch (err: any) {
        console.error('Failed to load profile data:', err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, authLoading]);

  const today = new Date().toISOString().split('T')[0];

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

  function coverUrl(bookId: string): string | null {
    const book = bookMap[bookId];
    return book?.cover_url || null;
  }

  async function handleReturn(borrowId: string) {
    setReturnLoading(true);
    setReturningId(borrowId);
    setReturnSuccess(null);
    try {
      const { error } = await supabase
        .from('borrows')
        .update({ return_date: new Date().toISOString() })
        .eq('id', borrowId);

      if (error) {
        alert('Failed to return book: ' + error.message);
      } else {
        setReturnSuccess('Book returned successfully!');
        setTimeout(() => setReturnSuccess(null), 3000);
        // Refresh borrows
        if (user) {
          const { data: activeData } = await supabase
            .from('borrows')
            .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
            .eq('patron_user_id', user.id)
            .is('return_date', null)
            .order('due_date', { ascending: true });
          setCurrentBorrows((activeData ?? []) as BorrowRow[]);
        }
      }
    } catch (err: any) {
      console.error('Return failed:', err.message);
    } finally {
      setReturnLoading(false);
      setReturningId(null);
    }
  }

  const displayName = profile?.name || profile?.first_name
    ? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    : profile?.email || 'User';

  if (loading || authLoading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Profile</h1>
          <p className="mt-2 text-sm text-slate-500">Please sign in to view your profile.</p>
          <Link href="/signin" className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800">
            Sign In →
          </Link>
        </header>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Profile Info */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Name</dt>
            <dd className="text-slate-900 font-medium">{displayName}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900 font-medium">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="text-slate-900 font-medium capitalize">{profile?.role || '—'}</dd>
          </div>
        </div>
      </section>

      {/* Borrowing History */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Borrowing History</h2>
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

        {activeTab === 'current' ? (
          currentBorrows.length > 0 ? (
            <div className="space-y-3">
              {returnSuccess && (
                <p className="text-sm text-green-600 font-medium">{returnSuccess}</p>
              )}
              {currentBorrows.map((borrow) => {
                const bookId = copyToBook[borrow.copy_id];
                const overdue = isOverdue(borrow);
                const days = borrow.due_date ? daysRemaining(borrow.due_date) : 'No due date';
                return (
                  <div
                    key={borrow.id}
                    className={`flex items-center gap-4 rounded-lg border p-3 ${
                      overdue ? 'border-red-200 bg-red-50/50' : 'border-slate-200'
                    }`}
                  >
                    {/* Cover */}
                    {coverUrl(bookId || '') && (
                      <img
                        src={coverUrl(bookId || '')!}
                        alt=""
                        className="w-10 h-14 object-cover rounded shadow-sm"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/catalog/${bookId}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800 text-sm"
                      >
                        {bookTitle(bookId || '')}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Checked out {formatDisplayDate(borrow.checkout_date)}</span>
                        <span>•</span>
                        <span className={overdue ? 'text-red-500 font-medium' : ''}>
                          {borrow.due_date ? formatDisplayDate(borrow.due_date) : 'No due date'}
                        </span>
                      </div>
                      <div className={`text-xs mt-1 font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
                        {days}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {overdue && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Overdue
                        </span>
                      )}
                      <button
                        onClick={() => handleReturn(borrow.id)}
                        disabled={returnLoading && returningId === borrow.id}
                        className={`text-xs font-medium rounded px-3 py-1.5 transition ${
                          overdue
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        } disabled:opacity-50`}
                      >
                        {returnLoading && returningId === borrow.id ? 'Returning...' : 'Return'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-sm font-medium text-slate-600 mb-2">No active loans</p>
              <p className="text-sm text-slate-500">
                You don't currently have any books checked out.
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
          /* Past Loans */
          pastBorrows.length > 0 ? (
            <div className="space-y-3">
              {pastBorrows.map((borrow) => {
                const bookId = copyToBook[borrow.copy_id];
                return (
                  <div key={borrow.id} className="flex items-center gap-4 rounded-lg border border-slate-200 p-3">
                    {/* Cover */}
                    {coverUrl(bookId || '') && (
                      <img
                        src={coverUrl(bookId || '')!}
                        alt=""
                        className="w-10 h-14 object-cover rounded shadow-sm"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/catalog/${bookId}`}
                        className="font-medium text-slate-900 text-sm"
                      >
                        {bookTitle(bookId || '')}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Checked out {formatDisplayDate(borrow.checkout_date)}</span>
                        <span>•</span>
                        <span>Returned {borrow.return_date ? formatDisplayDate(borrow.return_date) : '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-sm font-medium text-slate-600">No past borrows</p>
              <p className="text-sm text-slate-500">Your returned books will appear here.</p>
            </div>
          )
        )}
      </section>
    </div>
  );
}
