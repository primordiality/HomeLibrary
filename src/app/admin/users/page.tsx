"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Profile } from "@/types/db";

type UserRow = Profile & { status?: string | null };

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalName, setModalName] = useState("");
  const [modalEmail, setModalEmail] = useState("");
  const [modalPassword, setModalPassword] = useState("");
  const [modalRole, setModalRole] = useState<Profile["role"]>("patron");
  const [skipConfirmation, setSkipConfirmation] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const selfId = user?.id;
  const adminCount = users.filter(u => u.role === "system_admin").length;

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, status, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setError(`Failed to load users: ${error.message}`);
        return;
      }
      setUsers((data ?? []) as UserRow[]);
    } catch (e) {
      setError("Network error loading users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAction = async (userId: string, name: string, action: "approve" | "suspend") => {
    const newStatus = action === "approve" ? "active" : "suspended";
    const actionLabel = action === "approve" ? "approved" : "suspended";

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus })
        .eq("id", userId);

      if (error) {
        setError(`Failed to ${action} user: ${error.message}`);
        return;
      }

      showToast(`${name} has been ${actionLabel}.`);
      await loadUsers();
    } catch (e) {
      setError(`Failed to ${action} user.`);
    }
  };

  const handleCreateUser = async () => {
    setError(null);

    if (!modalName.trim() || !modalEmail.trim() || !modalPassword.trim()) {
      setError("All fields are required.");
      return;
    }

    if (modalPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setCreating(true);

    try {
      // Use public signup (anon-key safe) then promote via profile update
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: modalEmail,
        password: modalPassword,
        options: { data: { display_name: modalName.trim(), role: modalRole } },
      });

      if (authErr) {
        if (authErr.message?.includes("already registered")) {
          setError("A user with this email already exists.");
          setCreating(false);
          return;
        }
        setError(`Failed to create user: ${authErr.message}`);
        setCreating(false);
        return;
      }

      if (authData?.user) {
        // The trigger creates the profile with role='patron', status='pending'
        // Update to the chosen role and auto-activate
        await supabase
          .from("profiles")
          .update({ role: modalRole, status: "active" })
          .eq("id", authData.user.id);

        showToast(`User "${modalName}" created as ${modalRole}.`);
      }

      setShowModal(false);
      setModalName("");
      setModalEmail("");
      setModalPassword("");
      setModalRole("patron");
      setSkipConfirmation(true);
      await loadUsers();
    } catch (e) {
      setError("Failed to create user. Check your connection.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage user accounts, approve registrations, and assign roles.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
        >
          Create User
        </button>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {toast && (
        <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg border border-green-200">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading users…</div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isPatron = u.role === "patron";
                  const isPending = u.status === "pending";
                  const isSuspended = u.status === "suspended";
                  const isActive = u.status === "active";

                  return (
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
                      <td className="px-4 py-3">
                        {isPending && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                            Pending
                          </span>
                        )}
                        {isActive && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800">
                            Suspended
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {isPatron && isPending && (
                          <button
                            onClick={() => handleAction(u.id, u.name || "User", "approve")}
                            className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded border border-green-200 transition"
                          >
                            Approve
                          </button>
                        )}
                        {isActive && u.id !== selfId && adminCount > 1 && (
                          <button
                            onClick={() => handleAction(u.id, u.name || "User", "suspend")}
                            className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 transition"
                          >
                            Suspend
                          </button>
                        )}
                        {isActive && (u.id === selfId || adminCount <= 1) && (
                          <span className="text-xs font-medium text-slate-400" title={u.id === selfId ? "You cannot suspend yourself" : "Need at least one active system admin"}>—</span>
                        )}
                        {isSuspended && u.id !== selfId && (
                          <button
                            onClick={() => handleAction(u.id, u.name || "User", "approve")}
                            className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded border border-amber-200 transition"
                          >
                            Re-activate
                          </button>
                        )}
                        {isSuspended && u.id === selfId && (
                          <span className="text-xs font-medium text-slate-400" title="Account suspended — contact another admin">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Create User</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={modalPassword}
                  onChange={(e) => setModalPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="At least 6 characters"
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={modalRole}
                  onChange={(e) => setModalRole(e.target.value as Profile["role"])}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="patron">Patron</option>
                  <option value="librarian">Librarian</option>
                  <option value="library_owner">Library Owner</option>
                  <option value="system_admin">System Admin</option>
                </select>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="skip-confirmation"
                  type="checkbox"
                  checked={skipConfirmation}
                  onChange={(e) => setSkipConfirmation(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="skip-confirmation" className="text-sm text-slate-600">
                  Skip admin approval (auto-approve)
                  {skipConfirmation && (
                    <span className="block text-xs text-slate-400 mt-1">
                      The user is auto-approved — they just need to confirm their email.
                    </span>
                  )}
                  {!skipConfirmation && (
                    <span className="block text-xs text-slate-400 mt-1">
                      Requires admin to manually approve in the Users list.
                    </span>
                  )}
                </label>
              </div>

              <p className="text-xs text-slate-400">
                To disable confirmation emails entirely, toggle{" "}
                <code className="text-slate-500">Confirm email</code> off in{" "}
                <code className="text-slate-500">Supabase Dashboard → Authentication → Settings</code>.
              </p>
            </div>

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                disabled={creating}
              >
                {creating ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
