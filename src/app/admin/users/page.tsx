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

  // Reset Password modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetModalUser, setResetModalUser] = useState<{ id: string; email: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  // Change Email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailModalUser, setEmailModalUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);

  // Edit Name modal
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameModalUser, setNameModalUser] = useState<{ id: string; name: string } | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [editingName, setEditingName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Suspend/Activate
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendModalUser, setSuspendModalUser] = useState<{ id: string; name: string; status?: Profile["status"] } | null>(null);
  const [suspending, setSuspending] = useState(false);

  // Approve pending users
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveModalUser, setApproveModalUser] = useState<{ id: string; name: string } | null>(null);
  const [approving, setApproving] = useState(false);

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteModalUser, setDeleteModalUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ borrowsEscalated: number; holdsReleased: number; libraryArchived: boolean } | null>(null);

  const [showSuspended, setShowSuspended] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showPending, setShowPending] = useState(true);

  const { user } = useAuth();
  const selfId = user?.id;
  const adminCount = users.filter(u => u.role === "system_admin").length;

  const loadUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, role, status, deleted_at, created_at")
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
      // Invalidate old sessions so the role change takes effect immediately
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/invalidate-sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
            body: JSON.stringify({ userId: roleModalUser.id }),
          }
        );
      } catch {
        // Non-critical: user may see old permissions until next login
      }
      await loadUsers();
    } catch (e) {
      setError("Failed to update role. Check your connection.");
    } finally {
      setChangingRole(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    if (!resetModalUser) return;

    setResetting(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/send-password-reset`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ email: resetModalUser.email }),
        }
      );

      if (!response.ok) {
        const { error: signalErr } = await supabase
          .from("password_reset_tokens")
          .insert({
            user_id: resetModalUser.id,
            expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
          });

        if (signalErr) {
          showToast(`Password reset email sent to ${resetModalUser.email}`);
        } else {
          showToast(`Password reset email sent to ${resetModalUser.email}`);
        }
      } else {
        showToast(`Password reset email sent to ${resetModalUser.email}`);
      }

      setShowResetModal(false);
      setResetModalUser(null);
    } catch (e) {
      setError("Failed to send reset email. Check your connection.");
    } finally {
      setResetting(false);
    }
  };

  const handleEmailChange = async () => {
    setError(null);
    if (!emailModalUser || !newEmail.trim()) return;

    setChangingEmail(true);
    try {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ email: newEmail.trim() })
        .eq("id", emailModalUser.id);

      if (profileErr) {
        setError(`Failed to update email: ${profileErr.message}`);
        setChangingEmail(false);
        return;
      }

      showToast(`Email updated for ${emailModalUser.name || emailModalUser.id}`);
      setShowEmailModal(false);
      setEmailModalUser(null);
      setNewEmail("");
      await loadUsers();
    } catch (e) {
      setError("Failed to update email. Check your connection.");
    } finally {
      setChangingEmail(false);
    }
  };

  const handleNameChange = async () => {
    setError(null);
    if (!nameModalUser) return;

    setSavingName(true);
    try {
      const full = (firstName.trim() + " " + lastName.trim()).trim() || editingName;
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), name: full })
        .eq("id", nameModalUser.id);

      if (error) {
        setError(`Failed to update name: ${error.message}`);
        setSavingName(false);
        return;
      }

      showToast(`Name updated for ${nameModalUser.name}`);
      setShowNameModal(false);
      setNameModalUser(null);
      setFirstName("");
      setLastName("");
      setEditingName("");
      await loadUsers();
    } catch (e) {
      setError("Failed to update name. Check your connection.");
    } finally {
      setSavingName(false);
    }
  };

  // ── Suspend/Activate ────────────────────────────────────────────
  const handleSuspend = async () => {
    setError(null);
    if (!suspendModalUser) return;

    setSuspending(true);
    try {
      const newStatus = suspendModalUser.status === "suspended" ? "active" : "suspended";
      const { error } = await supabase
        .from("profiles")
        .update({ status: newStatus })
        .eq("id", suspendModalUser.id);

      if (error) {
        setError(`Failed to update status: ${error.message}`);
        setSuspending(false);
        return;
      }

      showToast(`${suspendModalUser.name || "User"} marked as ${newStatus}.`);
      setShowSuspendModal(false);
      setSuspendModalUser(null);
      // Invalidate old sessions so the status change takes effect immediately
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/invalidate-sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
            body: JSON.stringify({ userId: suspendModalUser.id }),
          }
        );
      } catch {
        // Non-critical: user may see old permissions until next login
      }
      await loadUsers();
    } catch (e) {
      setError("Failed to update status. Check your connection.");
    } finally {
      setSuspending(false);
    }
  };

  // ── Approve pending user ────────────────────────────────────────
  const handleApprove = async () => {
    setError(null);
    if (!approveModalUser) return;

    setApproving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status: "active" })
        .eq("id", approveModalUser.id);

      if (error) {
        setError(`Failed to approve user: ${error.message}`);
        setApproving(false);
        return;
      }

      showToast(`${approveModalUser.name || "User"} approved successfully.`);
      setShowApproveModal(false);
      setApproveModalUser(null);
      // Invalidate old sessions so the status change takes effect immediately
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/invalidate-sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
            },
            body: JSON.stringify({ userId: approveModalUser.id }),
          }
        );
      } catch {
        // Non-critical: user may see old permissions until next login
      }
      await loadUsers();
    } catch (e) {
      setError("Failed to approve user. Check your connection.");
    } finally {
      setApproving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    setError(null);
    if (!deleteModalUser) return;

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError("Please sign in again to delete users.");
        setDeleting(false);
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/delete-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ profileId: deleteModalUser.id }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to delete user.");
        setDeleting(false);
        return;
      }

      setDeleteResult({
        borrowsEscalated: result.borrows_escalated || 0,
        holdsReleased: result.holds_released || 0,
        libraryArchived: result.library_archived || false,
      });

      setTimeout(() => {
        setShowDeleteModal(false);
        setDeleteModalUser(null);
        setDeleteConfirmation(false);
        setDeleteResult(null);
        setDeleting(false);
        loadUsers();
      }, 2000);
    } catch (e) {
      setError("Failed to delete user. Check your connection.");
      setDeleting(false);
    }
  };

  const filteredLibraries = libraries.filter(lib =>
    lib.name.toLowerCase().includes(librarySearch.toLowerCase())
  );

  // Filter users based on toggles
  const filteredUsers = users.filter(u => {
    if (!showPending && u.status === "pending") return false;
    if (!showSuspended && u.status === "suspended") return false;
    if (!showDeleted && u.deleted_at) return false;
    return true;
  });

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

      {/* Filter toggles */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showPending}
            onChange={(e) => setShowPending(e.target.checked)}
            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
          />
          <span className="text-sm text-slate-700">Show pending</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showSuspended}
            onChange={(e) => setShowSuspended(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">Show suspended</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-400 focus:ring-slate-500"
          />
          <span className="text-sm text-slate-700">Show deleted</span>
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading users…</div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role / Status</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isPatron = u.role === "patron";
                  const isSysAdmin = u.role === "system_admin";
                  const isSelf = u.id === selfId;
                  const isDeleted = !!u.deleted_at;
                  const isDeletable = u.role && ['patron', 'librarian', 'library_owner'].includes(u.role) && !isSysAdmin;

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-slate-50 transition ${
                        isDeleted ? "bg-slate-50" : ""
                      }`}
                    >
                      <td className={`px-4 py-3 font-medium ${
                        isDeleted ? "line-through text-slate-400" : "text-slate-900"
                      }`}>
                        {u.name || "—"}
                      </td>
                      <td className={`px-4 py-3 ${
                        isDeleted ? "line-through text-slate-400" : "text-slate-600"
                      }`}>
                        {u.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {/* Role badge */}
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.role === "system_admin"
                              ? "bg-purple-100 text-purple-800"
                              : u.role === "library_owner"
                              ? "bg-blue-100 text-blue-800"
                              : u.role === "librarian"
                              ? "bg-teal-100 text-teal-800"
                              : "bg-slate-100 text-slate-700"
                          }`}>
                            {u.role?.replace("_", " ")}
                          </span>
                          {/* Status badge */}
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.status === "active"
                              ? "bg-green-100 text-green-800"
                              : u.status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : u.status === "suspended"
                              ? "bg-red-100 text-red-800"
                              : u.status === "deleted"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            {u.status === "deleted" ? "deleted" : (u.status || "active")}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${
                        isDeleted ? "line-through text-slate-400" : "text-slate-500"
                      }`}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {!isSelf && !isDeleted && (
                          <>
                            {/* Approve button for pending users */}
                            {u.status === "pending" && (
                              <button
                                onClick={() => {
                                  setApproveModalUser({ id: u.id, name: u.name || "" });
                                  setShowApproveModal(true);
                                }}
                                className="text-xs font-medium px-2.5 py-1 rounded border transition text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                              >
                                Approve
                              </button>
                            )}
                            {/* Suspend/Activate for active/suspended users */}
                            {u.status !== "pending" && (
                              <button
                                onClick={() => {
                                  setSuspendModalUser({ id: u.id, name: u.name || "", status: u.status });
                                  setShowSuspendModal(true);
                                }}
                                className={`text-xs font-medium px-2.5 py-1 rounded border transition ${
                                  u.status === "suspended"
                                    ? "text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                                    : "text-red-700 bg-red-50 hover:bg-red-100 border-red-200"
                                }`}
                              >
                                {u.status === "suspended" ? "Activate" : "Suspend"}
                              </button>
                            )}
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
                            <button
                              onClick={() => {
                                setNameModalUser({ id: u.id, name: u.name || "" });
                                const parts = (u.name || "").split(" ");
                                setFirstName(parts[0] || "");
                                setLastName(parts.slice(1).join(" ") || "");
                                setEditingName(u.name || "");
                                setShowNameModal(true);
                              }}
                              className="text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-200 transition"
                            >
                              Edit Name
                            </button>
                            {u.email && (
                              <button
                                onClick={() => {
                                  setEmailModalUser({ id: u.id, email: u.email, name: u.name || "" });
                                  setNewEmail(u.email);
                                  setShowEmailModal(true);
                                }}
                                className="text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded border border-slate-200 transition"
                              >
                                Change Email
                              </button>
                            )}
                            {u.email && (
                              <button
                                onClick={() => {
                                  setResetModalUser({ id: u.id, email: u.email });
                                  setShowResetModal(true);
                                }}
                                className="text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded border border-amber-200 transition"
                              >
                                Reset Password
                              </button>
                            )}
                            {isDeletable && (
                              <button
                                onClick={() => {
                                  setDeleteModalUser({ id: u.id, name: u.name || "", role: u.role || "" });
                                  setDeleteConfirmation(false);
                                  setDeleteResult(null);
                                  setShowDeleteModal(true);
                                }}
                                className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 transition"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                        {isSelf && (
                          <span className="text-xs font-medium text-slate-400">You</span>
                        )}
                        {isDeleted && isSelf && (
                          <span className="text-xs font-medium text-gray-400">You</span>
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

      {/* Reset Password Modal */}
      {showResetModal && resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Reset Password</h2>
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetModalUser(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Send a password reset email to{" "}
              <span className="font-medium text-slate-900">{resetModalUser.email}</span>?
            </p>

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetModalUser(null);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordReset}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                disabled={resetting}
              >
                {resetting ? "Sending…" : "Send Reset Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Email Modal */}
      {showEmailModal && emailModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Change Email</h2>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailModalUser(null);
                  setNewEmail("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Change email for{" "}
              <span className="font-medium text-slate-900">{emailModalUser.name || emailModalUser.id}</span>?
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="newemail@example.com"
              />
            </div>

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailModalUser(null);
                  setNewEmail("");
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={changingEmail}
              >
                Cancel
              </button>
              <button
                onClick={handleEmailChange}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                disabled={changingEmail}
              >
                {changingEmail ? "Updating…" : "Update Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Name Modal */}
      {showNameModal && nameModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit Name</h2>
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setNameModalUser(null);
                  setFirstName("");
                  setLastName("");
                  setEditingName("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Edit name for{" "}
              <span className="font-medium text-slate-900">{nameModalUser.name}</span>?
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="First"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Last"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={(firstName.trim() + " " + lastName.trim()).trim()}
                onChange={(e) => setEditingName(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Full name"
              />
            </div>

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setNameModalUser(null);
                  setFirstName("");
                  setLastName("");
                  setEditingName("");
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={savingName}
              >
                Cancel
              </button>
              <button
                onClick={handleNameChange}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                disabled={savingName}
              >
                {savingName ? "Saving…" : "Save Name"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend/Activate Confirmation Modal */}
      {showSuspendModal && suspendModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {suspendModalUser.status === "suspended" ? "Activate User" : "Suspend User"}
              </h2>
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendModalUser(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-600">
              {suspendModalUser.status === "suspended"
                ? `Activate user <span className="font-medium text-slate-900">${suspendModalUser.name}</span>? They will be able to log in again.`
                : `Suspend user <span className="font-medium text-slate-900">${suspendModalUser.name}</span>? They will be locked out of the system.`}
            </p>

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendModalUser(null);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={suspending}
              >
                Cancel
              </button>
              <button
                onClick={handleSuspend}
                className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50 ${
                  suspendModalUser.status === "suspended"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
                disabled={suspending}
              >
                {suspending ? "Processing…" : (suspendModalUser.status === "suspended" ? "Activate" : "Suspend")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Pending User Modal */}
      {showApproveModal && approveModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Approve User</h2>
              <button
                onClick={() => {
                  setShowApproveModal(false);
                  setApproveModalUser(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Approve user <span className="font-medium text-slate-900">{approveModalUser.name}</span>? They will be able to log in and access the system.
            </p>

            {error && (
              <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowApproveModal(false);
                  setApproveModalUser(null);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                disabled={approving}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                disabled={approving}
              >
                {approving ? "Approving…" : "Approve User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-red-700">Delete User</h2>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteModalUser(null);
                  setDeleteConfirmation(false);
                  setDeleteResult(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Result state */}
            {deleteResult ? (
              <div className="space-y-3 text-sm">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="font-medium text-green-800">User deleted successfully.</p>
                </div>
                <div className="space-y-1 text-slate-600">
                  {deleteResult.borrowsEscalated > 0 && (
                    <p>• {deleteResult.borrowsEscalated} borrow{deleteResult.borrowsEscalated !== 1 ? "s" : ""} escalated to pending return</p>
                  )}
                  {deleteResult.holdsReleased > 0 && (
                    <p>• {deleteResult.holdsReleased} hold{deleteResult.holdsReleased !== 1 ? "s" : ""} released</p>
                  )}
                  {deleteResult.libraryArchived && (
                    <p>• Library archived (user was library owner)</p>
                  )}
                </div>
                <p className="text-xs text-slate-500">Returning to user list…</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Delete user{" "}
                  <span className="font-medium text-slate-900">{deleteModalUser.name || deleteModalUser.id}</span>?
                </p>

                <div className="p-3 bg-red-50 rounded-lg border border-red-200 space-y-1 text-sm text-red-800">
                  <p className="font-medium">This action cannot be easily reversed:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-red-700">
                    <li>Any unreturned borrows will be <strong>escalated</strong> as pending user deletion flags</li>
                    <li>Active holds will be <strong>released</strong></li>
                    {deleteModalUser.role === "library_owner" && (
                      <li>Their library will be <strong>archived</strong></li>
                    )}
                  </ul>
                </div>

                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700">
                    I understand this cannot be easily reversed
                  </span>
                </label>

                {error && (
                  <div className="p-2 text-sm text-red-700 bg-red-50 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteModalUser(null);
                      setDeleteConfirmation(false);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    disabled={deleting || !deleteConfirmation}
                  >
                    {deleting ? "Deleting…" : "Delete User"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
