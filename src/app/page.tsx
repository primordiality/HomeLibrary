"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Dashboard() {
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

        // Count total unique books (not book_copies to avoid counting duplicates)
        const { count: bookCount } = await supabase
          .from("books")
          .select("id", { count: "exact" })
          .eq("is_archived", false);

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
            {/* No real activity yet — show a placeholder */}
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
            {/* No real nudges yet */}
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
