"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function EditLibraryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const libraryId = params?.id ?? "";

   // Form fields
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

     // Archive & delete states
      const [loadingBooks, setLoadingBooks] = useState(true);
      const [hasBooks, setHasBooks] = useState(false);
      const [archiveConfirm, setArchiveConfirm] = useState(false);
      const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Load library + book count on mount
  useEffect(() => {
    async function loadLibrary() {
       const { data: lib } = await supabase
          .from("libraries")
          .select("*")
          .eq("id", libraryId)
          .single();

      if (!lib) { router.replace("/libraries"); return; }

        setName(lib.name || "");
        setAddress(lib.address || "");
         setDescription(lib.description || "");
         setPhone(lib.phone || "");

           // Check if this library has any book_copies
       const { count, error: libErr } = await supabase
          .from("book_copies")
          .select("*", { count: "exact", head: true })
          .eq("library_id", libraryId);

        if (libErr) {
         console.warn("Book count check failed:", libErr.message);
       }

           // If RLS blocks us from counting, assume no books for safety
      if (!libErr) setHasBooks((count ?? 0) > 0);
      else setHasBooks(false);

        setLoadingBooks(false);
      }

    loadLibrary();
   }, [libraryId, router]);

     // ─── Save library changes ────────────────
  const handleSave = async () => {
    setErrorMessage(null);
    if (!name.trim()) return setErrorMessage("Name is required.");
    setSaving(true);

     const { error } = await supabase
          .from("libraries")
          .update({
            name: name.trim(),
            address: address.trim() || null,
            description: description.trim() || null,
            phone: phone.trim() || null,
           })
          .eq("id", libraryId);

     if (!error) router.push("/libraries");
      else setErrorMessage(error.message || "Failed to save library.");
    setSaving(false);
   };

    // ─── Archive library (soft delete: is_archived = true) ──
  const handleArchive = async () => {
      setErrorMessage(null);
    setSaving(true);

     try {
       const { error } = await supabase
           .from("libraries")
          .update({ is_archived: true })
           .eq("id", libraryId);

         if (!error) router.push("/libraries");
         else setErrorMessage(error.message || "Failed to archive library.");
     } catch (err) {
       const message = (err as Error).message;
        setErrorMessage(message || "Failed to archive library.");
      } finally {
        setSaving(false);
      }
    };

    // ─── Hard delete library (only if zero books) ──
    const handleDelete = async () => {
     setErrorMessage(null);
     setSaving(true);

       try {
         const { error } = await supabase
           .from("libraries")
            .delete()
            .eq("id", libraryId);

          if (!error) router.push("/libraries");
           else setErrorMessage(error.message || "Failed to delete library.");
        } catch (err) {
          const message = (err as Error).message;
         setErrorMessage(message || "Failed to delete library.");
       } finally {
         setSaving(false);
        }
      };

      // Loading guard
  if (loadingBooks) return <p className="text-sm text-slate-500">Loading...</p>;

   return (
     <div className="mt-6 space-y-6 max-w-lg mx-auto p-4">
        {/* Header */}
       <header className="flex items-center gap-4">
          <Link href="/libraries" className="text-sm text-slate-500 hover:text-slate-700">
            &larr; Back
          </Link>
           <h1 className="text-2xl font-bold text-slate-900">Edit Library</h1>
       </header>

         {errorMessage && (
         <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
       )}

           {/* ─── FORM ────────────────────── */}
       <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
         <div className="space-y-4">
           <div>
             <label htmlFor="name" className="block text-sm font-medium text-slate-700">Name</label>
               <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                 autoFocus />
             </div>

              <div>
               <label htmlFor="address" className="block text-sm font-medium text-slate-700">Address</label>
                <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                 className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
               </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700">Description</label>
                 <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                   className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
                </div>

                 <div>
                   <label htmlFor="phone" className="block text-sm font-medium text-slate-700">Phone</label>
                    <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                     className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-72" />
                    </div>

               <button type="submit" disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                 {saving ? "Saving..." : "Save Changes"}
               </button>
            </div>
          </form>

           {/* ─── Manage Books Link ───────────── */}
         <div className="mt-4 pt-4 border-t border-slate-200">
           <Link href={`/libraries/${libraryId}/manage-books`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
             &rarr; Manage Books in this Library
           </Link>
        </div>

     {/* ─── Archive / Soft Delete ──────────── */}
       <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
         {!archiveConfirm ? (
             <button onClick={() => setArchiveConfirm(true)}
               className="w-full rounded-lg bg-orange-100 px-4 py-2 text-sm font-medium text-orange-700 border border-orange-200 hover:bg-orange-200">
                Archive Library
            </button>
         ) : (
             <div className="space-y-3">
               <p className="text-xs text-slate-700">This will mark this library as archived. It will be hidden from lists but all books remain intact.</p>
                <button onClick={handleArchive} disabled={saving}
                 className="w-full rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 disabled:opacity-50">
                  Yes &ndash; Archive Library</button>
               <button onClick={() => setArchiveConfirm(false)}
                className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                  Cancel</button>
             </div>
         )}
        <p className="mt-2 text-[10px] text-slate-500">Soft delete: library is hidden but data stays intact.</p>
       </div>

       {/* ─── Hard Delete (if zero books) or Cannot Delete ─ */}
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
           <p className="text-xs font-semibold text-red-700 mb-1">Hard Delete &ndash; Permanent</p>

           {hasBooks ? (
             <div>
               <p className="text-xs text-slate-600 mb-2">This library still contains books.</p>
                 <button onClick={() => setDeleteConfirm(true)} disabled
                   className="w-full rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-300 border border-red-200 cursor-not-allowed">
                    Delete Library Permanently</button>
              </div>
           ) : (
             <div>
                 <p className="text-xs text-slate-600 mb-2">This library has no books. This action CANNOT be reversed.</p>

               {deleteConfirm ? (
                 <div className="space-y-2 mt-3">
                    <button onClick={() => { handleDelete(); setDeleteConfirm(false); }} disabled={saving}
                     className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700">
                       Yes &ndash; Delete Permanently</button>
                    <button onClick={() => setDeleteConfirm(false)}
                      className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                       Cancel</button>
                   </div>
                ) : (
                   <button onClick={() => setDeleteConfirm(true)}
                    className="w-full rounded-lg bg-white px-4 py-2 text-sm font-medium text-red-700 border border-red-300 hover:bg-red-100">
                     Delete Library Permanently</button>
                  )}
             </div>
            )}
        </div>
     </div>
   );
}
