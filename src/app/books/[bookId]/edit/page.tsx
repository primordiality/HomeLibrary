'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { fetchBookByIsbn } from '@/lib/openlibrary';

export default function EditBookPage() {
  const params = useParams<{ bookId: string }>();
  const router = useRouter();
  const bookId = params?.bookId ?? '';

  const [isbn, setIsbn] = useState('');
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

  const [copySettings, setCopySettings] = useState<Record<string, { public: boolean; holds_enabled: boolean; checkouts_enabled: boolean }>>({});
  const [savingCopies, setSavingCopies] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!bookId) return router.push('/books');
    loadAll();
  }, [bookId]);

  async function loadAll() {
    setLoading(true);
    setErrorStr(null);

    const { data: book, error: bErr } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .limit(1)
      .single();

    if (!book && !bErr) {
      setErrorStr('Book not found');
      setLoading(false);
      return;
    }

    const { data: copRes, error: cErr }: any = await supabase
      .from('book_copies')
      .select('*')
      .eq('book_id', bookId);

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

    let pats: any[] = [];
    try { const { data }: any = await supabase.from('profiles').select('*').order('name'); if (data) pats = data; } catch {}

    setIsbn(book.isbn || '');
    setTitle((book.title as string) || '');
    setSubtitle((book.subtitle as string) || '');
    const al = book.authors; if (Array.isArray(al)) setAuthors(al.join(', '));
    setPublisher((book.publisher as string) || '');
    setPublishYear((book.publish_date as string) || '');
    setPagesStr(String(book.pages ?? ''));
    setNotes((book.notes as string) || '');
    setCoverUrl(book.cover_url || '');
    if (copRes) setCopies(copRes);
    if (pats.length > 0) setPatrons(pats);

    // Populate copy settings from each copy's current values (default true if null)
    if (copRes) {
      const settings: Record<string, { public: boolean; holds_enabled: boolean; checkouts_enabled: boolean }> = {};
      for (const c of copRes) {
        settings[c.id] = {
          public: c.public ?? true,
          holds_enabled: c.holds_enabled ?? true,
          checkouts_enabled: c.checkouts_enabled ?? true,
        };
      }
      setCopySettings(settings);
    }

    setLoading(false);
  }

  async function fetchCover() {
    if (isbn.length !== 10 && isbn.length !== 13) return;
    setFetchingCover(true);
    try {
      const res = await fetchBookByIsbn(isbn);
      if (res?.coverUrl) {
        // Download the image via our API route to bypass CORS, then upload to Storage
        const imgRes = await fetch('/api/fetch-cover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: res.coverUrl, bookId }),
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          if (imgData.bytes) {
            // Upload to Supabase Storage
            const extension = imgData.contentType?.split('/')[1] || 'jpg';
            const fileName = `book-covers/${bookId}-${Date.now()}.${extension}`;
            const blob = new Blob([new Uint8Array(imgData.bytes)], { type: imgData.contentType });
            const { error: uploadErr } = await supabase.storage
              .from('library-images')
              .upload(fileName, blob, { upsert: true });
            if (uploadErr) {
              console.error('Storage upload failed:', uploadErr);
              setErrorStr('Cover downloaded but storage upload failed: ' + uploadErr.message);
              setCoverUrl(res.coverUrl); // fallback to remote URL
              setOkMsg('Cover loaded (remote link — storage upload failed)');
            } else {
              // Get public URL
              const { data: urlData } = supabase.storage
                .from('library-images')
                .getPublicUrl(fileName);
              setCoverUrl(urlData?.publicUrl || res.coverUrl);
              setOkMsg('Cover downloaded and saved to storage');
            }
          } else {
            setCoverUrl(res.coverUrl);
            setOkMsg('Cover loaded (remote link)');
          }
        } else {
          // Fallback: just use the URL
          setCoverUrl(res.coverUrl);
          setOkMsg('Cover loaded (remote link)');
        }
      } else {
        setErrorStr('No cover found');
      }
    } catch (e: any) {
      console.error('Failed to fetch cover:', e);
      setErrorStr(e.message || 'Failed');
    } finally {
      setFetchingCover(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) return setErrorStr('Title required');
    const sdata: Record<string, unknown> = {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      authors: authors.split(',').map((s: string) => s.trim()).filter(Boolean),
      publisher: publisher.trim() || null,
      publish_date: publishYear.trim() || null,
      pages: parseInt(pagesStr, 10) || null,
      notes: notes.trim() || null,
      isbn: isbn.trim() || null,
      cover_url: coverUrl || null,
    };
    setSaving(true);
    setErrorStr(null);
    setOkMsg(null);
    try {
      const { data, error } = await supabase.from('books').update(sdata as Record<string, any>).eq('id', bookId);
      if (error) throw new Error(error.message || 'Failed to save book');
      if (!data || (Array.isArray(data) && (data as any[]).length === 0)) {
        throw new Error('Update affected 0 rows. This may be an RLS permission issue. Check browser console for details.');
      }
      setOkMsg('Book saved!');
      router.refresh();
    } catch (e: any) {
      console.error('[handleSave] save error:', e);
      setErrorStr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDelting(true);
    try {
      const { data: copyData } = await supabase.from('book_copies').select('id').eq('book_id', bookId);
      const copyIds = copyData?.map((c: any) => c.id) || [];
      if (copyIds.length > 0) {
        await supabase.from('borrows').delete().in('copy_id', copyIds);
      }
      await supabase.from('book_copies').delete().eq('book_id', bookId);
      await supabase.from('books').delete().eq('id', bookId);
      setOkMsg('Deleted');
      router.push('/catalog');
    } catch (e: any) { setErrorStr(e.message || 'Delete failed'); }
    finally { setDelting(false); setShowDelModal(false); }
  }

  async function handleReturn(borrowId: string) {
    try {
      await supabase.from('borrows').update({ return_date: new Date().toISOString() }).eq('id', borrowId);
      setOkMsg('Returned');
      router.refresh();
    } catch (e: any) { setErrorStr(e.message || 'Failed'); }
  }

  async function handleCheckout(cpyId: string, ptnId: string | null) {
    if (!ptnId?.trim()) return;
    try {
      const { data: active }: any = await supabase.from('borrows').select('*').eq('copy_id', cpyId).is('return_date', null).limit(1);
      if (active && active.length > 0) {
        await supabase.from('borrows').update({ patron_user_id: ptnId }).eq('id', active[0].id);
      } else {
        await supabase.from('borrows').insert({ copy_id: cpyId, patron_user_id: ptnId, checkout_date: new Date().toISOString() });
      }
      setOkMsg('Checked out!');
      router.refresh();
    } catch (e: any) { setErrorStr(e.message || 'Checkout failed'); }
  }

  async function handleCopySettingUpdate(copyId: string, field: string, value: boolean) {
    setSavingCopies(prev => ({ ...prev, [copyId]: true }));
    try {
      const { error } = await supabase
        .from('book_copies')
        .update({ [field]: value })
        .eq('id', copyId);
      if (error) throw new Error(error.message || 'Failed to update setting');
      setCopySettings(prev => ({
        ...prev,
        [copyId]: { ...prev[copyId], [field]: value }
      }));
      setOkMsg('Setting updated');
    } catch (e: any) { setErrorStr(e.message || 'Update failed'); }
    finally { setSavingCopies(prev => ({ ...prev, [copyId]: false })); }
  }

  async function handleBulkCopySettings(libraryName: string, field: string, value: boolean) {
    // Only update copies in this library
    const copiesInLib = copies.filter(c => c.location_name === libraryName);
    const promises = copiesInLib.map(c =>
      supabase.from('book_copies').update({ [field]: value }).eq('id', c.id)
    );
    await Promise.allSettled(promises);
    // Update local state for all copies in this library
    setCopySettings(prev => {
      const next = { ...prev };
      for (const c of copiesInLib) {
        next[c.id] = { ...prev[c.id], [field]: value };
      }
      return next;
    });
    setOkMsg(`Applied "${field}" setting to all copies in ${libraryName}`);
    router.refresh();
  }

  if (loading) return <p className="text-sm text-slate-500 p-8">Loading...</p>;
  if (!copies.length && !bookId) return (<div className="mt-6 space-y-4 text-center py-12"><h1 className="text-xl font-bold text-slate-700">Not Found</h1><p className="text-sm text-slate-500">No book with this ID.</p></div>);
  if (!copies.length && bookId) return (<div className="mt-6 space-y-4 text-center py-12"><h1 className="text-xl font-bold text-slate-700">Not Found</h1><p className="text-sm text-slate-500">No book found with this ID.</p></div>);

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

          {/* Visibility & Settings */}
          {copies.length > 0 && (() => {
            // Group copies by location_name
            const groups: Record<string, any[]> = {};
            for (const c of copies) {
              const key = c.location_name || 'Not shelved';
              if (!groups[key]) groups[key] = [];
              groups[key].push(c);
            }
            const groupNames = Object.keys(groups);

            return (
              <section className="rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Visibility &amp; Settings</h2>
                <div className="space-y-5">
                  {groupNames.map(locName => {
                    const grp = groups[locName];
                    return (
                      <div key={locName} className="border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-800">{locName} ({grp.length} {grp.length === 1 ? 'copy' : 'copies'})</h3>
                        </div>
                        {/* Public checkbox */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`pub-${grp[0].id}`}
                              checked={grp.every(c => copySettings[c.id]?.public !== false)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                grp.forEach(c => handleCopySettingUpdate(c.id, 'public', val));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor={`pub-${grp[0].id}`} className="text-sm text-slate-700">Public — visible in patron catalog search</label>
                          </div>
                          <span className="text-xs text-slate-400">Per-copy controls</span>
                        </div>
                        {/* Allow holds checkbox */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`holds-${grp[0].id}`}
                              checked={grp.every(c => copySettings[c.id]?.holds_enabled !== false)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                grp.forEach(c => handleCopySettingUpdate(c.id, 'holds_enabled', val));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor={`holds-${grp[0].id}`} className="text-sm text-slate-700">Allow holds</label>
                          </div>
                        </div>
                        {/* Allow checkouts checkbox */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`checkouts-${grp[0].id}`}
                              checked={grp.every(c => copySettings[c.id]?.checkouts_enabled !== false)}
                              onChange={(e) => {
                                const val = e.target.checked;
                                grp.forEach(c => handleCopySettingUpdate(c.id, 'checkouts_enabled', val));
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor={`checkouts-${grp[0].id}`} className="text-sm text-slate-700">Allow checkouts</label>
                          </div>
                        </div>
                        {/* Per-copy individual toggles with Save buttons */}
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-xs font-medium text-slate-500 mb-2">Individual copy toggles:</p>
                          <div className="space-y-2">
                            {grp.map(c => {
                              const s = copySettings[c.id] || { public: true, holds_enabled: true, checkouts_enabled: true };
                              return (
                                <div key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-xs">
                                  <span className="text-slate-500 font-mono w-20">#{String(c.id).slice(0, 8)}</span>
                                  <label className="flex items-center gap-1"><input type="checkbox" checked={s.public} onChange={(e) => handleCopySettingUpdate(c.id, 'public', e.target.checked)} className="h-3 w-3 rounded border-slate-300 text-indigo-600" /> Pub</label>
                                  <label className="flex items-center gap-1"><input type="checkbox" checked={s.holds_enabled} onChange={(e) => handleCopySettingUpdate(c.id, 'holds_enabled', e.target.checked)} className="h-3 w-3 rounded border-slate-300 text-indigo-600" /> Holds</label>
                                  <label className="flex items-center gap-1"><input type="checkbox" checked={s.checkouts_enabled} onChange={(e) => handleCopySettingUpdate(c.id, 'checkouts_enabled', e.target.checked)} className="h-3 w-3 rounded border-slate-300 text-indigo-600" /> Checkouts</label>
                                  {savingCopies[c.id] && <span className="text-indigo-500">…</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

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
