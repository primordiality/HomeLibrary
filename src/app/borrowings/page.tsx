'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

export default function BorrowingsPage() {
  const [patronMap, setPatronMap] = useState<Record<string, string>>({});
  const [patronsAll, setPatronsAll] = useState<any[]>([]);
  const [activeBorrows, setActiveBorrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

   // Filters
  const [patronFilterId, setPatronFilterId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadPatrons();
    loadBorrows();
     // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot load
     }, []);

  async function loadPatrons() {
    try {
      const { data: p } = await supabase.from('profiles').select('*');
      if (p) {
        const map: Record<string, string> = {};
        for (const item of p) {
          map[item.id] = item.name || item.email || 'Unnamed';
         }
        setPatronMap(map);
        setPatronsAll(p.filter((item: any) => item.role === 'patron' || !item.role));
       }
     } catch (e: any) { 
      console.error('Failed to load patrons:', e.message); 
     }
   }

  async function loadBorrows() {
    try {
      const { data, error } = await supabase.from('borrows').select('*');
      if (error) throw new Error(error.message);
       // Active loans only where return_date IS NULL
      const activeList: any[] = (data ?? []).filter((b: any) => !b.return_date);
      setActiveBorrows(activeList);
     } catch (e: any) { 
      console.error('Failed to load borrows:', e.message); 
     } finally { 
      setLoading(false); 
     }
   }

  async function handleReturn(borrowId: string) {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('borrows').update({ return_date: now }).eq('id', borrowId);
      if (error) throw new Error(error.message);
      loadBorrows(); // Refresh active loans
     } catch (e: any) { 
      alert('Failed to mark return: ' + e.message); 
     }
   }

   // Display loans filtered by patron/search  
  const displayLoans = activeBorrows.filter((loan: any) => {
    if (patronFilterId && loan.patron_user_id !== patronFilterId) return false;
    if (searchTerm) {
      const name = patronMap[loan.patron_user_id] || '';
      if (!name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
     }
    return true;
     }).sort((a: any, b: any) => a.checkout_date.localeCompare(b.checkout_date));

  const today = new Date().toISOString().split('T')[0];
  const overdueCount = displayLoans.filter((l: any) => l.due_date && l.due_date < today).length;

  return (
       <div className="space-y-6">
         {/* Header */}
         <header>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900">Patrons & Borrowings</h1>
           <p className="mt-2 text-sm text-slate-500">Manage loans and patron activity for your library.</p>
         </header>

         {/* Quick stat cards */}
         <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
           <div className="rounded-xl border bg-white p-6 shadow-sm">
             <p className="text-2xl font-bold text-slate-900">{patronsAll.length}</p>
             <p className="text-sm text-slate-500">Total Patrons</p>
           </div>
           <div className="rounded-xl border bg-white p-6 shadow-sm">
             <p className="text-2xl font-bold text-indigo-600">{displayLoans.length}</p>
             <p className="text-sm text-slate-500">Active Loans</p>
           </div>
           <div className="rounded-xl border bg-white p-6 shadow-sm">
             <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
             <p className="text-sm text-slate-500">Overdue</p>
           </div>
         </div>

         {/* Patron filter + search */}
         <div className="flex flex-wrap gap-3 items-center">
           <select 
             value={patronFilterId} 
             onChange={(e) => setPatronFilterId(e.target.value)}
             className="w-full sm:w-auto rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
           >
             <option value="">All Patrons</option>
             {patronsAll.map((ptn) => (
               <option key={String(ptn.id)} value={String(ptn.id)}>
                 {ptn.name || ptn.email}
               </option>
             ))}
           </select>

           <input 
             type="text" 
             value={searchTerm} 
             onChange={(e) => setSearchTerm(e.target.value)}
             placeholder="Search patron name..."
             className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" 
           />
         </div>

         {/* Active Loans Table */}
         {loading ? (
             <p className="text-sm text-slate-500">Loading...</p>
         ) : displayLoans.length > 0 ? (
             <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
               <table className="w-full text-sm">
                 <thead className="border-b bg-slate-50">
                   <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                     <th className="py-3 pl-4">Patron</th>
                     <th className="py-3">Checkout Date</th>
                     <th className="py-3">Due Date</th>
                     <th className="py-3 text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {displayLoans.map((loan: any) => {
                    const isOverdue = !!loan.due_date && today > loan.due_date;
                    return (
                       <tr key={loan.id} className="hover:bg-slate-50">
                         <td className="py-3 pl-4 whitespace-nowrap font-medium text-slate-900">
                           {patronMap[loan.patron_user_id] || 'Unknown'}
                         </td>
                         <td className="py-3 text-slate-600">
                           <span className={isOverdue ? "text-red-600 font-medium" : "text-yellow-600"}>
                             {new Date(loan.checkout_date).toLocaleDateString()}
                           </span>
                         </td>
                         <td className="py-3">
                           {loan.due_date ? (
                             <span className={isOverdue ? "text-red-600 font-medium" : "text-slate-600"}>
                               {new Date(loan.due_date).toLocaleDateString()}
                             </span>
                           ) : (
                             <span className="text-slate-400">No due date set</span>
                           )}
                         </td>
                         <td className="py-3 text-right space-x-2">
                           {isOverdue && (
                             <button 
                               onClick={() => alert('This patron has an overdue loan! Please contact them to return.')}
                               className="bg-red-100 px-3 py-1 text-xs font-medium rounded hover:bg-red-200 mr-2"
                             >
                               Overdue
                             </button>
                           )}
                           <button 
                             onClick={() => handleReturn(loan.id)}
                             className="text-green-600 hover:text-green-800 text-sm font-medium"
                           >
                             Mark Returned
                           </button>
                         </td>
                       </tr>
                    );
                   })}
                 </tbody>
               </table>
             </div>
         ) : (
             <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
               {patronsAll.length > 0 ? (
                 <p className="text-sm font-medium text-slate-600 mb-2">No active borrows at this time.</p>
               ) : (
                   <>
                     <p className="text-sm font-medium text-slate-600">No borrows found</p>
                     <p className="text-sm text-slate-500">Check back when patrons have active loans</p>
                   </>
               )}
             </div>
         )}

         {/* Manage Patrons Link */}
         <div className="flex justify-between items-center">
           <Link href="/patrons" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">&larr; Back to Patrons</Link>
         </div>
       </div>
   );
}
