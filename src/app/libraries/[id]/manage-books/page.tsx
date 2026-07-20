'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AddBookDialog from '@/components/add-book-dialog';

export default function ManageBooksPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const libraryId: string = typeof params?.id === 'string' ? params.id : '';

    // Local state
  const [library, setLibrary] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [otherLibraries, setOtherLibraries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

    // Actions
  const [moving, setMoving] = useState(false);
  const [removingSelected, setRemovingSelected] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);

    // Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Selections
  const [selectedCopyIds, setSelectedCopyIds] = useState<Set<string>>(new Set());
  const [moveTargetLibId, setMoveTargetLibId] = useState('');

    // Add book dialog
   const [showAddDialog, setShowAddDialog] = useState(false);

       // Inline editing state
   const [editingCopies, setEditingCopies] = useState<Set<string>>(new Set());
   const [editData, setEditData] = useState<Record<string, any>>({});

       // ─── Load everything on mount ─────────────
  useEffect(() => {
    if (!libraryId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
    }, [libraryId]);

      async function loadAll() {
     setLoading(true);

         // This library
       const { data: lib } = await supabase
         .from('libraries')
         .select('*')
         .eq('id', libraryId)
          .single();

       if (!lib) { router.replace('/libraries'); return; }
       setLibrary(lib);

         // Book copies in this library
         const { data: copies, error: cErr } = await supabase
             .from('book_copies')
             .select('*, books (isbn, title, subtitle, authors)')
             .eq('library_id', libraryId);

         if (cErr) console.error('book_copies query failed:', cErr);
         if (copies) setBooks(copies.map((c: any) => ({ ...c, _bi: c.books ?? {} })));

           // Other libraries (for move target dropdown)
       const { data: other } = await supabase
            .from('libraries')
            .select('id, name')
            .neq('id', libraryId)
            .eq('is_archived', false)
            .order('name');

       if (other) setOtherLibraries(other);
       setLoading(false);
      }

       // ─── Selection helpers ──────────────────
  const toggleSelectAll = () => {
    if (selectedCopyIds.size === books.length) setSelectedCopyIds(new Set());
    else setSelectedCopyIds(new Set(books.map((b: any) => b.id)));
   };

  const toggleSelectCopy = (copyId: string) => {
     const u = new Set(selectedCopyIds);
     u.has(copyId) ? u.delete(copyId) : u.add(copyId);
    setSelectedCopyIds(u);
    };

       // ─── Batch move selected copies to another library ──────
  const handleBatchMove = async () => {
    setErrorMessage(null);
    if (moveTargetLibId === '') return setErrorMessage('Select a target library first.');
    if (selectedCopyIds.size === 0) return setErrorMessage('Select at least one book to move.');

    try {
      const ids = Array.from(selectedCopyIds);
      setMoving(true);

       const { error } = await supabase
          .from('book_copies')
          .update({ library_id: moveTargetLibId })
          .in('id', ids);

       if (error) throw new Error(error.message);

       setSuccessMessage(`${ids.length} book(s) moved successfully!`);
       setSelectedCopyIds(new Set());
       setMoveTargetLibId('');
       setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: unknown) {
       setErrorMessage((err as Error).message || 'Failed to move books.');
       } finally { setMoving(false); }
     };

      // ─── Remove selected copies ──────────────────────
  const handleRemoveSelected = async () => {
     setErrorMessage(null);
     if (selectedCopyIds.size === 0) return setErrorMessage('Select books to remove.');

      try {
       const ids = Array.from(selectedCopyIds);
       setRemovingSelected(true);

       const { error } = await supabase
           .from('book_copies')
            .delete()
           .in('id', ids);

       if (error) throw new Error(error.message);

        setSuccessMessage(`${ids.length} book(s) removed successfully!`);
       setSelectedCopyIds(new Set());
       setTimeout(() => { router.refresh(); }, 1500);
       } catch (err: unknown) {
       setErrorMessage((err as Error).message || 'Failed to remove books.');
       } finally { setRemovingSelected(false); }
      };

       // ─── Remove ALL books from this library ──────────────
  const handleRemoveAllBooks = async () => {
    setErrorMessage(null);

   try {
       setRemovingAll(true);

     const { error } = await supabase
          .from('book_copies')
           .delete()
          .eq('library_id', libraryId);

       if (error) throw new Error(error.message);

        setSuccessMessage('All books removed from this library!');
       setSelectedCopyIds(new Set());
       setTimeout(() => router.refresh(), 1500);
       } catch (err: unknown) {
       setErrorMessage((err as Error).message || 'Failed to remove all books.');
       } finally { setRemovingAll(false); }
      };

        // ─── Refresh after adding a new book ──────────────
  function onBookAdded() {
    setShowAddDialog(false);
    loadAll();      // Refresh list immediately
   }

        // ─── Inline Copy Edit Handlers ──────────────
  function startEdit(copyId: string) {
    setEditingCopies(new Set([copyId]));
    const book = books.find(b => b.id === copyId);
    if (book) setEditData({ ...book });
   }

  function cancelEdit() {
    setEditingCopies(new Set());
    setEditData({});
   }

  async function handleSaveEdit(copyId: string) {
    const original = books.find((b: any) => b.id === copyId);
    if (!original) return;

     // Nothing changed? Skip save.
     if (editData.condition === original.condition && 
          editData.notes === original.notes &&
          editData.barcode === original.barcode) {
      cancelEdit();
      return;
     }

    try {
       const updates: Record<string, unknown> = {};
      if (editData.condition !== original.condition) 
        updates.condition = editData.condition || 'good';
      if ((editData.notes ?? '') !== (original.notes ?? '')) 
        updates.notes = editData.notes?.trim() || null;
      if (editData.barcode !== original.barcode) 
        updates.barcode = editData.barcode?.trim() || null;

       const { error } = await supabase
         .from('book_copies')
           .update(updates)
           .eq('id', copyId);

       if (error) throw new Error(error.message);

       setSuccessMessage('Copy updated!');
        setTimeout(() => setSuccessMessage(null), 2000);
      loadAll();    // Refresh list
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Save failed.');
     } finally {
       cancelEdit();
       }
   }

       // ─── Loading guard ──────────────────────────
   if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
   if (!library) return <p className="text-sm text-slate-500">Library not found.</p>;

   const otherOptions = otherLibraries.map((l: any) => ({ value: l.id, label: l.name }));

    return (
       <div className="space-y-6">
           {/* ── Header ─────────────── */}
          <header>
            <h1 className="text-3xl font-bold text-slate-900">Manage Books</h1>
             <p className="mt-2 text-sm text-slate-500">
              {library.name}: {books.length} book{books.length !== 1 ? 's' : ''} in this library
            </p>
          </header>

        {/* ── Messages ─────────────── */}
        {successMessage && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
           )}
          {errorMessage && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
            )}

        {/* ── Add Book Button (always visible) ├── */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
           >
             + Add Book
           </button>
         </div>

        {/* ── Books List with Checkboxes ─── */}
        {books.length === 0 ? (
            <p className="text-sm text-slate-500">No books in this library yet.</p>
          ) : (
         <div className="mt-2">
                {/* "Select All" sticky bar */}
                <div className="sticky top-16 z-10 flex items-center justify-between bg-white px-3 py-2 border-b rounded-t-xl">
                  <div className="flex items-center gap-2">
                     <input
                       type="checkbox"
                       checked={selectedCopyIds.size === books.length && books.length > 0}
                        onChange={toggleSelectAll}
                       className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                         />
                     <span className="text-xs text-slate-500">
                      {selectedCopyIds.size} of {books.length} selected
                    </span>
                   </div>
                    {selectedCopyIds.size > 0 && (
                        <button onClick={() => setSelectedCopyIds(new Set())}
                        className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
                       )}
               </div>

                  {/* Book rows */}
                <div className="divide-y divide-slate-100">
                      {books.map((book: any) => {
                      const isChecked = selectedCopyIds.has(book.id);
                      const isEditing = editingCopies.has(book.id);
                      return (
                      <div
                      key={book.id}
                       className={`px-3 py-3 border-b border-slate-100 ${isEditing ? "bg-green-50" : isChecked ? "bg-indigo-50" : ""}`}
                      >
                        {/* Checkbox + actions wrapper */}
                        <div className={`flex items-center gap-2 ${!isEditing ? '' : 'mb-3'}`}>
                          {!isEditing && (
                            <input
                             type="checkbox"
                              checked={isChecked}
                               onChange={() => toggleSelectCopy(book.id)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                                />
                          )}

                          {/* ─── VIEW MODE ─────────────────── */}
                          {!isEditing && (<>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-medium text-slate-900 truncate">{book._bi?.title ?? 'Unknown Book'}</p>
                             <p className="text-xs text-slate-500">{book.book_isbn ?? '-'}</p>
                           </div>

                           <div className="flex items-center gap-2 flex-shrink-0">
                               {book.book_isbn ? (
                                 <Link href={`/books/${encodeURIComponent(book.book_isbn)}/edit`} className="rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 whitespace-nowrap">Edit</Link>
                               ) : (
                                 <Link href={`/books/-${book.id}/edit`} className="rounded-md border border-indigo-300 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 whitespace-nowrap">Edit</Link>
                               )}

                             <button
                              onClick={() => startEdit(book.id)}
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap">
                              Edit Copy</button>

                             <span className={`px-2 py-0.5 rounded-full text-xs ${book.condition === 'new' ? 'bg-green-100 text-green-800' : book.condition === 'good' ? 'bg-blue-100 text-blue-800' : book.condition === 'fair' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                               {book.condition}</span>
                             <span className="text-xs text-slate-400 hidden sm:inline">{book.barcode ?? '-'}</span>
                           </div>
                         </>)}

                          {/* ─── EDIT MODE ───────────────────── */}
                          {isEditing && (<>
                            <div className="flex items-center gap-2 mb-2">
                              <button onClick={() => startEdit(book.id)} className="text-xs text-green-700 font-medium hover:underline">{'\\u{1F4DD}'} Editing</button>
                              <span className="text-xs text-slate-500">• {book._bi?.title ?? 'Unknown'}</span>
                            </div>

                            {/* Condition select */}
                            <div className="mb-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
                              <select
                                value={editData.condition || 'good'}
                                onChange={(e) => setEditData({...editData, condition: e.target.value})}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500">
                                 <option value="new">New</option>
                                 <option value="good">Good</option>
                                 <option value="fair">Fair</option>
                                 <option value="poor">Poor</option>
                                 <option value="damaged">Damaged</option>
                               </select>
                             </div>

                            {/* Barcode */}
                              <div className="mb-2">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Barcode</label>
                                <input
                                 type="text"
                                  value={editData.barcode || ''}
                                  onChange={(e) => setEditData({...editData, barcode: e.target.value})}
                                   className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500" />
                           </div>

                            {/* Notes */}
                              <div className="mb-3">
                              <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                                <textarea
                                   rows={2}
                                  value={editData.notes || ''}
                                    onChange={(e) => setEditData({...editData, notes: e.target.value})}
                                     className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:border-green-500 focus:ring-green-500" />
                                </div>

                            {/* Save / Cancel */}
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleSaveEdit(book.id)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 shadow-sm">Save</button>
                                <button onClick={cancelEdit} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                              </div>
                             </>)}
                       </div>

                      {isEditing && (book.book_isbn ? (
                         <Link href={`/books/${encodeURIComponent(book.book_isbn)}/edit`} className="block text-center text-xs text-indigo-600 hover:text-indigo-800 py-1">Also edit book metadata</Link>
                       ) : (
                         <Link href={`/books/-${book.id}/edit`} className="block text-center text-xs text-indigo-600 hover:text-indigo-800 py-1">Also edit book metadata</Link>
                       ))}
                      </div>
                      );
                      })}
               </div>
             </div>
          )}

         {/* ── Batch Actions Toolbar ─────────── */}
        {selectedCopyIds.size > 0 && <hr className="my-4" />}

        {selectedCopyIds.size === 0 ? (
           <p className="text-sm text-slate-500">Select books above to move or remove them.</p>
          ) : (
            <div className={`rounded-xl border p-4 shadow-sm ${selectedCopyIds.size > 0 && "border-indigo-300 bg-indigo-50"}`}>

                {/* Move To dropdown + button */}
               <div className="flex flex-col sm:flex-row gap-2">
                 <label htmlFor="move-target" className="text-sm font-medium text-slate-700 sm:mr-2 sm:self-center whitespace-nowrap">Move To:</label>
                  <select id="move-target" value={moveTargetLibId} onChange={(e) => setMoveTargetLibId(e.target.value)}
                  className="block w-full sm:w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500">
                   <option value="">Select a library</option>
                     {otherOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    <option value="__none__">-- None -- (mark as unfiled)</option>
                 </select>
                  <button onClick={handleBatchMove} disabled={moving || moveTargetLibId === ""}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                         {moving ? "Moving..." : `Move ${selectedCopyIds.size}`}
                       </button>
                  </div>

                {/* Remove selected */}   <hr className="my-4" />   <button onClick={handleRemoveSelected} disabled={removingSelected}
                     className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 border border-red-200 hover:bg-red-100">
                        {removingSelected ? "Removing..." : `Remove ${selectedCopyIds.size} Book(s)`}
                      </button>

               <div className="mt-3 bg-yellow-50 rounded-lg p-3 text-xs text-yellow-800">
                  Note: Moving books changes their library_id. You can assign new location/shelf numbers later in the destination library.
                </div>
             </div>
           )}

         {/* ── Destructive: Remove ALL Books ─────────── */}
        <div className="mt-6 p-4 border border-red-200 rounded-xl bg-red-50">
            <p className="text-sm font-medium text-red-700 mb-1">Destructive Action</p>   <button onClick={handleRemoveAllBooks} disabled={removingAll || books.length === 0}
            className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50">
            {books.length === 0 ? "No Books to Remove" : `Remove ALL ${books.length} Books From This Library`}
          </button>
         <p className="mt-2 text-xs text-slate-600">This permanently deletes every book copy. The library itself remains but without any books.</p>
       </div>

        {/* ── Add Book Dialog (shared across pages) ─────── */}
        <AddBookDialog 
         isOpen={showAddDialog} 
         onClose={onBookAdded}
        />

      {/* ── Nav Links ─────────────── */}
       <div className="flex flex-col sm:flex-row gap-3 items-start mt-6 pt-4 border-t border-slate-200">
          <Link href={`/libraries/${libraryId}/edit`}
           className="text-sm font-medium text-indigo-600 hover:text-indigo-800">&larr; Edit Library</Link>
        <Link href={`/catalog`}
            className="text-sm text-slate-500 hover:text-slate-700">View Catalog &rarr;</Link>
       </div>
      </div>
    );
}
