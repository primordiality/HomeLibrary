"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

export default function PatronsPage() {
  const [patrons, setPatrons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    loadPatrons();
   }, []);

  async function loadPatrons() {
    try {
      const { data } = await supabase.from("profiles").select("*")
        .eq("role", "patron")
        .order("name");
       if (data) setPatrons(data);
     } catch (err) { console.error(err); }
     finally { setLoading(false); }
   }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();  
    const { error } = await supabase.from("profiles")
      .insert([{ name, email, role: "patron" }]);
    if (!error) {
       setName(""); setEmail(""); setShowForm(false);
      await loadPatrons();
     }
   }

  return (
    <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Patrons & Borrowings</h1>
            <p className="mt-2 text-sm text-slate-500">Manage patron accounts and track borrowings.</p>  
          </div>
          <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
            {showForm ? "Cancel" : "Add Patron"}  
          </button>
        </header>

        {/* Add patron form */}
         {showForm && (
          <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">New Patron</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">  
              <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                   className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />  
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                 <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                   className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />  
              </div>
              <div className="flex items-end">
                <button type="submit"
                 className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
                  Create Patron  
                 </button>
              </div>
            </div>
          </form>
        )}

        {/* Patrons table */}
        {loading ? (
          <p>Loading...</p>
        ) : patrons.length > 0 ? (
          <div className="rounded-xl border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">  
                  <th className="py-3 pl-4">Patron</th>  
                  <th className="py-3 hidden sm:table-cell">Email</th>
                  <th className="py-3">Active Books</th>  
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>  
              <tbody className="divide-y">
                {patrons.map(patron => (
                  <tr key={patron.id} className="sm:w-full block sm:table-row sm:hover:bg-slate-50 w-full">  
                    <td className="py-3 pl-4 whitespace-nowrap">{patron.name}</td>
                     <td className="py-3 hidden sm:table-cell text-slate-500">{patron.email}</td>
                    <td className="py-3 text-slate-600">3</td>  
                    <td className="py-3 text-right">
                      <button className="text-indigo-600 hover:underline mr-2 text-sm font-medium">Edit</button>  
                      <Link href={`/patrons/${patron.id}/borrows`} className="text-indigo-600 hover:underline text-sm font-medium">View Borrows</Link>
                    </td>  
                  </tr>
                ))}
               </tbody>
             </table>
           </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm font-medium text-slate-600 mb-2">No patrons yet.</p>  
            <p className="text-sm text-slate-500">Add a patron to track borrowings.</p>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
         <div className="rounded-xl border bg-white p-6 shadow-sm">
           <p className="text-2xl font-bold tracking-tight text-slate-900">{patrons.length}</p>
            <p className="text-sm text-slate-500">Total Patrons</p>
         </div>
         <div className="rounded-xl border bg-white p-6 shadow-sm">
           <p className="text-2xl font-bold tracking-tight text-indigo-600">3</p>  
            <p className="text-sm text-slate-500">Active Check-outs</p>  
         </div>
          <div className="rounded-xl border bg-white p-6 shadow-sm">  
           <p className="text-2xl font-bold tracking-tight text-amber-600">1</p>
            <p className="text-sm text-slate-500">On Hold</p>
         </div>
        </div>
      </div>  
   );
}
