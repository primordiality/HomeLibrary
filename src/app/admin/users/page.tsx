"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Profile, Library } from "@/types/db";

type AdminUserRow = Profile;

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<{ id: string; name: string } | null>(null);
  const [newRole, setNewRole] = useState<Profile["role"]>("patron");
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryDropdownOpen, setLibraryDropdownOpen] = useState(false);
  const [modalName, setModalName] = useState("");
  const [modalEmail, setModalEmail] = useState("");
  const [modalPassword, setModalPassword] = useState("");
  const [modalRole, setModalRole] = useState<Profile["role"]>("patron");
  const [sendInvite, setSendInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [changingRole, setChangingRole] = useState(false);
  const { user } = useAuth();
  const selfId = user?.id;
  const adminCount = users.filter(u => u.role === "system_admin").length;

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setError(`Failed to load users: ${error.message}`);
        return;
      }
      setUsers((data ?? []) as AdminUserRow[]);
    } catch (e) {
      setError("Network error loading users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Load libraries when role modal opens
  useEffect(() => {
    if (showRoleModal) {
      supabase
        .from("libraries")
        .select("*")
        .eq("is_archived", false)
        .order("name")
        .then(({ data }) => {
          if (data) setLibraries(data as Library[]);
        });
    }
  }, [showRoleModal]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateUser = async () => {
    setError(null);

    if (!modalName.trim() || !modalEmail.trim()) {
      setError("Name and email are required.");
      return;
    }

    if (!sendInvite && !modalPassword.trim()) {
      setError("Password is required when using manual password entry.");
      return;
    }

    if (!sendInvite && modalPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setCreating(true);

    try {
      const userMetadata = { display_name: modalName.trim(), role: modalRole };

      if (sendInvite) {
        // ── Invite via email (uses Edge Function with service role key) ──
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/send-invite`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
            body: JSON.stringify({ email: modalEmail, data: userMetadata }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          setError(`Failed to send invite: ${result.error}`);
          setCreating(false);
          return;
        }

        // Wait for auth trigger to create profile, then update role
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", modalEmail)
          .single();

        if (existingProfile) {
          await supabase
            .from("profiles")
            .update({ role: modalRole })
            .eq("id", existingProfile.id);
        } else {
          // Try to find user by email in auth.users
          const { data: authUsers } = await supabase.auth.admin.listUsers();
          const authUser = authUsers?.users.find((u: any) => u.email === modalEmail);
          if (authUser) {
            await supabase
              .from("profiles")
              .update({ role: modalRole })
              .eq("id", authUser.id);
          }
        }

        showToast(`Invite sent to "${modalName}" (${modalEmail}).`);
      } else {
        // ── Manual password: create via auth (uses anon key) ──
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: modalEmail,
          password: modalPassword,
          options: { data: userMetadata },
        });

        if (authErr) {
          if (authErr.message?.includes("already registered")) {
            setError("A user with this email already exists.");
          } else {
            setError(`Failed to create user: ${authErr.message}`);
          }
          setCreating(false);
          return;
        }

        if (authData?.user) {
          // The trigger creates the profile with role='patron'
          // Update to the chosen role
          await supabase
            .from("profiles")
            .update({ role: modalRole })
            .eq("id", authData.user.id);

          showToast(`User "${modalName}" created as ${modalRole}.`);
        }
      }

      setShowModal(false);
      setModalName("");
      setModalEmail("");
      setModalPassword("");
      setModalRole("patron");
      setSendInvite(false);
      await loadUsers();
    } catch (e) {
      setError("Failed to create user. Check your connection.");
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async () => {
    setError(null);
    if (!roleModalUser) return;

    setChangingRole(true);
    try {
      // If changing to library_owner, also assign the library
      if (newRole === "library_owner" && selectedLibraryId) {
        const { error: libErr } = await supabase
          .from("libraries")
          .update({ owner_id: roleModalUser.id })
          .eq("id", selectedLibraryId);

        if (libErr) {
          setError(`Failed to assign library owner: ${libErr.message}`);
          setChangingRole(false);
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", roleModalUser.id);

      if (error) {
        setError(`Failed to update role: ${error.message}`);
        setChangingRole(false);
        return;
      }

      showToast(`${roleModalUser.name || "User"} role changed to ${newRole.replace("_", " ")}.`);
      setShowRoleModal(false);
      setRoleModalUser(null);
      setNewRole("patron");
      setSelectedLibraryId(null);
      setLibrarySearch("");
      await loadUsers();
    } catch (e) {
      setError("Failed to update role. Check your connection.");
    } finally {
      setChangingRole(false);
    }
  };

  const filteredLibraries = libraries.filter(lib =>
    lib.name.toLowerCase().includes(librarySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage user accounts and assign roles.
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
                <th className="px-4 py-3">Registered</th>
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
                  const isSysAdmin = u.role === "system_admin";
                  const isSelf = u.id === selfId;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {u.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          isSysAdmin
                            ? "bg-purple-100 text-purple-800"
                            : u.role === "library_owner"
                            ? "bg-blue-100 text-blue-800"
                            : u.role === "librarian"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {u.role.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {!isSelf && (
                          <button
                            onClick={() => {
                              setRoleModalUser({ id: u.id, name: u.name || "" });
                              setNewRole(u.role || "patron");
                              setShowRoleModal(true);
                            }}
                            className="text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded border border-indigo-200 transition"
                          >
                            Change Role
                          </button>
                        )}
                        {isSelf && (
                          <span className="text-xs font-medium text-slate-400">You</span>
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
                  id="send-invite"
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="send-invite" className="text-sm text-slate-600">
                  Send invitation email (user sets their own password)
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

      {/* Change Role Modal */}
      {showRoleModal && roleModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Change Role</h2>
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setRoleModalUser(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Change role for <span className="font-medium text-slate-900">{roleModalUser.name || roleModalUser.id}</span>?
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Role</label>
              <select
                value={newRole}
                onChange={(e) => {
                  setNewRole(e.target.value as Profile["role"]);
                  if (e.target.value !== "library_owner") {
                    setSelectedLibraryId(null);
                    setLibrarySearch("");
                    setLibraryDropdownOpen(false);
                  }
                }}
                className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="patron">Patron</option>
                <option value="librarian">Librarian</option>
                <option value="library_owner">Library Owner</option>
                <option value="system_admin">System Admin</option>
              </select>
            </div>

            {newRole === "library_owner" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Assign Library
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search libraries..."
                    value={librarySearch}
                    onChange={(e) => {
                      setLibrarySearch(e.target.value);
                      setLibraryDropdownOpen(true);
                    }}
                    onFocus={() => setLibraryDropdownOpen(true)}
                    onClick={(e) => e.stopPropagation()}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setLibraryDropdownOpen(!libraryDropdownOpen)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {libraryDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredLibraries.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-400">No libraries found</div>
                      ) : (
                        filteredLibraries.map((lib) => (
                          <button
                            key={lib.id}
                            type="button"
                            onClick={() => {
                              setSelectedLibraryId(lib.id);
                              setLibrarySearch(lib.name);
                              setLibraryDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition ${
                              selectedLibraryId === lib.id ? "bg-blue-50 text-blue-700 font-medium" : ""
                            }`}
                          >
                            {lib.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {selectedLibraryId && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected: {libraries.find((l) => l.id === selectedLibraryId)?.name}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setRoleModalUser(null);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={changingRole}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                disabled={changingRole}
              >
                {changingRole ? "Updating…" : "Update Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
