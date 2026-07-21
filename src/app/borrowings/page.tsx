'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

export default function BorrowingsPage() {
  const [patronMap, setPatronMap] = useState<Record<string, string>>({});
  const [patronsAll, setPatronsAll] = useState<any[]>([]);
  const [activeBorrows, setActiveBorrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [booksMap, setBooksMap] = useState<Record<string, { title: string; cover_url: string | null }>>({});

  // Filters
  const [patronFilterId, setPatronFilterId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Staff checkout modal
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutPatron, setCheckoutPatron] = useState('');
  const [checkoutBookId, setCheckoutBookId] = useState('');
  const [checkoutCopyId, setCheckoutCopyId] = useState('');
  const [searchBooks, setSearchBooks] = useState('');
  const [bookSearchResults, setBookSearchResults] = useState<any[]>([]);
  const [availableCopiesForBook, setAvailableCopiesForBook] = useState<any[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);

  // Return confirmation
  const [returnConfirm, setReturnConfirm] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

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

      // Load book titles for active borrows (via copy_id → book_id)
      const copyIds = activeList.map((b: any) => b.copy_id);
      if (copyIds.length > 0) {
        const { data: copies } = await supabase
          .from('book_copies')
          .select('id, book_id')
          .in('id', copyIds);
        if (copies) {
          const bookIds = [...new Set(copies.map((c: any) => c.book_id))];
          if (bookIds.length > 0) {
            const { data: books } = await supabase
              .from('books')
              .select('id, title, cover_url')
              .in('id', bookIds);
            if (books) {
              const bMap: Record<string, { title: string; cover_url: string | null }> = {};
              for (const b of books) {
                bMap[b.id] = { title: b.title || 'Untitled', cover_url: b.cover_url };
              }
              setBooksMap(bMap);
            }
          }
        }
      }

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
      setReturnConfirm(null);
      setReturningId(null);
     } catch (e: any) { 
      alert('Failed to mark return: ' + e.message); 
     }
   }

  async function handleSearchBooks(query: string) {
    setSearchBooks(query);
    if (query.length < 2) {
      setBookSearchResults([]);
      return;
    }
    try {
      const { data } = await supabase
        .from('books')
        .select('id, title, cover_url')
        .ilike('title', `%${query}%`)
        .limit(10);
      if (data) setBookSearchResults(data);
    } catch (e: any) {
      console.error('Book search failed:', e.message);
    }
  }

  async function handleSelectBook(bookId: string) {
    setCheckoutBookId(bookId);
    setCheckoutCopyId('');
    setSearchBooks('');
    setBookSearchResults([]);

    // Load available copies for this book
    try {
      const { data: copies } = await supabase
        .from('book_copies')
        .select('*')
        .eq('book_id', bookId);
      if (copies) {
        // Find copies that are not currently checked out
        const activeCopyIds = new Set(
          activeBorrows.filter((b: any) => !b.return_date).map((b: any) => b.copy_id)
        );
        const available = copies.filter((c: any) => !activeCopyIds.has(c.id));
        setAvailableCopiesForBook(available);
      }
    } catch (e: any) {
      console.error('Failed to load available copies:', e.message);
      setAvailableCopiesForBook([]);
    }
  }

  async function handleCheckout() {
    if (!checkoutPatron || !checkoutCopyId) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    setCheckoutSuccess(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const { error } = await supabase.from('borrows').insert({
        patron_user_id: checkoutPatron,
        copy_id: checkoutCopyId,
        checkout_date: today,
        due_date: dueDateStr,
      });

      if (error) {
        setCheckoutError(error.message);
      } else {
        const patronName = patronMap[checkoutPatron] || 'Unknown';
        const bookInfo = booksMap[checkoutCopyId] || null;
        const dueDateDisplay = new Date(dueDateStr).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        setCheckoutSuccess(
          `Checked out to ${patronName}. Due ${dueDateDisplay}.`
        );
        // Reset form
        setCheckoutPatron('');
        setCheckoutBookId('');
        setCheckoutCopyId('');
        setAvailableCopiesForBook([]);
        setTimeout(() => setCheckoutSuccess(null), 3000);
        setShowCheckoutModal(false);
        loadBorrows();
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to check out book.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  function getBookTitleForCopy(copyId: string): string {
    const borrow = activeBorrows.find((b: any) => b.copy_id === copyId);
    if (!borrow) return 'Unknown';
    // Need to look up book_id from book_copies
    // We already loaded booksMap via book_id
    // For now, we'll compute from borrows data
    return '—';
  }

  // Helper: get book title by looking at copy's book_id
  const copyBookIdCache: Record<string, string> = {};
  useEffect(() => {
    // Reload to get book titles for each borrow
    async function enrichBorrows() {
      const copyIds = activeBorrows.map((b: any) => b.copy_id);
      if (copyIds.length === 0) return;
      const { data: copies } = await supabase
        .from('book_copies')
        .select('id, book_id')
        .in('id', copyIds);
      if (copies) {
        for (const c of copies) {
          copyBookIdCache[c.id] = c.book_id;
        }
      }
      // Now load book titles
      const bookIds = [...new Set(Object.values(copyBookIdCache))];
      if (bookIds.length === 0) return;
      const { data: books } = await supabase
        .from('books')
        .select('id, title, cover_url')
        .in('id', bookIds);
      if (books) {
        const map: Record<string, { title: string; cover_url: string | null }> = {};
        for (const b of books) {
          map[b.id] = { title: b.title || 'Untitled', cover_url: b.cover_url };
        }
        setBooksMap(map);
      }
    }
    enrichBorrows();
  }, [activeBorrows]);

  function copyTitle(copyId: string): string {
    const bookId = copyBookIdCache[copyId];
    if (bookId) return booksMap[bookId]?.title || 'Untitled';
    return 'Loading...';
  }

  function copyCover(copyId: string): string | null {
    const bookId = copyBookIdCache[copyId];
    return bookId ? booksMap[bookId]?.cover_url || null : null;
  }

  // Reload book titles when booksMap changes (async enrichment)
  useEffect(() => {
    if (activeBorrows.length > 0) {
      const copyIds = activeBorrows.map((b: any) => b.copy_id);
      if (copyIds.length > 0) {
        supabase
          .from('book_copies')
          .select('id, book_id')
          .in('id', copyIds)
          .then(({ data: copies }) => {
            if (copies) {
              const bookIds = [...new Set(copies.map((c: any) => c.book_id))];
              if (bookIds.length > 0) {
                supabase
                  .from('books')
                  .select('id, title, cover_url')
                  .in('id', bookIds)
                  .then(({ data: books }) => {
                    if (books) {
                      const map: Record<string, { title: string; cover_url: string | null }> = {};
                      for (const b of books) {
                        map[b.id] = { title: b.title || 'Untitled', cover_url: b.cover_url };
                      }
                      setBooksMap(map);
                    }
                  });
              }
              // Update cache
              copies.forEach((c: any) => {
                copyBookIdCache[c.id] = c.book_id;
              });
            }
          });
      }
    }
  }, [activeBorrows]);

  // Also load books for checkout available copies
  useEffect(() => {
    if (availableCopiesForBook.length > 0) {
      const bookIds = [...new Set(availableCopiesForBook.map((c: any) => c.book_id))];
      if (bookIds.length > 0) {
        supabase
          .from('books')
          .select('id, title, cover_url')
          .in('id', bookIds)
          .then(({ data: books }) => {
            if (books) {
              const map: Record<string, { title: string; cover_url: string | null }> = {};
              for (const b of books) {
                map[b.id] = { title: b.title || 'Untitled', cover_url: b.cover_url };
              }
              setBooksMap((prev) => ({ ...prev, ...map }));
            }
          });
      }
    }
  }, [availableCopiesForBook]);

   // Display loans filtered by patron/search  and enriched with book titles
  const displayLoans = activeBorrows.filter((loan: any) => {
    if (patronFilterId && loan.patron_user_id !== patronFilterId) return false;
    if (searchTerm) {
      const name = patronMap[loan.patron_user_id] || '';
      const bookTitleStr = copyTitle(loan.copy_id).toLowerCase();
      if (!name.toLowerCase().includes(searchTerm.toLowerCase()) && !bookTitleStr.includes(searchTerm.toLowerCase())) return false;
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

         {/* Check Out Button */}
         <button
           onClick={() => {
            setShowCheckoutModal(true);
            setCheckoutError(null);
            setCheckoutSuccess(null);
           }}
           className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition"
         >
           + Check Out Book
         </button>

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
             placeholder="Search patron or book..."
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
                     <th className="py-3 pl-4">Book</th>
                     <th className="py-3">Patron</th>
                     <th className="py-3">Checkout Date</th>
                     <th className="py-3">Due Date</th>
                     <th className="py-3 text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {displayLoans.map((loan: any) => {
                    const isOverdue = !!loan.due_date && today > loan.due_date;
                    const daysLeft = loan.due_date ? (() => {
                      const due = new Date(loan.due_date);
                      const now = new Date();
                      now.setHours(0,0,0,0);
                      due.setHours(0,0,0,0);
                      return Math.ceil((due.getTime() - now.getTime()) / (1000*60*60*24));
                    })() : null;
                    return (
                       <tr key={loan.id} className={`hover:bg-slate-50 ${isOverdue ? 'bg-red-50/50' : ''}`}>
                         <td className="py-3 pl-4 whitespace-nowrap">
                           <span className={`font-medium ${isOverdue ? 'text-red-700' : 'text-slate-900'}`}>
                             {copyTitle(loan.copy_id)}
                           </span>
                         </td>
                         <td className="py-3 pl-4 whitespace-nowrap font-medium text-slate-900">
                           {patronMap[loan.patron_user_id] || 'Unknown'}
                         </td>
                         <td className="py-3 text-slate-600">
                           <span className={isOverdue ? "text-red-600 font-medium" : ""}>
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
                           <div className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                             {daysLeft !== null ? (daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d remaining`) : ''}
                           </div>
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
                           {returnConfirm === loan.id ? (
                             <div className="flex items-center gap-1">
                               <button 
                                 onClick={() => handleReturn(loan.id)}
                                 className="bg-green-600 px-2 py-1 text-xs font-medium rounded text-white hover:bg-green-700"
                               >
                                 Confirm
                               </button>
                               <button 
                                 onClick={() => { setReturnConfirm(null); setReturningId(null); }}
                                 className="bg-slate-200 px-2 py-1 text-xs font-medium rounded text-slate-700 hover:bg-slate-300"
                               >
                                 Cancel
                               </button>
                             </div>
                           ) : (
                             <button 
                               onClick={() => { setReturnConfirm(loan.id); setReturningId(loan.id); }}
                               className="text-green-600 hover:text-green-800 text-sm font-medium"
                             >
                               Mark Returned
                             </button>
                           )}
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

         {/* Checkout Modal */}
         {showCheckoutModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
             <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
               <div className="p-6">
                 <div className="flex items-center justify-between mb-4">
                   <h2 className="text-lg font-semibold text-slate-900">Check Out Book</h2>
                   <button
                     onClick={() => setShowCheckoutModal(false)}
                     className="text-slate-400 hover:text-slate-600"
                   >
                     ✕
                   </button>
                 </div>

                 {/* Patron selection */}
                 <div className="space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Patron</label>
                     <select
                       value={checkoutPatron}
                       onChange={(e) => setCheckoutPatron(e.target.value)}
                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                     >
                       <option value="">Select a patron...</option>
                       {patronsAll.map((ptn) => (
                         <option key={String(ptn.id)} value={String(ptn.id)}>
                           {ptn.name || ptn.email}
                         </option>
                       ))}
                     </select>
                   </div>

                   {/* Book search */}
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Search Book</label>
                     <input
                       type="text"
                       value={searchBooks}
                       onChange={(e) => handleSearchBooks(e.target.value)}
                       placeholder="Type to search books..."
                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                     />
                     {bookSearchResults.length > 0 && (
                       <ul className="mt-1 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                         {bookSearchResults.map((book) => (
                           <li key={book.id}>
                             <button
                               onClick={() => handleSelectBook(book.id)}
                               className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-3"
                             >
                               {book.cover_url && (
                                 <img
                                   src={book.cover_url}
                                   alt=""
                                   className="w-8 h-12 object-cover rounded"
                                 />
                               )}
                               <div>
                                 <div className="font-medium text-slate-900">{book.title}</div>
                                 <div className="text-xs text-slate-500">{book.authors?.join(', ') || ''}</div>
                               </div>
                             </button>
                           </li>
                         ))}
                       </ul>
                     )}
                     {checkoutBookId && (
                       <div className="mt-1 text-xs text-slate-500">
                         Selected: {booksMap[Object.keys(copyBookIdCache).find(k => copyBookIdCache[k] === checkoutBookId)?.toString()]?.title || '—'}
                       </div>
                     )}
                   </div>

                   {/* Available copies for selected book */}
                   {availableCopiesForBook.length > 0 && (
                     <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Available Copies</label>
                       <select
                         value={checkoutCopyId}
                         onChange={(e) => setCheckoutCopyId(e.target.value)}
                         className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                       >
                         <option value="">Select a copy...</option>
                         {availableCopiesForBook.map((copy) => (
                           <option key={copy.id} value={copy.id}>
                             Copy #{availableCopiesForBook.indexOf(copy) + 1}
                             {copy.barcode ? ` (${copy.barcode})` : ''}
                             {copy.location_name ? ` — ${copy.location_name}` : ''}
                             {copy.condition ? ` — ${copy.condition}` : ''}
                           </option>
                         ))}
                       </select>
                     </div>
                   )}

                   {/* Checkout error/success */}
                   {checkoutError && (
                     <p className="text-sm text-red-600">{checkoutError}</p>
                   )}
                   {checkoutSuccess && (
                     <p className="text-sm text-green-600 font-medium">{checkoutSuccess}</p>
                   )}
                 </div>

                 <div className="flex gap-3 mt-6">
                   <button
                     onClick={handleCheckout}
                     disabled={!checkoutPatron || !checkoutCopyId || checkoutLoading}
                     className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {checkoutLoading ? 'Checking out...' : 'Confirm Checkout'}
                   </button>
                   <button
                     onClick={() => setShowCheckoutModal(false)}
                     className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                   >
                     Cancel
                   </button>
                 </div>
               </div>
             </div>
           </div>
         )}
       </div>
   );
}
