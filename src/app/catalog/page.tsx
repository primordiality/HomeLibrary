"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

export default function CatalogPage() {
  const [books, setBooks] = useState<any[]>([]);
  const [showScan, setShowScan] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scanResult, setScanResult] = useState<string | null>(null);

  useEffect(() => {
    loadBooks();
    }, []);

  async function loadBooks() {
    try {
      let query = supabase.from("books").select("*");  
      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,isbn.eq.${searchQuery}`);  
       }
       const { data } = await query;
        if (data) setBooks(data);
     } catch (err) { console.error(err); }
   }

  async function handleScan(isbn: string) {
    // TODO: Auto-fetch from OpenLibrary API
    // For now, mock the auto-fill behavior  
    setScanResult(`ISBN ${isbn} captured — metadata will be fetched from OpenLibrary`);
     setShowScan(false);
    }

  return (
     <div className="space-y-6">
       <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
         <div>
           <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catalog</h1>  
           <p className="mt-2 text-sm text-slate-500">Browse and manage your library catalog.</p>
         </div>  
         <button onClick={() => setShowScan(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
           📷 Scan ISBN Barcode 
         </button>  
       </header>  

        {/* Search */}
       <div className="sm:w-96">
         <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}  
          placeholder="Search by title or ISBN..."  
          className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
       </div>

       {/* Results count */}  
       <div className="flex items-center gap-2">
         <p className="text-sm text-slate-600">{books.length || 0} books found</p>
       </div>  

       {/* Books list */}
       {books.length > 0 ? (
         <div className="space-y-3">  
           {books.map(book => (
             <div key={book.isbn} className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md">  
               <div className="aspect-h-2 aspect-w-1 flex h-[80px] w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                 {book.cover_url ? (
                   <img src={book.cover_url} alt={book.title || "Book cover"} className="h-full w-full object-cover" />  
                 ) : (
                   <span className="text-2xl text-slate-300">📖</span>  
                 )}
               </div>  
               <div className="min-w-0 flex-1">  
                 <Link href={`/catalog-books/${book.isbn}`} className="font-medium text-slate-900 hover:text-indigo-600 line-clamp-1 text-sm font-semibold">
                   {book.title || "Unknown Title"} 
                 </Link>
                 <p className="mt-1 text-sm text-slate-500">  
                   {book.authors?.join(", ") || "Unknown author"}
                </p>
                  <p className="text-xs text-slate-400">{book.isbn}</p>
              </div>  
              <div className="shrink-0 text-right hidden sm:block">
               {book.book_copies ? (
                 <p className="text-sm font-medium text-slate-600">{book.book_copies.length} copy in library</p>
                ) : (  
                   <p className="text-sm font-medium text-slate-600">2 copies</p>
                  )}
              </div>  
            </div>
           ))}
         </div>
       ) : (  
         <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">  
           <p className="text-sm font-medium text-slate-600 mb-2">No books in catalog.</p>
           <p className="text-sm text-slate-500">Click "Scan ISBN" to add a new book or search above.</p>  
         </div>
       )}

       {/* ISBN Scanner Modal */}
       {showScan && (  
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
           <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white p-6 shadow-xl">
             <h2 className="text-lg font-semibold mb-4">Scan ISBN Barcode</h2>  
             <p className="text-sm text-slate-500 mb-4">Point your device camera at a book's barcode. Metadata will be auto-fetched from OpenLibrary.</p>
             
             {/* Camera placeholder */}
             <div className="aspect-video rounded-xl bg-slate-900 flex items-center justify-center mb-4">
                <span className="text-white text-sm">📷 Camera preview would go here</span>
             </div>  

             {/* Mobile mock input (since we're web-only for now) */}
             <input type="text" placeholder="Or manually enter ISBN..." className="w-full rounded-lg border px-4 py-2 text-sm mb-4" />

             <div className="flex justify-end gap-3">
               <button onClick={() => setShowScan(false)} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50">Cancel</button>  
               <button onClick={() => handleScan("978-0441172719")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
                 Scan Barcode →
              </button>  
             </div>

             {/* Result area */}
            {scanResult && (
               <div className="mt-4 rounded-lg bg-indigo-50 p-4 border border-indigo-200">
                 <p className="text-sm font-medium text-indigo-900">{scanResult}</p>
              </div>
             )}
            </div>
         </div>
       )}
     </div>
   );
}
