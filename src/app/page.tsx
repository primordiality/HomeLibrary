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

function StaffDashboard() {
  const [stats, setStats] = useState({ libraries: 0, books: 0 });
  const [loading, setLoading] = useState(true);

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
    loadCounts();
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your personal library and borrowings.</p>
      </header>

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
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="pb-3 pl-2">User</th>
              <th className="pb-3">Action</th>
              <th className="pb-3 hidden sm:table-cell">Book</th>
              <th className="pb-3 text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td colSpan={4} className="py-8 text-center text-sm text-slate-400">
                No recent activity to display.
              </td>
            </tr>
          </tbody>
        </table>
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
