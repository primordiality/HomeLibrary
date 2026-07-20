'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/client';

export default function BooksBrowsePage() {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState('');
  const [titleF, setTitleF] = useState('');
  const [authorF, setAuthorF] = useState('');
  const [isbnF, setIsbnF] = useState('');

  useEffect(() => {
    loadBooks();
   }, []);

  async function loadBooks() {
    setLoading(true);
    try {
      const { data } = await supabase.from('books').select('*').order('title', { ascending: true });
      if (data) setBooks(data);
     } catch (err) { console.error('Failed to load books:', err); }
    finally { setLoading(false); }
   }

  const filtered = books.filter((b) => {
    if (qText && !matchesQ(b, qText)) return false;
    if (titleF && !(b.title || '').toLowerCase().includes(titleF.toLowerCase()) &&
        !(b.subtitle || '').toLowerCase().includes(titleF.toLowerCase())) return false;
    if (authorF && !((b.authors || []).join(' ') + ' ' + (b.author || '')).toLowerCase().includes(authorF.toLowerCase())) return false;
    if (isbnF && !String(b.isbn || '').includes(isbnF)) return false;
    return true;
   });

  function matchesQ(book: any, q: string): boolean {
    const ql = q.toLowerCase();
    return (book.title || '').toLowerCase().includes(ql) ||
           ((book.authors || []).join(' ') + ' ' + (book.author || '')).toLowerCase().includes(ql) ||
           String(book.isbn || '').includes(q);
   }

  return (
     <div className="space-y-6">
       <header>
         <h1 className="text-3xl font-bold tracking-tight text-slate-900">Browse Books</h1>
         <p className="mt-2 text-sm text-slate-500">Search and find books across all libraries.</p>
       </header>

       {/* Search + Filters */}
       <div className="space-y-3">
         <input value={qText} onChange={(e) => setQText(e.target.value)}
           placeholder="Quick search: title, author, or ISBN..."
           className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
         <div className="flex flex-col sm:flex-row gap-3">
           <input value={titleF} onChange={(e) => setTitleF(e.target.value)}
             placeholder="Title contains..."
             className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
           <input value={authorF} onChange={(e) => setAuthorF(e.target.value)}
             placeholder="Author contains..."
             className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
           <input value={isbnF} onChange={(e) => setIsbnF(e.target.value)}
             placeholder="ISBN contains..."
             className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
         </div>
       </div>

       <p className="text-sm text-slate-600">
         {filtered.length || 0} book{filtered.length !== 1 ? 's' : ''} found
       </p>

       {loading ? (
         <p className="text-sm text-slate-500">Loading...</p>
       ) : filtered.length > 0 ? (
         <div className="space-y-3">
         {filtered.map((book) => (
           <Link key={book.id} href={`/books/${book.id}`}
            className="block no-underline">
             <div className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md hover:border-indigo-200 cursor-pointer">
               {book.cover_url ? (
                 <img src={book.cover_url} alt=""
                  className="h-[80px] w-16 shrink-0 object-cover rounded-lg" />
               ) : (
                 <span className="text-2xl text-slate-300">{'\u{1F4DA}'}</span>
               )}
               <div className="min-w-0 flex-1">
                 <p className="font-medium text-sm text-slate-900 truncate">{book.title || 'Unknown'}</p>
                 <p className="text-sm text-slate-500 mt-1">{book.authors?.join(', ') || book.author || 'Unknown author'}</p>
               </div>
               <div className="shrink-0 flex items-center gap-2">
                 <span className="text-xs text-slate-400 font-mono hidden sm:inline">{book.isbn || 'No ISBN'}</span>
                 <Link href={`/books/${book.id}/edit`} className="rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 whitespace-nowrap">Edit</Link>
               </div>
               </div>
           </Link>
         ))}
         </div>
       ) : (
         <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
           {qText || titleF || authorF || isbnF ? (
             <><p className="text-sm font-medium text-slate-600 mb-2">No books found.</p>
                <p className="text-sm text-slate-500">Try a different search or add a new book.</p></>
           ) : (
             <><p className="text-sm font-medium text-slate-600 mb-2">No books in catalog.</p>
                <p className="text-sm text-slate-500">Add your first book from the Library page.</p></>
           )}
         </div>
       )}

       <div className="flex justify-end">
         <Link href="/libraries/1/manage-books"
           className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
           + Add Book
         </Link>
       </div>

       <div className="flex gap-4 mt-6 pt-4 border-t border-slate-200">
         <Link href="/catalog" className="text-sm text-indigo-600 hover:text-indigo-800">Back to Catalog</Link>
         <Link href="/libraries/1/manage-books" className="text-sm text-slate-500 hover:text-slate-700">Manage Books</Link>
       </div>
     </div>
   );
}
