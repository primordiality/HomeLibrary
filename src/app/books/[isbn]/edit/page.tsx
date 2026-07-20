'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { fetchBookByIsbn, cleanIsbn } from '@/lib/openlibrary';

export default function EditBookPage() {
  const params = useParams<{ isbn: string }>();
  const router = useRouter();
  const raw = params?.isbn ?? '';

  // Detect surrogate fallback ID (prefixed with '-') for no-ISBN books stored in book_copies
  const isFallback = raw.startsWith('-');
  const lookupId = isFallback ? raw.slice(1) : raw;

  const [isbn, setIsbn] = useState(raw);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [pagesStr, setPagesStr] = useState('');
  const [notes, setNotes] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [copies, setCopies] = useState<any[]>([]);
  const [patrons, setPatrons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delting, setDelting] = useState(false);
  const [errorStr, setErrorStr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [fetchingCover, setFetchingCover] = useState(false);
  const [showDelModal, setShowDelModal] = useState(false);
  // Track whether book was loaded via fallback copy ID (no ISBN)
  const [fallbackCopy, setFallbackCopy] = useState<any>(null);

  useEffect(() => {
    if (!raw) return router.push('/books');
    if (isFallback) { loadAllFallback(lookupId); } else { loadAll(raw); }
  }, [raw]);

  async function loadAll(isbn: string) {
    setLoading(true); setErrorStr(null);
    const { data: book, error: bErr } = await supabase.from('books').select('*').eq('isbn', isbn).limit(1).single();
    if (!book && !bErr && raw !== 'missing') { setErrorStr('Book not found'); setLoading(false); return; }
    const { data: copRes, error: cErr }: any = await supabase.from('book_copies').select('*').eq('book_isbn', isbn);
    if (cErr) console.error('book_copies query failed:', cErr);
    const ids = copRes?.map((c: any) => c.id!) || [];
    let locMap: Record<string, string> = {};
    if (ids.length > 0) {
      const liIds = [...new Set(copRes!.map((c: any) => c.location_id).filter(Boolean))];
      if (liIds.length > 0) {
        const { data: locs }: any = await supabase.from('locations').select('*').in('id', liIds);
        if (locs) locMap = Object.fromEntries(locs.map((l: any) => [String(l.id), l.name]));
      }
      const { data: brs }: any = await supabase.from('borrows').select('*').in('copy_id', ids).limit(200);
      const ptMap: Record<string, string> = {};
      if (brs) for (const b of brs as any[]) { if (b.patron_user_id && !(b.patron_user_id in ptMap)) ptMap[b.patron_user_id] = ''; }
      const ptnArr = Object.keys(ptMap);
      if (ptnArr.length > 0) { const { data: ps }: any = await supabase.from('profiles').select('*').in('id', ptnArr); if (ps) for (const p of ps) ptMap[p.id] = p.name || 'Unnamed'; }
      ids.forEach((cid: string, i: number) => { const c2 = copRes![i]; if (!c2) return; const blist = (brs as any[] || []).filter((b: any) => b.copy_id === cid).map((b: any) => ({ ...b, patron_name: ptMap[b.patron_user_id] || null })); Object.assign(c2, { location_name: locMap[c2.location_id || ''] || '', copy_borrows: blist }); });
    }
    let pats: any[] = []; try { const { data }: any = await supabase.from('profiles').select('*').order('name'); if (data) pats = data; } catch {}
    setIsbn(book.isbn || ''); setTitle((book.title as string) || ''); setSubtitle((book.subtitle as string) || '');
    const al = book.authors; if (Array.isArray(al)) setAuthors(al.join(', '));
    setPublisher((book.publisher as string) || ''); setPublishYear((book.publish_date as string) || '');
    setPagesStr(String(book.pages ?? '')); setNotes((book.notes as string) || ''); setCoverUrl(book.cover_url || '');
    if (copRes) setCopies(copRes); if (pats.length > 0) setPatrons(pats); setLoading(false);
   }

   async function loadAllFallback(copyId: string) {
     setLoading(true); setErrorStr(null);

       // Strategy 1: Try books table first (most reliable for no-ISBN records)
      const bkRes: any = await supabase.from('books').select('*').eq('id', copyId).limit(1).single();
      const { data: bookData, error: bkErr } = bkRes;
      
      if (bookData && !bkErr) {
        // Found in books table — this is a no-ISBN book
        setFallbackCopy(bookData);
        setIsbn('');
        loadAndSaveTitleFromCopy(bookData, '');
        return;
      }

       // Strategy 2: Try book_copies (for ISBN-linked physical copies)
      const copRes: any = await supabase.from('book_copies').select('*').eq('id', copyId).single();
      const { data: copyData, error: copErr } = copRes;
      
       if (copyData && !copErr) {
        // Found in book_copies — load normally
        setFallbackCopy(copyData);
         const copIsbn = copyData.book_isbn ?? '';
        setIsbn(copIsbn);
        loadAndSaveTitleFromCopy(copyData, copIsbn);
        return;
      }

       // Neither source could find the record — show a clear message
      const msg = bkErr?.message || copErr?.message || 'Record not found';
      setErrorStr(`Edit failed: ${msg}. Try editing via Manage Books instead.`);
     setLoading(false);
    }

   async function loadAndSaveTitleFromCopy(copyData: any, _copIsbn: string) {
      // If the copy has no ISBN, try to pull metadata from the books table via another field.
       // For now, we still allow editing title/authors directly — save later writes into books table
       // but won't update a books-row (no isbn) unless the user assigns one.
const t1x = copyData.title ?? ((copyData._bi as any)?.title as string) ?? 'Unknown Book';
     setTitle(t1x);
     setSubtitle((copyData.subtitle || '') as string);
     const al: any = copyData.authors; if (Array.isArray(al)) setAuthors(al.join(', '));
     setPublisher((copyData.publisher ?? '') as string);
     setPublishYear((copyData.publish_date ?? '') as string);
     setPagesStr(String(copyData.pages ?? ''));
     setNotes((copyData.notes ?? '') as string);
     setCoverUrl((copyData.cover_url ?? '') as string);
     // For copies with no ISBN, the single copy IS the "copies" list; for those where _bi may carry fields:
     const copiesList = [ { ...copyData, book_isbn_copy_id: true } ];
     setCopies(copiesList);
      let pats: any[] = []; try { const { data }: any = await supabase.from('profiles').select('*').order('name'); if (data) pats = data; } catch {}
     if (pats.length > 0) setPatrons(pats);
     setLoading(false);
   }

  async function fetchCover() { const c = cleanIsbn(isbn); if (c.length !== 10 && c.length !== 13) return; setFetchingCover(true); try { const res = await fetchBookByIsbn(c); if (res?.coverUrl) { setCoverUrl(res.coverUrl); setOkMsg('Cover loaded'); } else setErrorStr('No cover found'); } catch (e: any) { setErrorStr(e.message || 'Failed'); } finally { setFetchingCover(false); } }

  async function handleSave() {
    if (!title.trim()) return setErrorStr('Title required');
    const sdata: Record<string, unknown> = { title: title.trim(), subtitle: subtitle.trim() || null, authors: authors.split(',').map((s: string) => s.trim()).filter(Boolean), publisher: publisher.trim() || null, publish_date: publishYear.trim() || null, pages: parseInt(pagesStr, 10) || null, notes: notes.trim() || null };
    const nIsbn = cleanIsbn(isbn);
    sdata.isbn = nIsbn || null;
    setSaving(true); setErrorStr(null); setOkMsg(null);
    try {
      if (isFallback && fallbackCopy) {
        // No-ISBN book: update the book_copies row directly. If user assigns ISBN, also create books row.
        await supabase.from('book_copies').update(sdata as Record<string, any>).eq('id', lookupId);
        if (nIsbn && raw !== nIsbn) {
          sdata.isbn = null; // prevent double-write
          await supabase.from('books').upsert(sdata as Record<string, any>, { onConflict: 'isbn' });
        }
      } else {
        if (nIsbn && raw !== nIsbn) {
          await supabase.from('books').upsert(sdata as Record<string, any>, { onConflict: 'isbn' });
          await supabase.from('books').delete().eq('isbn', raw);
          await supabase.from('book_copies').update({ book_isbn: nIsbn || null }).eq('book_isbn', raw);
        } else {
          const r = await supabase.from('books').update(sdata).eq('isbn', raw);
          if (r.error) throw new Error(r.error.message);
        }
      }
      setOkMsg('Book saved!'); router.refresh();
    } catch (e: any) { setErrorStr(e.message || 'Save failed'); } finally { setSaving(false); }
  }

  async function handleDelete() { setDelting(true); try { if (isFallback) { await supabase.from('book_copies').delete().eq('id', lookupId); } else { const { data: brs }: any = await supabase.from('book_copies').select('id').eq('book_isbn', raw); if (brs) { const cIds = brs.map((c: any) => c.id!); if (cIds.length > 0) await supabase.from('borrows').delete().in('copy_id', cIds); } await supabase.from('book_copies').delete().eq('book_isbn', raw); } await supabase.from('books').delete().eq('isbn', isFallback ? lookupId : raw).or(`title.eq.${encodeURIComponent(title || raw)}`); setOkMsg('Deleted'); router.push('/catalog'); } catch (e: any) { setErrorStr(e.message || 'Delete failed'); } finally { setDelting(false); setShowDelModal(false); } }

  async function handleReturn(borrowId: string) { try { await supabase.from('borrows').update({ return_date: new Date().toISOString() }).eq('id', borrowId); setOkMsg('Returned'); router.refresh(); } catch (e: any) { setErrorStr(e.message || 'Failed'); } }

  async function handleCheckout(cpyId: string, ptnId: string | null) { if (!ptnId?.trim()) return; try { const { data: active }: any = await supabase.from('borrows').select('*').eq('copy_id', cpyId).is('return_date', null).limit(1); if (active && active.length > 0) { await supabase.from('borrows').update({ patron_user_id: ptnId }).eq('id', active[0].id); } else { await supabase.from('borrows').insert({ copy_id: cpyId, patron_user_id: ptnId, checkout_date: new Date().toISOString() }); } setOkMsg('Checked out!'); router.refresh(); } catch (e: any) { setErrorStr(e.message || 'Checkout failed'); } }

  if (loading) return <p className="text-sm text-slate-500 p-8">Loading...</p>;
   // For fallback (no-ISBN) books, copies will be populated by loadAllFallback
   if (!copies.length && raw && !isFallback) return (<div className="mt-6 space-y-4 text-center py-12"><h1 className="text-xl font-bold text-slate-700">Not Found</h1><p className="text-sm text-slate-500">No book with this ISBN.</p></div>);
   if (!copies.length && raw && isFallback) return (<div className="mt-6 space-y-4 text-center py-12"><h1 className="text-xl font-bold text-slate-700">Not Found</h1><p className="text-sm text-slate-500">No copy found with this ID.</p></div>);

  return (
    <>
      {okMsg && (<div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">{okMsg} <button onClick={() => setOkMsg(null)} className="underline ml-1">Dismiss</button></div>)}
      {errorStr && copies.length > 0 && (<div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200"><strong>Error: </strong>{errorStr}</div>)}

      <header className="flex items-start gap-4 flex-wrap pb-3 border-b border-slate-200">
        <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700">{'\u2190'} Back</button>
        <div className="flex-1 space-y-1 min-w-0"><h1 className="text-3xl font-bold text-slate-900">Edit Book</h1><p className="text-sm text-slate-500">{title?.slice(0, 80)}{isbn ? ' - ' + isbn : ''}</p></div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">

          {/* Metadata Form */}
          <section className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Book Metadata</h2>

            <div className="mb-5 flex items-center gap-4">
              {coverUrl ? (<Image src={coverUrl} width={100} height={150} alt="Cover" className="w-[80px] h-[120px] object-cover rounded border shadow-sm" />) : (<div className="w-[80px] h-[120px] bg-slate-100 flex items-center justify-center text-xl text-slate-300 rounded border">{'\u{1F4DA}'}</div>)}
              <button onClick={fetchCover} disabled={fetchingCover} className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{fetchingCover ? 'Loading...' : 'Fetch Cover from OL'}</button>
            </div>

            <div className="mb-4">
              <label htmlFor="isbn-f" className="block text-sm font-medium text-slate-700 mb-1">ISBN</label>
              <input id="isbn-f" type="text" value={isbn} onChange={(e) => setIsbn(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div><label htmlFor="t-f" className="block text-sm font-medium text-slate-700 mb-1">Title *</label><input id="t-f" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
              <div><label htmlFor="s-f" className="block text-sm font-medium text-slate-700 mb-1">Subtitle</label><input id="s-f" type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
            </div>

            <div className="mb-4">
              <label htmlFor="a-f" className="block text-sm font-medium text-slate-700 mb-1">Authors</label>
              <input id="a-f" type="text" value={authors} placeholder="e.g. F. Scott Fitzgerald" onChange={(e) => setAuthors(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div><label htmlFor="p-f" className="block text-sm font-medium text-slate-700 mb-1">Publisher</label><input id="p-f" type="text" value={publisher} onChange={(e) => setPublisher(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
              <div><label htmlFor="pg-f" className="block text-sm font-medium text-slate-700 mb-1">Pages</label><input id="pg-f" type="number" value={pagesStr} placeholder="352" min={0} onChange={(e) => setPagesStr(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
            </div>

            <div className="mb-4">
              <label htmlFor="d-f" className="block text-sm font-medium text-slate-700 mb-1">Publish Date</label>
              <input id="d-f" type="text" value={publishYear} placeholder="e.g. 1987" onChange={(e) => setPublishYear(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500" />
            </div>

            <div className="mb-5">
              <label htmlFor="n-f" className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea id="n-f" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 resize-y" />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving || !title.trim()} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm">{saving ? 'Saving...' : 'Save Changes'}</button>
              <hr className="flex-1 border-slate-300 self-center" />
              <button onClick={() => setShowDelModal(true)} className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">Delete Book</button>
            </div>
          </section>

          {/* Copy Management */}
          {copies.length > 0 && (
            <section className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Copies ({copies.length})</h2>
              <div className="space-y-3">
                {copies.map((c: any) => {
                  const act = (c.copy_borrows || []).filter((b: any) => !b.return_date && b.patron_user_id);
                  return (
                    <div key={c.id} className="border-b border-slate-100 pb-3 last:border-b-0 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`rounded-full text-xs px-2 py-0.5 font-medium ${c.location_name ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{c.location_name || 'Not shelved'}</span>
                        {c.condition && (<span className={`rounded-full text-xs px-2 py-0.5 font-medium ${c.condition === 'new' ? 'bg-green-100 text-green-800' : c.condition === 'good' ? 'bg-blue-100 text-blue-800' : c.condition === 'fair' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{c.condition.charAt(0).toUpperCase() + c.condition.slice(1)}</span>)}
                        <span className="text-xs text-slate-400">#{String(c.id).slice(0, 4)}</span>
                      </div>
                      {c.barcode && (<p className="text-xs text-slate-500 font-mono">{c.barcode}</p>)}
                      {c.notes && (<p className="text-xs text-slate-600 italic">{c.notes}</p>)}
                      {act.length > 0 && act.map((b: any) => (
                        <div key={b.id} className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-1">
                          <div className="flex items-center justify-between"><span className="text-xs text-slate-700 font-medium">Checked out</span><span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">Active</span></div>
                          {b.patron_name ? (<p className="font-medium text-blue-900 text-sm">{b.patron_name}</p>) : (<p className="text-xs text-blue-600 mt-1">Patron not found</p>)}
                          <div className="flex items-center gap-2"><span className="text-xs text-slate-500">Due: {b.due_date ? new Date(b.due_date).toLocaleDateString() : 'No due date'}</span><button onClick={() => handleReturn(String(b.id))} className="ml-auto rounded bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200">Mark Returned</button></div>
                        </div>
                      ))}
                      {act.length === 0 && patrons.length > 0 && (
                        <div className="mt-2 p-2 border border-dashed border-slate-200 rounded-lg">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Check out:</label>
                          <select onChange={(e: any) => { if (e.target.value) handleCheckout(String(c.id), e.target.value); }} className="w-full rounded border px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"><option value="">Select patron...</option>{patrons.map((ptn) => (<option key={ptn.id} value={String(ptn.id)}>{ptn.name || ptn.email || 'Unnamed'}</option>))}</select>
                        </div>
                      )}
                      {act.length === 0 && patrons.length === 0 && (<p className="text-xs text-slate-400 mt-2">No patrons registered.</p>)}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {copies.length === 0 && (<div className="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p className="text-sm text-slate-500">No physical copies for this book.</p></div>)}
        </div>

        {/* RIGHT SIDEBAR */}
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 p-5 bg-white shadow-sm"><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Actions</h3><button onClick={() => setShowDelModal(true)} className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Delete Book</button></section>
          <section className="rounded-xl border border-slate-200 p-5 bg-white shadow-sm"><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Navigation</h3><div className="space-y-1"><Link href="/books" className="text-sm text-indigo-600 hover:text-indigo-800 block py-1">{'\u2190'} Back to Books</Link><Link href="/catalog" className="text-sm text-slate-500 hover:text-slate-700 block py-1">View Catalog</Link></div></section>
          {copies.length > 0 && (<section className="rounded-xl border border-slate-200 p-5 bg-white shadow-sm"><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Copy Details</h3><ul className="text-sm space-y-1">{copies.map((c: any) => (<li key={c.id} className="flex justify-between items-center py-1 border-b border-slate-50 last:border-b-0"><span>{c.location_name || 'Not shelved'}</span>{c.barcode && (<span className="text-xs text-slate-400 font-mono">{c.barcode}</span>)}</li>))}</ul></section>)}
          <section className="rounded-xl border border-slate-200 p-5 bg-white shadow-sm"><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Activity</h3>{copies.length === 0 ? (<p className="text-sm text-slate-400">No physical copies.</p>) : (() => { const cnt = copies.reduce((a: number, c: any) => a + ((c.copy_borrows || []).filter((b: any) => b.return_date).length), 0); return cnt > 0 ? (<p className="text-sm text-green-600">{cnt} past borrows.</p>) : (<p className="text-sm text-slate-400 py-1">No borrows found.</p>); })()}</section>
        </aside>
      </div>

      {showDelModal && (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"><div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg space-y-4"><h3 className="text-lg font-bold text-red-700">Confirm Delete</h3><p className="text-sm text-slate-600">Permanently remove "{title}" and all its copies?</p><div className="flex flex-col sm:flex-row gap-2"><button onClick={handleDelete} disabled={delting} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{delting ? 'Deleting...' : 'Yes, Delete'}</button><button onClick={() => setShowDelModal(false)} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button></div></div></div>)}
    </>
  );
}
