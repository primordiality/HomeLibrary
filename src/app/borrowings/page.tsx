'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getBookSettings, BookSettings } from '@/lib/book-settings';

function BorrowingsContent() {
  const searchParams = useSearchParams();
  const urlPatronId = searchParams.get('patronId') || '';

  const [patronMap, setPatronMap] = useState<Record<string, string>>({});
  const [patronsAll, setPatronsAll] = useState<any[]>([]);
  const [activeBorrows, setActiveBorrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [booksMap, setBooksMap] = useState<Record<string, { title: string; cover_url: string | null }>>({});

  // Filters
  const [patronFilterId, setPatronFilterId] = useState(urlPatronId);
  const [searchTerm, setSearchTerm] = useState('');

  // Staff checkout modal
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutPatron, setCheckoutPatron] = useState('');
  const [checkoutBookId, setCheckoutBookId] = useState('');
  const [checkoutBookTitle, setCheckoutBookTitle] = useState('');
  const [checkoutCopyId, setCheckoutCopyId] = useState('');
  const [searchBooks, setSearchBooks] = useState('');
  const [bookSearchResults, setBookSearchResults] = useState<any[]>([]);
  const [availableCopiesForBook, setAvailableCopiesForBook] = useState<any[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserPatronId, setCurrentUserPatronId] = useState('');
  const [currentUserIsPatron, setCurrentUserIsPatron] = useState(false);

  // Book settings for checkout modal
  const [bookSettings, setBookSettings] = useState<BookSettings | null>(null);

  // Return confirmation
  const [returnConfirm, setReturnConfirm] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  // Hold tab
  const [activeTab, setActiveTab] = useState<'borrows' | 'holds'>('borrows');
  const [holds, setHolds] = useState<any[]>([]);
  const [holding, setHolding] = useState(false);
  const [holdingAction, setHoldingAction] = useState<Record<string, boolean>>({});

  // Hold queues for position calculation
  const [bookHoldQueues, setBookHoldQueues] = useState<Record<string, any[]>>({});

  // Load current user when modal opens
  useEffect(() => {
    async function loadCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser(user);
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profile) {
          setCurrentUserPatronId(user.id);
          setCheckoutPatron(user.id);
        }
        setCurrentUserIsPatron(profile?.role === 'patron');
      }
    }
    if (showCheckoutModal) loadCurrentUser();
  }, [showCheckoutModal]);

  useEffect(() => {
    loadPatrons();
    loadBorrows();
    loadHolds();
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

  async function loadHolds() {
    try {
      const { data, error } = await supabase
        .from('holds')
        .select('*')
        .in('status', ['waiting', 'accepted'])
        .order('created_at', { ascending: true });
      
      if (error) throw new Error(error.message);
      const activeHolds = (data ?? []).filter((h: any) => h.status === 'waiting' || h.status === 'accepted');
      setHolds(activeHolds);

      // Build queue per book for position calculation
      const queueMap: Record<string, any[]> = {};
      for (const h of activeHolds) {
        if (!queueMap[h.book_id]) queueMap[h.book_id] = [];
        queueMap[h.book_id].push(h);
      }
      setBookHoldQueues(queueMap);
    } catch (e: any) {
      console.error('Failed to load holds:', e.message);
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
    const book = bookSearchResults.find((b: any) => b.id === bookId);
    setCheckoutBookId(bookId);
    setCheckoutBookTitle(book?.title || booksMap[bookId]?.title || 'Unknown');
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
        // Auto-select if only 1 copy available
        if (available.length === 1) {
          setCheckoutCopyId(available[0].id);
        } else {
          setCheckoutCopyId('');
        }
      }
    } catch (e: any) {
      console.error('Failed to load available copies:', e.message);
      setAvailableCopiesForBook([]);
      setCheckoutCopyId('');
    }

    // Load book settings to check if checkouts/holds are enabled
    try {
      const settings = await getBookSettings(bookId, '');
      setBookSettings(settings);
    } catch (e: any) {
      console.error('Failed to load book settings:', e.message);
      setBookSettings({ public: true, holds_enabled: true, checkouts_enabled: true });
    }
  }

  async function handleCheckout() {
    if (!checkoutPatron || !checkoutCopyId) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    setCheckoutSuccess(null);
    try {
      // Final check: verify the copy's checkouts_enabled flag
      const { data: copyData } = await supabase
        .from('book_copies')
        .select('checkouts_enabled')
        .eq('id', checkoutCopyId)
        .single();

      if (!copyData?.checkouts_enabled) {
        setCheckoutError('This book copy is not available for checkouts.');
        setCheckoutLoading(false);
        return;
      }

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
        setBookSettings(null);
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

  // Hold management actions
  async function handleMarkReady(holdId: string) {
    setHoldingAction(prev => ({ ...prev, [holdId]: true }));
    try {
      const { error } = await supabase
        .from('holds')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', holdId);
      
      if (error) throw new Error(error.message);
      
      // Refresh holds
      loadHolds();
    } catch (e: any) {
      alert('Failed to mark hold as ready: ' + e.message);
    } finally {
      setHoldingAction(prev => ({ ...prev, [holdId]: false }));
    }
  }

  async function handleCancelHold(holdId: string) {
    if (!window.confirm('Cancel this hold?')) return;
    setHoldingAction(prev => ({ ...prev, [holdId]: true }));
    try {
      const { error } = await supabase
        .from('holds')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', holdId);
      
      if (error) throw new Error(error.message);
      
      // Refresh holds
      loadHolds();
    } catch (e: any) {
      alert('Failed to cancel hold: ' + e.message);
    } finally {
      setHoldingAction(prev => ({ ...prev, [holdId]: false }));
    }
  }

  function copyBookIdFromCopyId(copyId: string): string | null {
    const borrow = activeBorrows.find((b: any) => b.copy_id === copyId);
    if (!borrow) {
      for (const b of activeBorrows) {
        if (b.copy_id === copyId) {
          return null;
        }
      }
    }
    const bookIdFromBorrow = copyBookIdCache[copyId];
    return bookIdFromBorrow || null;
  }

  // Helper: get book title by looking at copy's book_id
  const copyBookIdCache: Record<string, string> = {};
  useEffect(() => {
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

  function getHoldPosition(hold: any): number {
    const queue = bookHoldQueues[hold.book_id] || [];
    return queue.findIndex((h: any) => h.id === hold.id) + 1;
  }

  function copiesAvailableForBook(bookId: string): boolean {
    if (!copiesByBook[bookId]) return false;
    const checkedOutCopyIds = new Set(displayLoans.filter(l => {
      const bid = copyBookIdCache[l.copy_id];
      return bid === bookId;
    }).map(l => l.copy_id));
    return copiesByBook[bookId].some((c: any) => !checkedOutCopyIds.has(c.id));
  }

  const copiesByBook: Record<string, any[]> = {};
  useEffect(() => {
    async function loadCopies() {
      const bookIds = [...new Set(holds.map((h: any) => h.book_id))];
      if (bookIds.length === 0) return;
      const { data: copies } = await supabase
        .from('book_copies')
        .select('id, book_id')
        .in('book_id', bookIds);
      if (copies) {
        for (const c of copies) {
          if (!copiesByBook[c.book_id]) copiesByBook[c.book_id] = [];
          copiesByBook[c.book_id].push(c);
        }
      }
    }
    loadCopies();
  }, [holds]);

  const [resolvedCopiesByBook, setResolvedCopiesByBook] = useState<Record<string, any[]>>({});
  useEffect(() => {
    if (Object.keys(copiesByBook).length > 0) {
      setResolvedCopiesByBook(JSON.parse(JSON.stringify(copiesByBook)));
    }
  }, [JSON.stringify(copiesByBook)]);

  function copiesAvailableForBookChecked(bookId: string): boolean {
    const copies = resolvedCopiesByBook[bookId] || [];
    if (copies.length === 0) return false;
    const checkedOutCopyIds = new Set(displayLoans.filter(l => {
      const bid = copyBookIdCache[l.copy_id];
      return bid === bookId;
    }).map(l => l.copy_id));
    return copies.some((c: any) => !checkedOutCopyIds.has(c.id));
  }

  // ─── Modal helpers ───
  function resetCheckoutModal() {
    setCheckoutBookId('');
    setCheckoutBookTitle('');
    setAvailableCopiesForBook([]);
    setCheckoutCopyId('');
    setBookSettings(null);
  }

  const checkoutsDisabled = bookSettings && !bookSettings.checkouts_enabled;
  const holdsDisabled = bookSettings && !bookSettings.holds_enabled;

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

         {/* Tab navigation for borrows vs holds */}
         <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
           <button
             onClick={() => setActiveTab('borrows')}
             className={`px-4 py-1.5 text-sm font-medium transition ${
               activeTab === 'borrows'
                 ? 'bg-indigo-600 text-white'
                 : 'bg-white text-slate-600 hover:bg-slate-50'
             }`}
           >
             Active Loans
           </button>
           <button
             onClick={() => setActiveTab('holds')}
             className={`px-4 py-1.5 text-sm font-medium transition ${
               activeTab === 'holds'
                 ? 'bg-indigo-600 text-white'
                 : 'bg-white text-slate-600 hover:bg-slate-50'
             }`}
           >
             Holds Queue
           </button>
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
             placeholder="Search patron or book..."
             className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" 
           />
         </div>

         {/* BORROWS TAB */}
         {activeTab === 'borrows' && (
           loading ? (
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
           )
         )}

         {/* HOLDS TAB */}
         {activeTab === 'holds' && (
           holds.length > 0 ? (
             <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
               <table className="w-full text-sm">
                 <thead className="border-b bg-slate-50">
                   <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                     <th className="py-3 pl-4">Patron</th>
                     <th className="py-3">Book</th>
                     <th className="py-3 hidden sm:table-cell">Library</th>
                     <th className="py-3 hidden sm:table-cell">Copy Available?</th>
                     <th className="py-3">Position</th>
                     <th className="py-3">Status</th>
                     <th className="py-3 hidden md:table-cell">Placed On</th>
                     <th className="py-3 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {holds.map((hold: any) => {
                     const position = getHoldPosition(hold);
                     const patronName = patronMap[hold.patron_user_id] || 'Unknown';
                     const bookInfo = booksMap[hold.book_id];
                     const bookTitleStr = bookInfo?.title || 'Unknown Book';
                     const hasCopyAvailable = copiesAvailableForBookChecked(hold.book_id);

                     return (
                       <tr key={hold.id} className="hover:bg-slate-50">
                         <td className="py-3 pl-4 whitespace-nowrap font-medium text-slate-900">
                           {patronName}
                         </td>
                         <td className="py-3">
                           <Link
                             href={`/catalog/${hold.book_id}`}
                             className="text-indigo-600 hover:text-indigo-800 text-sm"
                           >
                             {bookTitleStr}
                           </Link>
                         </td>
                         <td className="py-3 text-slate-600 hidden sm:table-cell">
                           {hold.library_id || '—'}
                         </td>
                         <td className="py-3 hidden sm:table-cell">
                           {hasCopyAvailable ? (
                             <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                               Yes
                             </span>
                           ) : (
                             <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                               No
                             </span>
                           )}
                         </td>
                         <td className="py-3">
                           {hold.status === 'waiting' ? (
                             <span className="font-medium text-amber-700">#{position}</span>
                           ) : (
                             <span className="text-green-700">Accepted</span>
                           )}
                         </td>
                         <td className="py-3">
                           {hold.status === 'waiting' ? (
                             <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                               Waiting
                             </span>
                           ) : hold.status === 'accepted' ? (
                             <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                               Ready to pick up
                             </span>
                           ) : (
                             <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                               Cancelled
                             </span>
                           )}
                         </td>
                         <td className="py-3 text-slate-600 hidden md:table-cell">
                           {new Date(hold.created_at).toLocaleDateString()}
                         </td>
                         <td className="py-3 text-right">
                           {hold.status === 'waiting' ? (
                             <div className="flex items-center justify-end gap-2">
                               <button
                                 onClick={() => handleMarkReady(hold.id)}
                                 disabled={holdingAction[hold.id]}
                                 className="bg-green-600 px-2.5 py-1 text-xs font-medium rounded text-white hover:bg-green-700 transition disabled:opacity-50"
                               >
                                 {holdingAction[hold.id] ? 'Setting...' : 'Mark Ready'}
                               </button>
                               <button
                                 onClick={() => handleCancelHold(hold.id)}
                                 disabled={holdingAction[hold.id]}
                                 className="bg-red-600 px-2.5 py-1 text-xs font-medium rounded text-white hover:bg-red-700 transition disabled:opacity-50"
                               >
                                 {holdingAction[hold.id] ? 'Cancelling...' : 'Cancel'}
                               </button>
                             </div>
                           ) : hold.status === 'accepted' ? (
                             <button
                               onClick={() => handleCancelHold(hold.id)}
                               disabled={holdingAction[hold.id]}
                               className="bg-red-600 px-2.5 py-1 text-xs font-medium rounded text-white hover:bg-red-700 transition disabled:opacity-50"
                             >
                               {holdingAction[hold.id] ? 'Cancelling...' : 'Cancel'}
                             </button>
                           ) : (
                             <span className="text-xs text-slate-400">—</span>
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
               <p className="text-sm font-medium text-slate-600">No active holds</p>
               <p className="text-sm text-slate-500">
                 Holds placed by patrons will appear here.
               </p>
             </div>
           )
         )}

         {/* Manage Patrons Link */}
         <div className="flex justify-between items-center">
           <Link href="/patrons" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">{activeTab === 'borrows' ? '<-- Back to Patrons' : '<-- Back to Patrons'}</Link>
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

                 {/* ── Patron selection ── */}
                 <div className="space-y-4">
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Patron</label>
                     {currentUserIsPatron && currentUserPatronId ? (
                       <div className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-slate-700">
                         {patronMap[currentUserPatronId] || currentUser?.email || 'Unknown'}
                       </div>
                     ) : (
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
                     )}
                   </div>

                   {/* ── Book search ── */}
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
                       <div className="mt-1 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-slate-700">
                         <span className="text-indigo-600">✓</span>
                         <span className="font-medium">{checkoutBookTitle || '—'}</span>
                         <button
                           onClick={resetCheckoutModal}
                           className="ml-auto text-slate-400 hover:text-slate-600"
                         >
                           ✕
                         </button>
                       </div>
                     )}
                   </div>

                   {/* ── Settings messages for selected book ── */}
                   {bookSettings && checkoutBookId && (
                     <div className="space-y-2">
                       {!bookSettings.checkouts_enabled && (
                         <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                           This book cannot be checked out at this library.
                         </div>
                       )}
                       {!bookSettings.holds_enabled && (
                         <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                           Holds are not available for this book.
                         </div>
                       )}
                     </div>
                   )}

                   {/* ── Available copies for selected book ── */}
                   {availableCopiesForBook.length > 1 && (
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Available Copies</label>
                     <select
                       value={checkoutCopyId}
                       onChange={(e) => setCheckoutCopyId(e.target.value)}
                       disabled={!bookSettings?.checkouts_enabled}
                       className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
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

                   {/* Single copy available */}
                   {availableCopiesForBook.length === 1 && (
                   <div className={`rounded-lg border px-3 py-2 text-sm ${checkoutsDisabled ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-slate-700'}`}>
                     <div className="flex items-center gap-2">
                       <span className={bookSettings?.checkouts_enabled ? 'text-emerald-600' : 'text-red-600'}>
                         {bookSettings?.checkouts_enabled ? '✓' : '✕'}
                       </span>
                       <span className="font-medium">
                         {bookSettings?.checkouts_enabled ? '1 copy available' : 'Checkouts disabled for this book'}
                       </span>
                     </div>
                     {bookSettings?.checkouts_enabled && availableCopiesForBook[0].barcode && (
                       <div className="mt-1 text-xs text-slate-500">
                         Barcode: {availableCopiesForBook[0].barcode}
                         {availableCopiesForBook[0].location_name ? ` — ${availableCopiesForBook[0].location_name}` : ''}
                         {availableCopiesForBook[0].condition ? ` — ${availableCopiesForBook[0].condition}` : ''}
                       </div>
                     )}
                   </div>
                   )}

                   {/* No copies available */}
                   {checkoutBookId && availableCopiesForBook.length === 0 && (
                   <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                     No copies available for checkout.
                   </div>
                   )}

                   {/* ── Error / success ── */}
                   {checkoutError && (
                     <p className="text-sm text-red-600">{checkoutError}</p>
                   )}
                   {checkoutSuccess && (
                     <p className="text-sm text-green-600 font-medium">{checkoutSuccess}</p>
                   )}
                 </div>

                 {/* ── Buttons ── */}
                 <div className="flex gap-3 mt-6">
                   <button
                     onClick={handleCheckout}
                     disabled={!checkoutPatron || !checkoutCopyId || checkoutLoading || checkoutsDisabled}
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

function BorrowingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
      <BorrowingsContent />
    </Suspense>
  );
}

export default BorrowingsPage;
