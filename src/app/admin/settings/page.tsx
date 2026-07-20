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

type RegLibrary = {
  library_id: string;
  library_name: string;
  allow_public_registration: boolean;
};

export default function AdminSettings() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [librariesWithRegistration, setLibrariesWithRegistration] = useState<RegLibrary[]>([]);
  const [libraryList, setLibraryList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [savingLibrary, setSavingLibrary] = useState<string | null>(null);
  const { user } = useAuth();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      // Load all pending users across all libraries
      const { data: pending } = await supabase
        .from("profiles")
        .select("id, name, email, role, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      // Load all libraries with their registration settings
      const { data: libs } = await supabase
        .from("libraries")
        .select("id, name")
        .order("name");

      const { data: settings } = await supabase
        .from("library_settings")
        .select("library_id, allow_public_registration");

      const settingsMap = new Map<string, boolean>();
      if (settings) {
        settings.forEach((s) => settingsMap.set(s.library_id, s.allow_public_registration));
      }

      const regLibraries: RegLibrary[] = [];
      if (libs) {
        libs.forEach((lib) => {
          regLibraries.push({
            library_id: lib.id,
            library_name: lib.name,
            allow_public_registration: settingsMap.get(lib.id) ?? false,
          });
        });
      }

      setPendingUsers((pending ?? []) as PendingUser[]);
      setLibraryList(libs ?? []);
      setLibrariesWithRegistration(regLibraries);
    } catch (err) {
      console.error("Failed to load admin settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (userId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("id", userId);

      if (error) {
        showToast(`Failed to approve ${name}: ${error.message}`);
        return;
      }

      showToast(`${name} has been approved.`);
      await loadData();
    } catch (err) {
      showToast(`Failed to approve ${name}.`);
    }
  };

  const handleSuspend = async (userId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "suspended" })
        .eq("id", userId);

      if (error) {
        showToast(`Failed to suspend ${name}: ${error.message}`);
        return;
      }

      showToast(`${name} has been suspended.`);
      await loadData();
    } catch (err) {
      showToast(`Failed to suspend ${name}.`);
    }
  };

  const handleToggleRegistration = async (libraryId: string, enabled: boolean) => {
    setSavingLibrary(libraryId);
    try {
      const { error } = await supabase
        .from("library_settings")
        .upsert(
          {
            library_id: libraryId,
            allow_public_registration: enabled,
          },
          { onConflict: "library_id" }
        );

      if (error) {
        showToast(`Failed to update settings: ${error.message}`);
        return;
      }

      showToast(`Registration ${enabled ? "enabled" : "disabled"} for library.`);
      await loadData();
    } catch (err) {
      showToast(`Failed to update settings.`);
    } finally {
      setSavingLibrary(null);
    }
  };

  const totalPending = pendingUsers.length;
  const totalLibraries = libraryList.length;
  const totalRegistered = librariesWithRegistration.filter(
    (l) => l.allow_public_registration
  ).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Global Admin Settings</h1>
        <p className="mt-2 text-sm text-slate-500">
          System-wide control center for user management and registration.
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
              {loading ? "—" : `${totalLibraries}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Total Libraries</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">🔓</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${totalRegistered}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Libraries with Public Registration</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-2xl">⏳</span>
            <span className="text-3xl font-bold tracking-tight">
              {loading ? "—" : `${totalPending}`}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">Users Pending Approval</p>
        </div>
      </div>

      {/* Library Registration Settings */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Library Registration Settings</h2>
        <p className="text-sm text-slate-500 mb-4">
          Control which libraries allow public registration. When enabled, users can sign up via /register.
        </p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading libraries…</p>
        ) : libraryList.length === 0 ? (
          <p className="text-sm text-slate-400">No libraries found.</p>
        ) : (
          <div className="space-y-3">
            {libraryList.map((lib) => {
              const settings = librariesWithRegistration.find(
                (l) => l.library_id === lib.id
              );
              const enabled = settings?.allow_public_registration ?? false;
              const isSaving = savingLibrary === lib.id;

              return (
                <div
                  key={lib.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{lib.name}</p>
                    <p className="text-xs text-slate-500">
                      Library ID: {lib.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {enabled ? "Public Registration ON" : "Public Registration OFF"}
                    </span>
                    <button
                      onClick={() => handleToggleRegistration(lib.id, !enabled)}
                      disabled={isSaving}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                        enabled
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      } disabled:opacity-50`}
                    >
                      {isSaving ? "Saving…" : enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pending Users */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Users Pending Approval</h2>
        <p className="text-sm text-slate-500 mb-4">
          All users who have registered but are awaiting admin approval.
        </p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading users…</p>
        ) : totalPending === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400">No pending users.</p>
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
                {pendingUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleApprove(u.id, u.name || "User")}
                        className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded border border-green-200 transition"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleSuspend(u.id, u.name || "User")}
                        className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 transition"
                      >
                        Suspend
                      </button>
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
