"use client";

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

export default function AdminSettings() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [libraries, setLibraries] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const { user } = useAuth();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      // Load all users
      const { data: allUsers, error: usersErr } = await supabase
        .from("profiles")
        .select("id, name, email, role, created_at")
        .order("created_at", { ascending: true });

      // Load all libraries
      const { data: libs, error: libsErr } = await supabase
        .from("libraries")
        .select("id, name")
        .order("name");

      if (usersErr) console.error("Failed to load profiles:", usersErr.message);
      if (libsErr) console.error("Failed to load libraries:", libsErr.message);

      setUsers((allUsers ?? []) as PendingUser[]);
      setLibraries(libs ?? []);
    } catch (err) {
      console.error("Failed to load admin settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePromote = async (userId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: "system_admin" })
        .eq("id", userId);

      if (error) {
        showToast(`Failed to promote ${name}: ${error.message}`);
        return;
      }

      showToast(`${name} promoted to system admin.`);
      await loadData();
    } catch (err) {
      showToast(`Failed to promote ${name}.`);
    }
  };

  const handleDemote = async (userId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: "patron" })
        .eq("id", userId);

      if (error) {
        showToast(`Failed to demote ${name}: ${error.message}`);
        return;
      }

      showToast(`${name} demoted to patron.`);
      await loadData();
    } catch (err) {
      showToast(`Failed to demote ${name}.`);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Settings</h1>
        <p className="mt-2 text-sm text-slate-500">
          System-wide user management and settings.
        </p>
      </header>

      {toast && (
        <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
          {toast}
        </div>
      )}

      {/* Stats overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">👥</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${users.length}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Total Users</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">📚</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${libraries.length}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Libraries</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">🔧</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${users.filter(u => u.role === 'system_admin').length}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">System Admins</p>
        </div>
      </div>

      {/* All Users */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">All Users</h2>
        <p className="text-sm text-slate-500 mb-4">
          View and manage all registered users.
        </p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading users…</p>
        ) : users.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400">No users yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === 'system_admin'
                          ? 'bg-purple-100 text-purple-800'
                          : u.role === 'library_owner'
                          ? 'bg-blue-100 text-blue-800'
                          : u.role === 'librarian'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {u.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {u.role !== "system_admin" && (
                        <button
                          onClick={() => handlePromote(u.id, u.name || "User")}
                          className="text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded border border-purple-200 transition"
                        >
                          Promote to Admin
                        </button>
                      )}
                      {u.role === "system_admin" && (
                        <button
                          onClick={() => handleDemote(u.id, u.name || "User")}
                          className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 transition"
                        >
                          Demote
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Libraries */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Libraries</h2>
        <p className="text-sm text-slate-500 mb-4">
          Overview of all registered libraries.
        </p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading libraries…</p>
        ) : libraries.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400">No libraries yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {libraries.map((lib) => (
                  <tr key={lib.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {lib.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {lib.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
