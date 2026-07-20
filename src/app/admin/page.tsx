"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type PendingUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  created_at: string;
};

export default function AdminPage() {
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [librariesWithRegistration, setLibrariesWithRegistration] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const loadStats = useCallback(async () => {
    try {
      // Count pending users
      const { count: pending } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("status", "pending");

      // Count all users
      const { count: total } = await supabase
        .from("profiles")
        .select("id", { count: "exact" });

      // Count libraries with public registration enabled
      const { count: regLibs } = await supabase
        .from("library_settings")
        .select("library_id", { count: "exact" })
        .eq("allow_public_registration", true);

      setPendingCount(pending ?? 0);
      setTotalCount(total ?? 0);
      setLibrariesWithRegistration(regLibs ?? 0);
    } catch (err) {
      console.error("Failed to load admin stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">System administration overview and quick actions.</p>
      </header>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">👥</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${totalCount}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Total Users</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">⏳</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${pendingCount}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Pending Approval</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">🔓</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${librariesWithRegistration}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Libraries with Public Registration</p>
        </div>
      </div>

      {/* Quick actions */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/users" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
            👥 Manage Users
          </Link>
          <Link href="/admin/settings" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
            ⚙️ Global Settings
          </Link>
        </div>
      </section>

      {/* Pending users preview */}
      {pendingCount > 0 && (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pending Users</h2>
            <Link href="/admin/users" className="text-sm text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  There {pendingCount === 1 ? "is" : "are"} {pendingCount} pending user{pendingCount !== 1 ? "s" : ""} awaiting approval.
                </p>
                <Link href="/admin/users" className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 border border-amber-200 hover:bg-amber-100">
                  Go to User Management → Approve pending users
                </Link>
              </>
            )}
          </div>
        </section>
      )}

      {/* System information */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">System Information</h2>
        <div className="space-y-2 text-sm text-slate-600">
          <p>• Public registration is enabled for {librariesWithRegistration} library{librariesWithRegistration !== 1 ? "ies" : "y"}.</p>
          <p>• Registered users can sign up at <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">/register</code> when registration is enabled.</p>
          <p>• Admin can toggle registration per library from the library edit page.</p>
          <p>• Users created via invite receive an email link to set their password.</p>
        </div>
      </section>
    </div>
  );
}
