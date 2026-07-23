"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type EscalationFlag = {
  id: string;
  library_id: string;
  library_name: string;
  deleted_user_name: string;
  book_title: string;
  barcode?: string | null;
  borrow_date: string;
  borrow_id: string;
  copy_id: string;
};

export default function EscalationsPage() {
  const [flags, setFlags] = useState<EscalationFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const { user } = useAuth();

  const loadFlags = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("user_deletion_flags")
        .select(`
          id,
          borrow_id,
          copy_id,
          library_id,
          borrows!inner (checkout_date),
          book_copies!inner (book_id, barcode),
          libraries (name),
          profiles!user_deletion_flags_deleted_user_id_fkey (name)
        `)
        .eq("status", "pending")
        .order("library_id")
        .order("id");

      if (error) {
        setError(`Failed to load escalations: ${error.message}`);
        setFlags([]);
        return;
      }

      const parsed = (data ?? []).map((row: any) => ({
        id: row.id,
        borrow_id: row.borrow_id,
        copy_id: row.copy_id,
        library_id: row.library_id,
        library_name: row.libraries?.name || "Unknown Library",
        deleted_user_name: row.profiles?.name || "Unknown User",
        book_title: row.book_copies?.book_title || "Unknown Book",
        barcode: row.book_copies?.barcode,
        borrow_date: row.borrows?.checkout_date || "—",
      }));

      // Fetch book titles from books table
      const copyIds = parsed.map((f) => f.copy_id);
      if (copyIds.length > 0) {
        const { data: copies, error: copiesError } = await supabase
          .from("book_copies")
          .select("id, book_id")
          .in("id", copyIds);

        if (!copiesError && copies) {
          const bookIds = [...new Set(copies.map((c) => c.book_id))];
          const { data: books, error: booksError } = await supabase
            .from("books")
            .select("id, title")
            .in("id", bookIds);

          if (!booksError && books) {
            const bookMap = new Map<string, string>(
              books.map((b) => [b.id, b.title || "Unknown"])
            );
            parsed.forEach((f) => {
              const copy = copies.find((c) => c.id === f.copy_id);
              if (copy) {
                f.book_title = bookMap.get(copy.book_id) || "Unknown Book";
              }
            });
          }
        }
      }

      setFlags(parsed);
    } catch (e) {
      setError("Network error loading escalations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleResolve = async (flagId: string, resolution: "returned" | "lost") => {
    setError(null);
    setResolving((prev) => ({ ...prev, [flagId]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError("Please sign in again to resolve flags.");
        setResolving((prev) => ({ ...prev, [flagId]: false }));
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/functions/v1/resolve-deletion-flag`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ flagId, resolution }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || `Failed to mark as ${resolution}.`);
        setResolving((prev) => ({ ...prev, [flagId]: false }));
        return;
      }

      showToast(`Flag resolved as ${resolution}.`);
      setResolving((prev) => ({ ...prev, [flagId]: false }));
      await loadFlags();
    } catch (e) {
      setError("Network error resolving flag.");
      setResolving((prev) => ({ ...prev, [flagId]: false }));
    }
  };

  // Group by library
  const grouped = flags.reduce<Record<string, EscalationFlag[]>>((acc, flag) => {
    const key = flag.library_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(flag);
    return acc;
  }, {});

  const librariesWithFlags = Object.keys(grouped).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Escalations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Resolve pending user deletion flags. These arise when a deleted user had unreturned borrows.
        </p>
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

      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        <p className="text-sm font-medium text-slate-900">
          {loading ? "Loading…" : (
            <span>
              {flags.length} pending escalation{flags.length !== 1 ? "s" : ""} across{" "}
              {librariesWithFlags} library{librariesWithFlags !== 1 ? "ies" : "y"}
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading escalations…</div>
      ) : flags.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500">No pending escalations. Everything is clear.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([libraryName, libraryFlags]) => (
          <div key={libraryName} className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              {libraryName}
              <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {libraryFlags.length}
              </span>
            </h2>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Deleted User</th>
                    <th className="px-4 py-3">Book</th>
                    <th className="px-4 py-3">Barcode</th>
                    <th className="px-4 py-3">Borrow Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {libraryFlags.map((flag) => (
                    <tr key={flag.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {flag.deleted_user_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {flag.book_title}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {flag.barcode || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {flag.borrow_date !== "—" ? new Date(flag.borrow_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          onClick={() => handleResolve(flag.id, "returned")}
                          disabled={resolving[flag.id]}
                          className="text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded border border-green-200 transition disabled:opacity-50"
                        >
                          {resolving[flag.id] ? "Processing…" : "Mark Returned"}
                        </button>
                        <button
                          onClick={() => handleResolve(flag.id, "lost")}
                          disabled={resolving[flag.id]}
                          className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 transition disabled:opacity-50"
                        >
                          {resolving[flag.id] ? "Processing…" : "Mark Lost"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
