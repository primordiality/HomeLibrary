"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import type { Library } from "@/types/db";

export default function LibrariesPage() {
  const { user, loading: authLoading } = useAuth();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ─── Always show loading state ───────────────────────────────────────
  if (authLoading) {
    return <p className="text-sm text-slate-500">Loading...</p>;
  }

  // ─── If NOT signed in, explain why and link to signin page ───────────
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
            <code className="rounded bg-yellow-200 px-1 py-0.5 text-xs">undefined</code> —
            which is normal. It means "no value returned" (not an error). If it threw, you'd see a
            console error instead of void. To force sign-out manually: just visit{" "}
            <Link href="/signin" className="text-indigo-600 hover:underline">
              /signin
            </Link>{" "}
            and clear your cookies in Dev Tools → Application → Storage → Clear Site Data.
          </p>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          If you were signed in but sign-out did nothing, the Supabase config (
          <code>.env.local</code> URL / anon key) should be checked. Run{" "}
          <code>supabase schema.sql</code> in your dashboard SQL Editor to create tables and RLS policies. See README.md for details.
        </p>
      </div>
    );
  }

  // ─── Signed-in: fetch & render real data ─────────────────────────────
  return (
     <div className="space-y-6">
       {/* Header */}
       <header className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900">
             Libraries
           </h1>
           <p className="mt-2 text-sm text-slate-500">
             Manage your physical libraries (houses, buildings).
           </p>
         </div>
         <button
           onClick={() => setShowForm(!showForm)}
           className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
         >
           {showForm ? "Cancel" : "Add Library"}
         </button>
       </header>

       {/* Add / Edit Form */}
       {showForm && (
         <form
           onSubmit={async (e) => {
             e.preventDefault();
             setErrorMessage(null);
             if (!name.trim()) return setErrorMessage("Library name is required.");
             
             // ─── Real Supabase API call ──────────────────────────────────  
             try {
               const res = await fetch("/api/libraries", {  // TODO: create this API route later
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ name, description, phone }),
               });

               if (!res.ok) throw new Error(`Failed: ${res.status}`);
             } catch (err: any) {
               setErrorMessage(err.message || "Unknown error creating library.");
               return;
             }

             // Success — reload libraries after creating  
             setName("");
             setDescription("");  
             setPhone("");
             setShowForm(false);
           }}
           className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
         >
           <h2 className="text-lg font-semibold mb-4">New Library</h2>

          {errorMessage && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
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
               <label className="block text-sm font-medium text-slate-700">Description</label>
               <input
                 value={description}  
                 onChange={(e) => setDescription(e.target.value)}  
                 className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm  
                   focus:border-indigo-500 focus:ring-indigo-500"
                 placeholder="A personal library of 500+ books spanning all genres"
               />
             </div>
           </div>

           <div className="mt-4">  
             <label className="block text-sm font-medium text-slate-700">Phone</label>  
             <input
               value={phone}  
               onChange={(e) => setPhone(e.target.value)}
               className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 sm:w-72 text-sm
                 focus:border-indigo-500 focus:ring-indigo-500"
               placeholder="+1 (555) 000-0000"  
             />
           </div>

           <div className="mt-4 flex items-center gap-2">
             <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium 
                 text-white shadow-sm hover:bg-indigo-700">
               Create Library  
             </button>
           </div>
         </form>
       )}

       {/* Libraries List */}
       {libraries.length > 0 ? (  
         <div className="space-y-4">
           {libraries.map((lib) => (  
             <div key={lib.id} className="flex items-center justify-between rounded-xl border border-slate-200  
                   bg-white p-6 shadow-sm transition hover:shadow-md cursor-pointer"  
              >
               <Link href={`/catalogs?library=${lib.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800 
                    text-sm font-medium">
                 {lib.name} (Books)
               </Link>
             </div>  
           ))}
         </div>
       ) : (
         <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm text-slate-500 mb-7">No libraries yet. Click "Add Library" to get started.</p>  
         </div>  
       )}

     </div>  
  );  
}  
