'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

function PatronDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeBorrows, setActiveBorrows] = useState<BorrowRow[]>([]);
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, BookInfo>>({});
  const [copyToBook, setCopyToBook] = useState<Record<string, string>>({});

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

        // 2. Load book_copies for the copies in these borrows
        const copyIds = activeList.map((b) => b.copy_id);
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

        // 3. Load books batch
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

        // 4. Load holds (waiting or accepted)
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

  const today = new Date().toISOString().split('T')[0];
  const overdueBorrows = activeBorrows.filter(
    (b) => b.due_date && b.due_date < today
  );
  const activeCount = activeBorrows.length;
  const holdsCount = holds.length;
  const overdueCount = overdueBorrows.length;

  function isOverdue(borrow: BorrowRow): boolean {
    return !!borrow.due_date && borrow.due_date < today;
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-indigo-600">
            {loading ? '—' : activeCount}
          </p>
          <p className="text-sm text-slate-500">Active Loans</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-amber-600">
            {loading ? '—' : holdsCount}
          </p>
          <p className="text-sm text-slate-500">Holds</p>
        </div>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-red-600">
            {loading ? '—' : overdueCount}
          </p>
          <p className="text-sm text-slate-500">Overdue</p>
        </div>
      </div>

      {/* Active Loans */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">My Active Loans</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : activeCount > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-3 pl-2">Book</th>
                  <th className="py-3">Checkout Date</th>
                  <th className="py-3">Due Date</th>
                  <th className="py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeBorrows.map((borrow) => {
                  const bookId = copyToBook[borrow.copy_id];
                  const overdue = isOverdue(borrow);
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
                      <td className="py-3">
                        {borrow.due_date ? (
                          <span className={overdue ? 'text-red-600 font-medium' : 'text-slate-600'}>
                            {formatDisplayDate(borrow.due_date)}
                          </span>
                        ) : (
                          <span className="text-slate-400">No due date set</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {overdue ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            Active
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

function PersonalInfo({ user, profile }: { user: any; profile: any }) {
  const displayName = profile?.name || profile?.first_name
    ? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    : profile?.email || 'User';

  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Your Profile</h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Name</dt>
          <dd className="text-slate-900 font-medium">{displayName}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Email</dt>
          <dd className="text-slate-900 font-medium">{user?.email}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Role</dt>
          <dd className="text-slate-900 font-medium capitalize">{profile?.role || '—'}</dd>
        </div>
      </div>
    </section>
  );
}

function LibraryList({ libraries }: { libraries: Array<{ id: string; name: string; description?: string | null; owner_id?: string }> }) {
  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Your Libraries</h2>
        <Link href="/libraries" className="text-sm text-indigo-600 hover:underline">
          View all →
        </Link>
      </div>
      {libraries.length > 0 ? (
        <div className="space-y-3">
          {libraries.map((lib) => (
            <Link
              key={lib.id}
              href={`/libraries/${lib.id}/manage-books`}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
            >
              <div>
                <p className="font-medium text-slate-900">{lib.name}</p>
                {lib.description && (
                  <p className="text-xs text-slate-500">{lib.description}</p>
                )}
              </div>
              <span className="text-xs text-indigo-600 font-medium">Manage →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm font-medium text-slate-600 mb-2">No libraries yet</p>
          <p className="text-sm text-slate-500 mb-3">You don't own or manage any libraries.</p>
          <Link href="/libraries" className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
            Add Library
          </Link>
        </div>
      )}
    </section>
  );
}

function PatronActivity({
  user,
  activeBorrows,
  holds,
  bookMap,
  copyToBook,
  libraryMap,
  loading,
}: {
  user: any;
  activeBorrows: BorrowRow[];
  holds: HoldRow[];
  bookMap: Record<string, BookInfo>;
  copyToBook: Record<string, string>;
  libraryMap: Record<string, string>;
  loading: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const overdueBorrows = activeBorrows.filter((b) => b.due_date && b.due_date < today);
  const activeCount = activeBorrows.length;
  const holdsCount = holds.length;
  const overdueCount = overdueBorrows.length;
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

  return (
    <section className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">My Patron Activity</h2>

      {/* Pick-up ready banner */}
      {readyHolds.length > 0 && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">Hold ready for pick-up!</p>
              <div className="mt-1 space-y-1">
                {readyHolds.map(hold => (
                  <Link
                    key={hold.id}
                    href={`/catalog/${hold.book_id}`}
                    className="text-sm text-green-700 hover:text-green-900"
                  >
                    {bookTitle(hold.book_id)}
                    {libraryMap && hold.library_id && libraryMap[hold.library_id] && (
                      <span className="ml-1 text-green-600">({libraryMap[hold.library_id]})</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patron stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="text-xl font-bold tracking-tight text-indigo-600">{loading ? '—' : activeCount}</p>
          <p className="text-xs text-slate-500">Active Loans</p>
        </div>
        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="text-xl font-bold tracking-tight text-amber-600">{loading ? '—' : holdsCount}</p>
          <p className="text-xs text-slate-500">Holds</p>
        </div>
        <div className="rounded-lg border bg-slate-50 p-4">
          <p className="text-xl font-bold tracking-tight text-red-600">{loading ? '—' : overdueCount}</p>
          <p className="text-xs text-slate-500">Overdue</p>
        </div>
      </div>

      {/* Active Loans */}
      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : activeCount > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-3 pl-2">Book</th>
                <th className="py-3">Checkout Date</th>
                <th className="py-3">Due Date</th>
                <th className="py-3">Status</th>
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
                        <Link href={`/catalog/${bookId}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                          {bookTitle(bookId)}
                        </Link>
                      ) : (
                        <span className="text-slate-400">Book not found</span>
                      )}
                    </td>
                    <td className="py-3 text-slate-600">{formatDisplayDate(borrow.checkout_date)}</td>
                    <td className="py-3">
                      {borrow.due_date ? (
                        <span className={overdue ? 'text-red-600 font-medium' : 'text-slate-600'}>
                          {formatDisplayDate(borrow.due_date)}
                        </span>
                      ) : (
                        <span className="text-slate-400">No due date</span>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No active loans.</p>
      )}

      {/* Holds */}
      {loading ? (
        <p className="text-sm text-slate-500 mt-4">Loading...</p>
      ) : holdsCount > 0 ? (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-3 pl-2">Book</th>
                <th className="py-3 hidden sm:table-cell">Library</th>
                <th className="py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {holds.map((hold) => (
                <tr key={hold.id} className="hover:bg-slate-50">
                  <td className="py-3 pl-2">
                    <Link href={`/catalog/${hold.book_id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                      {bookTitle(hold.book_id)}
                    </Link>
                  </td>
                  <td className="py-3 text-slate-600 hidden sm:table-cell">
                    {libraryMap && hold.library_id ? libraryMap[hold.library_id] : '—'}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500 mt-4">No active holds.</p>
      )}
    </section>
  );
}

function StaffDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ libraries: 0, books: 0 });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [adminLibraries, setAdminLibraries] = useState<string[]>([]);
  const [userLibraries, setUserLibraries] = useState<Array<{ id: string; name: string; description?: string | null; owner_id?: string }>>([]);

  // Personal dashboard state
  const [activeBorrows, setActiveBorrows] = useState<BorrowRow[]>([]);
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [bookMap, setBookMap] = useState<Record<string, BookInfo>>({});
  const [copyToBook, setCopyToBook] = useState<Record<string, string>>({});
  const [libraryMap, setLibraryMap] = useState<Record<string, string>>({});

  // Determine which libraries this user can see / manages
  useEffect(() => {
    async function fetchLibraryScope() {
      if (profile?.role === 'system_admin') return;

      // For library_owner and librarian, fetch their library IDs
      const { data: members } = await supabase
        .from('library_members')
        .select('library_id')
        .eq('user_id', user?.id)
        .in('role', ['library_owner', 'librarian']);

      if (members) {
        setAdminLibraries(members.map((m) => m.library_id));
      }
    }

    fetchLibraryScope();
  }, [user, profile]);

  useEffect(() => {
    async function loadCounts() {
      try {
        // Count non-archived libraries
        const { count: libCount } = await supabase
          .from("libraries")
          .select("id", { count: "exact" })
          .eq("is_archived", false);

        // Count total unique books
        const { count: bookCount } = await supabase
          .from("books")
          .select("id", { count: "exact" });

        setStats({
          libraries: libCount ?? 0,
          books: bookCount ?? 0,
        });
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }

    async function loadRecentActivity() {
      try {
        // Load last 50 borrows and holds combined (give ourselves room to filter)
        const [{ data: borrows }, { data: holds }] = await Promise.all([
          supabase
            .from('borrows')
            .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
            .order('checkout_date', { ascending: false })
            .limit(50),
          supabase
            .from('holds')
            .select('id, patron_user_id, book_id, library_id, status, created_at')
            .order('created_at', { ascending: false })
            .limit(50),
        ]);

        // If not system_admin, filter by library scope
        let filteredBorrows = borrows ?? [];
        let filteredHolds = holds ?? [];

        if (profile?.role !== 'system_admin' && adminLibraries.length > 0) {
          // Filter holds by library_id
          filteredHolds = filteredHolds.filter((h: any) =>
            adminLibraries.includes(h.library_id)
          );

          // Filter borrows: need to get library_id from book_copies via copy_id
          const filteredCopyIds = filteredBorrows.map((b: any) => b.copy_id);
          if (filteredCopyIds.length > 0) {
            const { data: copies } = await supabase
              .from('book_copies')
              .select('id, library_id')
              .in('id', filteredCopyIds);

            const allowedCopyIds = new Set<string>();
            if (copies) {
              for (const c of copies) {
                if (adminLibraries.includes(c.library_id)) {
                  allowedCopyIds.add(c.id);
                }
              }
            }
            filteredBorrows = filteredBorrows.filter((b: any) =>
              allowedCopyIds.has(b.copy_id)
            );
          }
        }

        // Gather all patron_user_ids from both borrows and holds
        const patronIds = [
          ...new Set([
            ...filteredBorrows.map((b: any) => b.patron_user_id),
            ...filteredHolds.map((h: any) => h.patron_user_id),
          ]),
        ];

        // Batch fetch all patron names
        const patronsMap: Record<string, string> = {};
        if (patronIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', patronIds);

          if (profiles) {
            for (const p of profiles) {
              patronsMap[p.id] = p.name || p.email || 'Unknown';
            }
          }
        }

        // Get library names for borrows (via book_copies) and holds
        const libraryIds = new Set<string>();

        // Holds have library_id directly
        filteredHolds.forEach((h: any) => {
          if (h.library_id) libraryIds.add(h.library_id);
        });

        // Borrows need library_id from book_copies
        const copyIds = filteredBorrows.map((b: any) => b.copy_id);
        if (copyIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('id, library_id')
            .in('id', copyIds);

          if (copies) {
            copies.forEach((c: any) => libraryIds.add(c.library_id));
          }
        }

        const libraryMap: Record<string, string> = {};
        if (libraryIds.size > 0) {
          const { data: libraries } = await supabase
            .from('libraries')
            .select('id, name')
            .in('id', [...libraryIds]);

          if (libraries) {
            for (const lib of libraries) {
              libraryMap[lib.id] = lib.name || 'Unknown Library';
            }
          }
        }

        // Build copy_id -> library_id map
        const copyToLibrary: Record<string, string> = {};
        if (copyIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('id, library_id')
            .in('id', copyIds);

          if (copies) {
            for (const c of copies) {
              copyToLibrary[c.id] = c.library_id;
            }
          }
        }

        // Build copy_id -> book_id map for borrows
        const copyToBook: Record<string, string> = {};
        if (copyIds.length > 0) {
          const { data: copies } = await supabase
            .from('book_copies')
            .select('id, book_id')
            .in('id', copyIds);

          if (copies) {
            for (const c of copies) {
              copyToBook[c.id] = c.book_id;
            }
          }
        }

        // Build book titles for borrows
        const bookIdsFromBorrows = [...new Set(Object.values(copyToBook))];
        const bookMapFromBorrows: Record<string, string> = {};
        if (bookIdsFromBorrows.length > 0) {
          const { data: books } = await supabase
            .from('books')
            .select('id, title')
            .in('id', bookIdsFromBorrows);

          if (books) {
            for (const b of books) {
              bookMapFromBorrows[b.id] = b.title || 'Untitled';
            }
          }
        }

        // Build book titles for holds
        const heldBookIds = filteredHolds.map((h: any) => h.book_id);
        const bookMapFromHolds: Record<string, string> = {};
        if (heldBookIds.length > 0) {
          const { data: books } = await supabase
            .from('books')
            .select('id, title')
            .in('id', heldBookIds);

          if (books) {
            for (const b of books) {
              bookMapFromHolds[b.id] = b.title || 'Untitled';
            }
          }
        }

        // Build activity entries
        const entries: any[] = [];

        // Borrows
        for (const b of filteredBorrows) {
          const bookId = copyToBook[b.copy_id];
          const bookTitle = bookMapFromBorrows[bookId] || 'Untitled';
          const libraryId = copyToLibrary[b.copy_id];
          const libraryName = libraryMap[libraryId] || 'Unknown Library';
          const isReturn = !!b.return_date;

          entries.push({
            type: isReturn ? 'return' : 'checkout',
            patron_name: patronsMap[b.patron_user_id] || 'Unknown',
            book_title: bookTitle,
            library_name: libraryName,
            date: b.checkout_date,
          });
        }

        // Holds
        for (const h of filteredHolds) {
          const bookTitle = bookMapFromHolds[h.book_id] || 'Untitled';
          const libraryName = libraryMap[h.library_id] || 'Unknown Library';

          entries.push({
            type: h.status,
            patron_name: patronsMap[h.patron_user_id] || 'Unknown',
            book_title: bookTitle,
            library_name: libraryName,
            date: h.created_at,
          });
        }

        // Sort by date descending, take latest 20
        entries.sort((a, b) => b.date.localeCompare(a.date));
        setRecentActivity(entries.slice(0, 20));
      } catch (err) {
        console.error('Failed to load recent activity:', err);
      }
    }

    async function loadUserLibraries() {
      try {
        // Fetch libraries this user owns
        const { data: owned } = await supabase
          .from('libraries')
          .select('id, name, description, owner_id')
          .eq('owner_id', user?.id);

        // Fetch libraries this user manages via library_members
        const { data: managed } = await supabase
          .from('library_members')
          .select('library_id, role')
          .eq('user_id', user?.id)
          .in('role', ['library_owner', 'librarian']);

        // Combine: owned + managed (dedup by id)
        const allLibs = new Map<string, { id: string; name: string; description?: string | null; owner_id?: string }>();
        if (owned) {
          for (const lib of owned) {
            allLibs.set(lib.id, { id: lib.id, name: lib.name, description: lib.description, owner_id: lib.owner_id });
          }
        }
        if (managed) {
          for (const m of managed) {
            if (!allLibs.has(m.library_id)) {
              const { data: lib } = await supabase
                .from('libraries')
                .select('id, name, description, owner_id')
                .eq('id', m.library_id)
                .single();
              if (lib) {
                allLibs.set(m.library_id, { id: lib.id, name: lib.name, description: lib.description, owner_id: lib.owner_id });
              }
            }
          }
        }
        setUserLibraries([...allLibs.values()]);
      } catch (err) {
        console.error('Failed to load user libraries:', err);
      }
    }

    async function loadPersonalPatronData() {
      try {
        // 1. Load active borrows
        const { data: borrows, error: borrowsErr } = await supabase
          .from('borrows')
          .select('id, patron_user_id, copy_id, checkout_date, due_date, return_date')
          .eq('patron_user_id', user?.id)
          .is('return_date', null)
          .order('due_date', { ascending: true });

        if (!borrowsErr) {
          const activeList: BorrowRow[] = (borrows ?? []) as BorrowRow[];
          setActiveBorrows(activeList);

          // 2. Load copy → book mapping
          const copyIds = activeList.map((b) => b.copy_id);
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

          // 3. Load books
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

          // 4. Load holds
          const { data: holdsData } = await supabase
            .from('holds')
            .select('id, patron_user_id, book_id, library_id, status, created_at')
            .eq('patron_user_id', user?.id)
            .in('status', ['waiting', 'accepted'])
            .order('created_at', { ascending: false });
          setHolds((holdsData ?? []) as HoldRow[]);

          // 5. Load library names for holds
          const heldBookIds = [...new Set((holdsData ?? []).map((h: HoldRow) => h.book_id))];
          if (heldBookIds.length > 0) {
            const { data: copies } = await supabase
              .from('book_copies')
              .select('book_id, library_id')
              .in('book_id', heldBookIds);
            if (copies) {
              const libIds = [...new Set(copies.map((c: any) => c.library_id))];
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
        }
      } catch (err) {
        console.error('Failed to load personal patron data:', err);
      }
    }

    loadCounts();
    loadRecentActivity();
    loadUserLibraries();
    loadPersonalPatronData();
  }, []);

  function formatDisplayDate(isoStr: string): string {
    return new Date(isoStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function activityLabel(type: string): { text: string; color: string } {
    switch (type) {
      case 'checkout': return { text: 'Checked out', color: 'text-blue-700' };
      case 'return': return { text: 'Returned', color: 'text-green-700' };
      case 'waiting': return { text: 'Hold placed (waiting)', color: 'text-amber-700' };
      case 'accepted': return { text: 'Hold accepted (ready)', color: 'text-green-700' };
      default: return { text: type, color: 'text-slate-700' };
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your personal library and borrowings.</p>
      </header>

      {/* Personal info + Libraries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PersonalInfo user={user} profile={profile} />
        <LibraryList libraries={userLibraries} />
      </div>

      {/* Your patron activity (active loans + holds) */}
      <PatronActivity
        user={user}
        activeBorrows={activeBorrows}
        holds={holds}
        bookMap={bookMap}
        copyToBook={copyToBook}
        libraryMap={libraryMap}
        loading={loading}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Libraries count */}
        <Link href="/libraries"
          className={`rounded-xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${loading ? 'pointer-events-none opacity-70' : ''}`}>
          <div className="flex items-center justify-between">
            <span className="text-2xl">📚</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${stats.libraries}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Libraries</p>
        </Link>

        {/* Books count */}
        <Link href="/catalog"
          className={`rounded-xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${loading ? 'pointer-events-none opacity-70' : ''}`}>
          <div className="flex items-center justify-between">
            <span className="text-2xl">📖</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${stats.books}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Books</p>
        </Link>

        {/* Analytics */}
        <Link href="/analytics"
          className={`rounded-xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}>
          <div className="flex items-center justify-between">
            <span className="text-2xl">📊</span>
            <span className="text-3xl font-bold tracking-tight">—</span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Analytics</p>
        </Link>
      </div>

      {/* Quick actions */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/catalog?scan=1" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
            🤖 Scan ISBN Barcode
          </Link>
          <Link href="/libraries?new=1" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
            ➕ Add Library
          </Link>
        </div>
      </section>

      {/* Recent activity */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {recentActivity.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-3 pl-2">User</th>
                <th className="pb-3">Action</th>
                <th className="pb-3 hidden lg:table-cell">Library</th>
                <th className="pb-3 hidden sm:table-cell">Book</th>
                <th className="pb-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentActivity.map((activity, index) => {
                const label = activityLabel(activity.type);
                return (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="py-3 pl-2 text-slate-900">{activity.patron_name || 'Unknown'}</td>
                    <td className="py-3">
                      <span className={`font-medium ${label.color}`}>{label.text}</span>
                    </td>
                    <td className="py-3 hidden lg:table-cell text-slate-600">{activity.library_name}</td>
                    <td className="py-3 hidden sm:table-cell text-slate-600">{activity.book_title}</td>
                    <td className="py-3 text-right text-slate-500">{formatDisplayDate(activity.date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-3 pl-2">User</th>
                <th className="pb-3">Action</th>
                <th className="pb-3 hidden lg:table-cell">Library</th>
                <th className="pb-3 hidden sm:table-cell">Book</th>
                <th className="pb-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-slate-400">
                  No recent activity to display.
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Due soon / nudge section */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          📅 Nudges Due Soon
        </h2>
        <p className="text-sm text-slate-500 mb-4">Soft reminders — not enforced deadlines.</p>
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="pb-3 pl-2">Patron</th>
              <th className="pb-3">Book</th>
              <th className="pb-3">Nudge Date</th>
              <th className="pb-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td colSpan={4} className="py-8 text-center text-sm text-slate-400">
                No upcoming nudge due soon.
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/signin');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        </header>
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Route patrons to their dashboard
  if (profile?.role === 'patron') {
    return <PatronDashboard />;
  }

  // All other roles (system_admin, library_owner, librarian) get the staff dashboard
  return <StaffDashboard />;
}
