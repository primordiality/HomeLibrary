"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any | null>(null);
  const [libraryStats, setLibraryStats] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalytics();
   }, []);

  async function fetchAnalytics() {
    // Aggregate from book copies and borrows tables
    const libraryData = [
      { name: "The Great Hall", total_books: 89, on_display: 73, checked_out: 12, hold_total: 3 },
      { name: "Apt 4B", total_books: 58, on_display: 48, checked_out: 6, hold_total: 1 },
     ];
     setLibraryStats(libraryData); // TODO: real supabase query
     setStats({ total_titles: 247, active_patrons: 4 });
    }

  if (!stats) return <p className="text-sm text-slate-500">Loading analytics...</p>;

  return (
     <div className="space-y-6">
       <header>
         <h1 className="text-3xl font-bold tracking-tight text-slate-900">Analytics</h1>  
         <p className="mt-2 text-sm text-slate-500">Per-library statistics and borrowing trends.</p>
       </header>

       {/* Top-level counts */}  
       <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-slate-900">{stats.total_titles}</p>  
           <p className="text-sm text-slate-500">Total Catalog Titles</p>
        </div>
         <div className="rounded-xl border bg-white p-6 shadow-sm">  
          <p className="text-2xl font-bold tracking-tight text-indigo-600">{stats.active_patrons}</p>
           <p className="text-sm text-slate-500">Active Patrons</p>
        </div>  
         <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-2xl font-bold tracking-tight text-emerald-600">94%</p>  
           <p className="text-sm text-slate-500">Copies On Display</p>
        </div>
       </div>  

       {/* Per-library breakouts */}
       <div className="space-y-3">
        {libraryStats.map((lib) => (
          <div key={lib.name} className="rounded-xl border bg-white p-6 shadow-sm">
             <h2 className="text-lg font-semibold mb-4">{lib.name}</h2>  
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">  
              <div>
                <p className="text-2xl font-bold text-slate-900">{lib.total_books}</p>
                 <p className="text-sm text-slate-500">Total Books</p>
               </div>  
              <div> <p className="text-2xl font-bold text-emerald-600">{lib.on_display}</p>  
                <p className="text-sm text-slate-500">On Display / Available</p>  
              </div>  
              <div>  
                <p className="text-2xl font-bold text-indigo-600">{lib.checked_out}</p>  
                <p className="text-sm text-slate-500">Checked Out</p>
               </div>  
               <div>  
                 <p className="text-2xl font-bold text-amber-600">{lib.hold_total}</p>
                 <p className="text-sm text-slate-500">On Hold</p>
               </div>
             </div>

             {/* Borrowing activity chart placeholder */}  
            <div className="mt-4 rounded-lg bg-slate-50 p-4 border">
              <p className="text-sm font-medium text-slate-700 mb-2">Recent Activity</p>
               <div className="h-16 flex items-end gap-[2px]">  
                 {[8, 12, 7, 15, 9, 11, 14].map((v, i) => (
                   <div key={i} style={{ height: `${(v / 16) * 100}%`, width: '100%', borderRadius: '2px', backgroundColor: '#6366f1' }} />  
                 ))}
               </div>
              <p className="text-xs text-slate-400 mt-1">Last 7 days checkouts</p>  
            </div>
          </div>
        ))}
       </div>

       {/* Trending books table */}  
       <div className="rounded-xl border bg-white shadow-sm p-6">
         <h2 className="text-lg font-semibold mb-4">Trending Books</h2>
         <table className="w-full text-sm">
           <thead className="border-b bg-slate-50">
             <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">  
               <th className="py-3 pl-4">#</th>
              <th className="py-3">Book Title</th>
               <th className="py-3 hidden sm:table-cell">Author(s)</th>  
               <th className="py-3 text-right">Times Borrows</th>
             </tr>
           </thead>  
           <tbody className="divide-y">
            {[["Neuromancer", "William Gibson", 15], ["Dune", "Frank Herbert", 12], ["Project Hail Mary", "Andy Weir", 8], ["The Hitchhiker's Guide to the Galaxy", "Douglas Adams", 7]].map(([title, author, count]) => (  
             <tr key={title} className="hover:bg-slate-50">
               <td className="py-3 pl-4 text-sm font-medium text-slate-400">{count}</td>
               <td className="py-3 font-medium text-slate-900">{title}</td>
               <td className="py-3 hidden sm:table-cell text-slate-500">{author}</td>  
               <td className="py-3 text-right text-sm text-amber-600">{count} borrows</td>  
             </tr>  
           ))}
            </tbody>
          </table>
        </div>
      </div>
    );
}
