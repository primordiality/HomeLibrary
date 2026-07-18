"use client";
import Link from "next/link";

export default function Dashboard() {
  const stats = [
    { label: "Libraries", value: "2", href: "/libraries", icon: "📚" },
    { label: "Books", value: "147", href: "/catalog", icon: "📖" },
    { label: "Checked Out", value: "8", href: "/patrons", icon: "📋" },
    { label: "Analytics", value: "—", href: "/analytics", icon: "📊" },
  ];

  return (
    <div className="space-y-8">
       <header>
         <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
         <p className="mt-2 text-slate-500">Manage your personal library and borrowings.</p>
       </header>

       {/* Stat cards */}
       <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
         {stats.map(({ label, value, href, icon }) => (
           <Link key={href} href={href}
            className="rounded-xl border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
           >
             <div className="flex items-center justify-between">
               <span className="text-2xl">{icon}</span>
               <span className="text-3xl font-bold tracking-tight">{value}</span>
             </div>
             <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
           </Link>
         ))}
       </div>

       {/* Quick actions */}
       <section className="rounded-xl border bg-white p-6 shadow-sm">
         <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
         <div className="flex flex-wrap gap-3">
           <Link href="/catalog?scan=1" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
             🤖 Scan ISBN Barcode
           </Link>
           <Link href="/libraries?new=1" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
             ➕ Add Library
           </Link>
           <Link href="/bibliotheca?new=1" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 bg-white text-sm font-medium shadow-sm hover:bg-slate-50">
             ➕ Add Patron
           </Link>
         </div>
       </section>

       {/* Recent activity */}
       <section className="rounded-xl border bg-white p-6 shadow-sm">
         <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
         <table className="w-full text-sm">
           <thead className="border-b bg-slate-50">
             <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
               <th className="pb-3 pl-2">User</th>
               <th className="pb-3">Action</th>
               <th className="pb-3 hidden sm:table-cell">Book</th>
               <th className="pb-3 text-right">Date</th>
             </tr>
           </thead>
           <tbody className="divide-y">
             {[
               ["Alice Chen", "Checked out", "Project Hail Mary", "Jul 10, 2026"],
               ["Bob Martinez", "Returned", "Dune", "Jul 8, 2026"],
               ["Carol Wu", "Placed hold", "Neuromancer", "Jul 5, 2026"]
             ].map(([user, action, book, date]) => (
               <tr key={date} className="hover:bg-slate-50">
                 <td className="py-3 pl-2 font-medium">{user}</td>
                 <td className="py-3 text-slate-600">{action}</td>
                 <td className="py-3 hidden sm:table-cell">{book}</td>
                 <td className="py-3 text-right text-slate-500">{date}</td>
               </tr>
             ))}
           </tbody>
         </table>
       </section>

       {/* Due soon / nudge section */}
       <section className="rounded-xl border bg-white p-6 shadow-sm">
         <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
           📅 Nudges Due Soon
         </h2>
         <p className="text-sm text-slate-500 mb-4">Soft reminders — not enforced deadlines.</p>
         <table className="w-full text-sm">
           <thead className="border-b bg-slate-50">
             <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
               <th className="pb-3 pl-2">Patron</th>
               <th className="pb-3">Book</th>
               <th className="pb-3">Nudge Date</th>
               <th className="pb-3 text-right">Action</th>
             </tr>
           </thead>
           <tbody className="divide-y">
             {[
               ["Alice Chen", "Project Hail Mary", "Jul 24, 2026", "Send Email Nudge"],
               ["Carol Wu", "Neuromancer (on hold)", "Aug 5, 2026", "Send SMS Nudge"],
             ].map(([user, book, date, action]) => (
               <tr key={date} className="hover:bg-slate-50">
                 <td className="py-3 pl-2 font-medium">{user}</td>
                 <td className="py-3">{book}</td>
                 <td className="py-3 text-red-600 font-medium">{date}</td>
                 <td className="py-3 text-right">
                   <button className="text-indigo-600 hover:underline text-sm">{action}</button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </section></div>
   );
}
