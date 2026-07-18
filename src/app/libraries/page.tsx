"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase/client";

interface Library {
  id: string;
  name: string;
  description?: string | null;
  phone?: string | null;
  book_count: number;
}

export default function LibrariesPage() {
  const { session, profile } = useAuth();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!profile) return;
     fetchLibraries();
   }, [profile]);

  async function fetchLibraries() {
     // TODO: Replace with actual supabase call once DB is migrated  
      const { data } = await supabase.from("libraries").select("*").limit(10);
      if (data) setLibraries(data as Library[]);
   }

  async function handleCreate(e: React.FormEvent) {
     e.preventDefault();
    // TODO: Insert into libraries table  
    const { data } = await supabase.from("libraries")
       .insert({ name, description, phone, owner_id: session?.user?.id })
       .select()
       .single();
     if (data) setLibraries(prev => [...prev, data as Library]);
     setName(""); setDescription(""); setPhone(""); setShowForm(false);
    await fetchLibraries();
   }

  return (
    <div className="space-y-6">
       <header className="flex items-center justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900">Libraries</h1>
           <p className="mt-2 text-sm text-slate-500">Manage your physical libraries (houses, buildings).</p>
         </div>
         <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
           {showForm ? "Cancel" : "Add Library"}
         </button>
       </header>

        {/* Add Library Form */}
       {showForm && (
         <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
           <h2 className="text-lg font-semibold mb-4">New Library</h2>
           <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
             <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
               <input
                 value={name}
                 onChange={e => setName(e.target.value)}
                 className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                 placeholder="The Great Hall"  
               />
             </div>
             <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Description</label>
                <input
                   value={description}
                   onChange={e => setDescription(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                   placeholder="A personal library of 500+ books spanning all genres"
                 />
               </div>
           </div>
           <div className="mt-4">
             <label className="block text-sm font-medium text-slate-700">Phone</label>
            <input
               value={phone}
              onChange={e => setPhone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 sm:w-72"
               placeholder="+1 (555) 000-0000"
             />
           </div>
           <div className="mt-4 flex items-center gap-2">
             <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
               Create Library
             </button>
           </div>
         </form>
       )}

        {/* Libraries List */}
       {libraries.length > 0 ? (
         <div className="space-y-4">
           {libraries.map(lib => (
             <div key={lib.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
               <Link href={`/catalogs?library=${lib.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                 {lib.name} ({lib.book_count ?? 0} Books)
               </Link>
             </div>
           ))}
         </div>
       ) : (
         <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
           <p className="text-sm text-slate-500 mb-7">No libraries yet. Click Add Library to get started.</p>
         </div>
       )}

        {/* Libraries list */}
       {libraries.length > 0 && (
         <div className="space-y-4">
           {libraries.map(lib => (
             <div key={lib.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
               <Link href={`/catalogs?library=${lib.id}`} className="flex w-full cursor-pointer items-center gap-3 text-indigo-600 hover:text-indigo-800">
                 <span className="text-2xl sm:w-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">📚</span>  
             <div className="min-w-0 flex-1">
               <p className="text-sm font-medium text-slate-900 truncate">{lib.name}</p>
                 <p className="text-sm text-slate-500 truncate">{lib.description || "No description"}</p>
             </div>
           </Link>
                 <span className="ml-auto shrink-0 text-xs font-medium text-slate-400 bg-slate-100 pl-2 pr-3 py-1 rounded-full sm:font-medium sm:text-sm">{lib.book_count} books</span>
             </div>
           ))}
         </div>
       )}
     </div>
   );
}
