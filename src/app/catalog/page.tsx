'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import AddBookDialog from '@/components/add-book-dialog';

export default function CatalogPage() {
  const [books, setBooks] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

   // Load catalog books on mount
  useEffect(() => {
    loadBooks();
   // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
   }, []);

  async function loadBooks() {
    try {
      let query = supabase.from('books').select('*');
      
         if (searchQuery) {
          query = query.or(`title.ilike.%${searchQuery}%,isbn.eq.${searchQuery}`);
           	}
        
        const { data } = await query;
       
      if (data) setBooks(data);
     } catch (err) {
       console.error('Failed to load catalog:', err);
     } finally {
       setLoading(false);
     }
   }

   // Refresh book list after adding a new book
  function onBookAdded() {
    setShowDialog(false);
    loadBooks();    // Refresh the catalog list
  }

  return (
     <div className="space-y-6">
       {/* Header */}
       <header>
         <h1 className="text-3xl font-bold tracking-tight text-slate-900">Catalog</h1>
         <p className="mt-2 text-sm text-slate-500">
           Browse and manage your library catalog.
         </p>
       </header>

       {/* Search */}
       <div>
         <input 
           value={searchQuery} 
           onChange={(e) => setSearchQuery(e.target.value)}
           placeholder="Search by title or ISBN..." 
           className="w-full sm:w-96 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" 
         />
       </div>

       {/* Results count */}
       <p className="text-sm text-slate-600">
         {books.length || 0} book{books.length !== 1 ? 's' : ''} found
       </p>

       {/* Add Book Button */}
       <div className="flex justify-end">
         <button
          onClick={() => setShowDialog(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
         >
           + Add Book
         </button>
       </div>

       {/* Books List */}
       {loading ? (
         <p className="text-sm text-slate-500">Loading...</p>
       ) : books.length > 0 ? (
         <div className="space-y-3">
           {books.map((book) => (
             <div 
              key={book.isbn} 
              className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md"
             >
               {/* Cover or Placeholder */}
               {book.cover_url ? (
                 <img 
                  src={book.cover_url} 
                  alt={`${book.title || ''} cover`} 
                  className="h-[80px] w-16 shrink-0 object-cover rounded-lg" 
                 />
               ) : (
                  <span className="text-2xl text-slate-300">📖</span>
               )}

               {/* Title / Author */}
               <div className="min-w-0 flex-1">
                 <p className="font-medium text-sm text-slate-900 truncate max-w-[30ch] sm:max-w-none">
                   {book.title || 'Unknown Title'} 
                 </p>
                 {book.authors?.length > 0 ? (
                   <p className="text-sm text-slate-500 mt-1">
                     {/* Display authors from the array */} {(Array.isArray(book.authors) ? book.authors : [book.authors]).filter(Boolean).join(', ')}
                   </p>
                 ) : (
                   <p className="text-sm text-slate-500 mt-1">Unknown author</p>
                 )}
               </div>

               {/* ISBN Badge */}
               <div className="shrink-0 text-right hidden sm:block">
                 <span className="text-xs text-slate-400">{book.isbn}</span>
               </div>
             </div>
           ))}
         </div>
       ) : (
         <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
           {searchQuery ? (
            <>
              <p className="text-sm font-medium text-slate-600 mb-2">No books found for "{searchQuery}".</p>
              <p className="text-sm text-slate-500">Try a different search or add a new book.</p>
            </>
           ) : (
            <>
              <p className="text-sm font-medium text-slate-600 mb-2">No books in catalog.</p>
              <p className="text-sm text-slate-500">Click "+ Add Book" to add your first book.</p>
            </>
           )}
         </div>
       )}

       {/* Add Book Dialog Modal */}
       <AddBookDialog 
        isOpen={showDialog} 
        onClose={onBookAdded} 
      />
     </div>
   );
}
