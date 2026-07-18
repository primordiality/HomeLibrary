"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { Library } from '@/types/db';

export default function LibrariesPage() {
  const { user, loading: authLoading } = useAuth();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // ─── Load libraries from Supabase on mount ────────────────────────
  useEffect(() => {
    if (!user) return;
    async function loadLibraries() {
      setLoadingData(true);
      try {
        const { data } = await supabase
             .from("libraries")
             .select("*")
             .eq("is_archived", false)
             .order("created_at", { ascending: false });
        if (data) setLibraries(data);
         } catch (err) {
        console.error(err);
         } finally {
        setLoadingData(false);
         }
       }
    loadLibraries();
     }, [user]);

    // ─── Always show loading state for auth ──────────────────────────
  if (authLoading) {
    return <p className="text-sm text-slate-500">Loading...</p>;
     }

    // ─── If NOT signed in, explain why and link to signin page ───────
  if (!user) {
    return (
         <div className="space-y-6">
           <header>
             <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Libraries
             </h1>
             <p className="mt-2 text-sm text-slate-500">Nothing here.</p>
           </header>

           <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-6 shadow-sm">
             <p className="text-base font-medium text-yellow-800">
              You are not signed in.
             </p>
             <p className="mt-2 text-sm text-yellow-700">
              Sign out was done manually or you never logged in. To add libraries,{" "}
              create an account and sign in first.
             </p>
             <div className="mt-4 flex items-center gap-3">
               <Link
                href="/signin"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                 >
                Sign In →
               </Link>
             </div>

             <hr className="my-6 border-slate-200" />

      <p className="text-sm text-slate-500">
    Running <code className="rounded bg-white px-1 py-0.5 text-xs">localStorage.clear()</code>{" "}
    in the console? That returns{" "}
       <code className="rounded bg-yellow-200 px-1 py-0.5 text-xs">undefined</code> —;
    which is normal. It means "no value returned" (not an error). If it threw, you'd see a
    console error instead of void. To force sign-out manually: just visit{" "}
       <Link href="/signin" className="text-indigo-600 hover:underline">
         /signin
       </Link>{" "}
    and clear your cookies in Dev Tools → Application → Storage → Clear Site Data.
     </p>
           </div>

           <p className="mt-4 text-xs text-slate-400">
          If you were signed in but sign-out did nothing, the Supabase config (""
             <code>.env.local</code> URL / anon key) should be checked. Run{" "}
             <code>supabase schema.sql</code> in your dashboard SQL Editor to create tables and RLS policies. See README.md for details.
           </p>
         </div>
       );
     }

    // ─── Handle library creation via direct Supabase client ────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!name.trim()) return setErrorMessage("Library name is required.");

       // Ensure profile exists first to avoid FK constraint violations
      try {
        const { data: profile } = await supabase
              .from("profiles")
              .select("id")
                .eq("id", user.id!)
                .limit(1);
       if (!profile || profile.length === 0) {
         const userEmail = user?.email ?? '';
         await supabase.from("profiles").insert({ id: user.id!, email: userEmail });
           }
        } catch {
         // Silent — profiles_insert_auth policy covers this, just proceed
        }

     try {
       setSubmitting(true);
       const { data, error } = await supabase
             .from("libraries")
             .insert({
            name: name.trim(),
             address: address.trim() || null,
             description: description.trim() || null,
             phone: phone.trim() || null,
             owner_id: user.id!,
             is_archived: false,
             })
             .select()
             .single();

       if (error) {
         setErrorMessage(error.message || "Failed to create library.");
         return;
          }

         // Add to local state and clear form
      setLibraries((prev) => [data, ...prev]);
      setName("");
       setAddress("");
       setDescription("");
       setPhone("");
       setShowForm(false);
        } catch (err: any) {
       setErrorMessage(err.message || "Unknown error creating library.");
        } finally {
        setSubmitting(false);
         }
       };

       // ─── Signed-in: render libraries list with add form ────────
   return (
        <div className="space-y-6">
          <header>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
           Libraries
            </h1>
            <p className="mt-2 text-sm text-slate-500">
           Manage your physical libraries (houses, buildings).
            </p>   
          </header>

            {/* Add Library Button */}
          <div className="flex justify-end">
            <button
             onClick={() => setShowForm(!showForm)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                >
              {showForm ? "Cancel" : "+ Add Library"}
              </button>
            </div>

            {/* Add / Edit Form */}
          {showForm && (
           <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
             <h2 className="text-lg font-semibold mb-4">New Library</h2>

          {errorMessage && (
               <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 mb-4">
                {errorMessage}   
              </div>
             )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
               <label className="block text-sm font-medium text-slate-700">Name</label>   
               <input
                value={name}
            onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="The Great Hall"
              />
            </div>

             <div className="sm:col-span-2">   
               <label className="block text-sm font-medium text-slate-700">Address</label>
               <input
                value={address}
            onChange={(e) => setAddress(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="123 Main St, City, State"
              />
            </div>
           </div>

           <div className="mt-4">   
             <label className="block text-sm font-medium text-slate-700">Description</label>   
             <input
            value={description}
          onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="A personal library of 500+ books spanning all genres"
            />
           </div>

       <div className="mt-4">   
          <label className="block text-sm font-medium text-slate-700">Phone</label>   
             <input
            value={phone}
          onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 sm:w-72 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            placeholder="+1 (555) 000-0000"
            />
         </div>

           <div className="mt-4 flex items-center gap-2">   
             <button
            type="submit"
          disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
               {submitting ? "Creating..." : "Create Library"}   
             </button>
            </div>
         </form>
       )}

          {/* Libraries List */}
        {loadingData && libraries.length === 0 ? (
           <p className="text-sm text-slate-500">Loading...</p>   
       ) : libraries.length > 0 ? (
           <div className="space-y-4">    
             {libraries.map((lib) => (
               <div key={lib.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                 <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {}}>
                   <Link href={`/catalogs?library=${lib.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                     {lib.name} <span className="text-slate-500">({lib.description || "No description" })</span>
                   </Link>
                 </div>
                 <div className="flex items-center gap-3 ml-4">
                   <span className="text-xs text-slate-400 mr-2">Books: 0</span>
                   <Link 
                      href={`/libraries/${lib.id}/manage-books`}
                      className="rounded-lg bg-white border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                     Manage Books
                   </Link>
                   <Link 
                      href={`/libraries/${lib.id}/edit`}
                      className="rounded-lg bg-white border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                      >
                     Edit Library
                   </Link>
                 </div>
               </div>
             ))}
           </div>   
         ) : (    
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm text-slate-500 mb-7">No libraries yet. Click "+ Add Library" to get started.</p>   
         </div>
       )}
     </div>
     );
 }
