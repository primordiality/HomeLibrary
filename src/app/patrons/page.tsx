'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

export default function PatronsPage() {
  const [patrons, setPatrons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  // Stats from borrows/holds tables
  const [activeCheckouts, setActiveCheckouts] = useState(0);
  const [onHoldCount, setOnHoldCount] = useState(0);

  useEffect(() => {
    loadPatrons();
    loadStats();
     // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
   }, []);

  async function loadPatrons() {
    try {
      const { data, error } = await supabase
       .from('profiles')
       .select('*')
       .eq('role', 'patron')
       .order('name');
      if (error) throw new Error(error.message);
      if (data) setPatrons(data);
     } catch (err: any) {
      console.error('Failed to load patrons:', err);
      setErrorMessage(err.message || 'Failed to load patrons.');
      setTimeout(() => setErrorMessage(null), 4000);
     } finally { setLoading(false); }
   }

  async function loadStats() {
    try {
       // Active checkouts: borrows where return_date is null
      const { count: active }: any = await supabase
         .from('borrows')
         .select('id', { count: 'exact', head: true })
         .is('return_date', null);
      if (active?.count !== undefined) setActiveCheckouts(active.count);

       // On holds  
      const { count: holds }: any = await supabase
         .from('holds')
         .select('id', { count: 'exact', head: true });
      if (holds?.count !== undefined) setOnHoldCount(holds.count);
     } catch {
      console.error('Failed to load stats');
     }
   }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setOkMessage(null);
    
    if (!name.trim()) {
      setErrorMessage('Patron name is required.');
      return;
     }
    
    try {
      const patronData = { 
        name: name.trim(), 
        email: email.trim() || null, 
        role: 'patron' 
       };
      
      const { error } = await supabase.from('profiles').insert([patronData]);
      if (error) throw new Error(error.message);
      
      setName('');
      setEmail('');
      setShowForm(false);
      await loadPatrons();
      setOkMessage('Patron created successfully!');
      setTimeout(() => setOkMessage(null), 3000);
     } catch (err: any) {
      console.error('Failed to create patron:', err);
      setErrorMessage(err.message || 'Failed to create patron.');
      setTimeout(() => setErrorMessage(null), 5000);
     }
   }

  async function handleDelete(patronId: string, patronName: string) {
    if (!confirm('Are you sure you want to delete ' + patronName + '?')) return;
    
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', patronId);
      if (error) throw new Error(error.message);
      
      loadPatrons(); // Refresh list
      setOkMessage('Patron deleted.');
      setTimeout(() => setOkMessage(null), 3000);
     } catch (err: any) {
      console.error('Failed to delete patron:', err);
      setErrorMessage(err.message || 'Failed to delete patron.');
      setTimeout(() => setErrorMessage(null), 5000);
     }
   }

  return (
     <div className="space-y-6">
       {/* Header */}
       <header>
         <h1 className="text-3xl font-bold tracking-tight text-slate-900">Patrons</h1>
         <p className="mt-2 text-sm text-slate-500">Manage patron accounts for your libraries.</p>&nbsp;
       </header>

       {/* Message area */}
       {okMessage && (
         <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">{okMessage}</div>
       )}
       {errorMessage && (
         <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
           <strong>Error: </strong>{errorMessage}
         </div>
       )}

       {/* Add patron form */}
       {showForm && (
         <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
           <h2 className="text-lg font-semibold text-slate-900 mb-4">New Patron</h2>
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

       {/* Buttons/header */}
       <div className="flex items-center justify-between">
         {patrons.length > 0 && !showForm ? (
           <button onClick={() => setShowForm(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
            Add Patron  
           </button>
         ) : showForm ? null : (
           <div />
         )}
        
         {patrons.length > 0 && !showForm ? (
           <Link href="/borrowings" className="text-sm text-indigo-600 hover:text-indigo-800">
            View Borrowings &rarr;
           </Link>
         ) : showForm ? null : (
           <div />
         )}
       </div>

       {/* Patrons table */}
       {loading ? (
         <p className="text-sm text-slate-500">Loading...</p>
       ) : patrons.length > 0 ? (
         <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
           <table className="w-full text-sm min-w-[600px]">
             <thead className="border-b bg-slate-50">
               <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">  
                 <th className="py-3 pl-4">Patron</th>  
                 <th className="py-3 hidden sm:table-cell">Email</th>
                 <th className="py-3 text-right">Actions</th>
               </tr>
             </thead>  
             <tbody className="divide-y">
               {patrons.map(patron => (
                 <tr key={patron.id} className="sm:w-full block sm:table-row sm:hover:bg-slate-50 w-full">  
                   <td className="py-3 pl-4 whitespace-nowrap font-medium text-slate-900">{patron.name || patron.email}</td>
                   <td className="py-3 hidden sm:table-cell text-slate-500">{patron.email}</td>
                   <td className="py-3 text-right">
                     <Link href={`/borrowings?patronId=${patron.id}`} className="text-indigo-600 hover:text-indigo-800 mr-3 text-sm font-medium">View Borrows</Link>
                     <button onClick={() => handleDelete(patron.id, patron.name || 'this patron')}
                      className="text-red-600 hover:text-red-800 mr-2 text-sm font-medium">Delete</button>
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
           <p className="text-2xl font-bold tracking-tight text-indigo-600">{activeCheckouts}</p>  
           <p className="text-sm text-slate-500">Active Check-outs</p>  
         </div>
         <div className="rounded-xl border bg-white p-6 shadow-sm">  
           <p className="text-2xl font-bold tracking-tight text-amber-600">{onHoldCount}</p>
           <p className="text-sm text-slate-500">On Hold</p>
         </div>
       </div>
       <div className="flex items-center justify-between">
         <Link href="/borrowings" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">&rarr; Manage Borrowings</Link>
       </div>
     </div>  
  );
}
