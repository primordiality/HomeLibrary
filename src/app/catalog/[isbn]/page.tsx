'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import type { Book } from '@/types/db';

const CONDITION_COLORS: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-800',
  good: 'bg-blue-100 text-blue-800',
  fair: 'bg-amber-100 text-amber-800',
  poor: 'bg-orange-100 text-orange-800',
  damaged: 'bg-red-100 text-red-800',
};

export default function BookDetailPage({ params }: { params: { isbn: string } }) {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCopyForm, setShowAddCopyForm] = useState(false);

  useEffect(() => {
    loadBook();
  }, []);

  async function loadBook(): Promise<void> {
    try {
      const { data } = await supabase
        .from('books')
        .select('*')
        .eq('isbn', params.isbn)
        .single();
      if (data) setBook(data as Book);
    } catch {
      console.error('Failed to load book');
    } finally {
      setLoading(false);
    }
  }

  async function handleBookUpdate(
    field: string,
    value: string | null
  ): Promise<void> {
    const { error } = await supabase
      .from('books')
      .update({ [field]: value })
      .eq('isbn', params.isbn);

    if (!error) {
      setBook((prev) => (prev ? { ...prev, [field]: value } : null));
      alert('Updated successfully.');
    } else {
      alert(`Update failed: ${error.message}`);
    }
  }

  async function handleUploadCover(file: File): Promise<void> {
    const fileName = `book-covers/${params.isbn}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await supabase.storage
      .from('library-images')
      .upload(fileName, file);

    if (uploadError) {
      alert(`Upload failed: ${uploadError.message}`);
      return;
    }

    const { data } = await supabase.storage
      .from('library-images')
      .getPublicUrl(fileName);

    await supabase
      .from('books')
      .update({ cover_url: data?.publicUrl })
      .eq('isbn', params.isbn);

    setBook((prev) => (prev ? { ...prev, cover_url: data?.publicUrl } : null));
    alert('Cover image uploaded.');
  }

  async function handleDeleteCover(): Promise<void> {
    const confirmed = window.confirm(
      'Delete the cover image from storage? This cannot be undone.'
    );
    if (!confirmed) return;

    setBook((prev) => (prev ? { ...prev, cover_url: null } : null));
  }

  async function handleUploadPersonalPhoto(file: File): Promise<void> {
    const fileName = `book-personal/${params.isbn}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('library-images').upload(fileName, file);
    if (error) alert(`Upload failed: ${error.message}`);
    else alert('Photo uploaded.');
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!book) return <p className="text-red-600">Book not found.</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header>
        <Link
          href="/catalog"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-2 inline-block"
        >
          Back to Catalog
        </Link>

        <h1 className="text-3xl font-bold">{book.title || 'Unknown Book'}</h1>
        <p className="mt-2 text-slate-500">
          {book.authors?.join(', ') || 'Unknown author'}
        </p>
      </header>

      {/* BOOK INFORMATION CARD */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Book Information
        </h2>

        <div className="flex flex-col sm:flex-row gap-8">
          {/* Column 1: Cover upload + photos */}
          <div className="w-full sm:w-56 shrink-0 space-y-4">
            <div
              className="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center"
            >
              {book.cover_url ? (
                <img
                  src={book.cover_url}
                  alt={book.title || 'Book cover'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-5xl text-slate-400">{'\uD83D\uDCD6'}</span>
              )}

              <label
                onClick={() => {
                  const input = document.getElementById('cover-upload');
                  if (input) input.click();
                }}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-white/80 px-3 py-1 text-xs font-medium transition hover:bg-white"
              >
                Upload Cover
                <input
                  id="cover-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadCover(file);
                  }}
                />
              </label>
            </div>

            <button
              onClick={handleDeleteCover}
              className="w-full cursor-pointer rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Delete Cover Image
            </button>

            {/* Copy photos */}
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">Personal Photos</h3>
              <p className="text-xs text-slate-500 mb-3">
                Upload photos of this copy - bookplates, inscriptions, or just the physical book.
              </p>

              <div className="grid gap-2 grid-cols-3 mb-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-square overflow-hidden rounded-lg bg-slate-100 grid place-content-center relative group"
                  >
                    <span className={'text-slate-400' as const}>{'\uD83D\uDCAF'}</span>
                    <button className="absolute top-1 right-1 cursor-pointer rounded-full bg-red-600 text-white p-0.5 text-xs opacity-0 transition group-hover:opacity-100">
                      x
                    </button>
                  </div>
                ))}

                <label className="aspect-square grid content-center items-center justify-items rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 cursor-pointer">
                  <span>{'+'}</span>
                  Add Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadPersonalPhoto(file);
                    }}
                  />
                </label>
              </div>

              <p className="text-xs text-slate-500">
                {'2 uploaded'}{' '}
                <span className="ml-2 cursor-pointer text-indigo-600 hover:underline">
                  Delete All
                </span>
              </p>
            </div>
          </div>

          {/* Column 2: Metadata fields */}
          <div className="flex-1 space-y-4">
            <div className="sm:grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block">Title</label>
                <input
                  type="text"
                  defaultValue={book.title || ''}
                  onChange={(e) => void handleBookUpdate('title', e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block">ISBN</label>
                <input
                  type="text"
                  value={params.isbn}
                  disabled
                  className="mt-1 block w-full cursor-not-allowed rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-48 bg-slate-50 text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block">Authors</label>
              <input
                type="text"
                defaultValue={book.authors?.join(', ') || ''}
                onChange={(e) => void handleBookUpdate('authors', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              />
            </div>

            <div className="sm:grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block">Publisher</label>
                <input
                  type="text"
                  defaultValue={book.publisher || ''}
                  onChange={(e) => void handleBookUpdate('publisher', e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block">Pages</label>
                <input
                  type="number"
                  defaultValue={book.pages || ''}
                  onChange={(e) => void handleBookUpdate('pages', parseInt(e.target.value) || null)}
                  className="mt-1 block w-full sm:w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="sm:grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block">Genres</label>
                <input
                  type="text"
                  defaultValue={book.genres?.join(', ') || ''}
                  onChange={(e) => void handleBookUpdate('genres', e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block">Language</label>
                <input
                  type="text"
                  defaultValue={book.language || ''}
                  onChange={(e) => void handleBookUpdate('language', e.target.value)}
                  className="mt-1 block w-full sm:w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block">Notes</label>
              <textarea
                rows={3}
                defaultValue={book.notes || ''}
                onChange={(e) => void handleBookUpdate('notes', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* PHYSICAL COPIES CARD */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">Physical Copies</h2>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-lg border border-slate-200 p-4 gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">Copy #abc123</p>
              <p className="flex items-center mt-1 text-sm text-slate-500">
                Condition:{' '}
                <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CONDITION_COLORS.good || ''} as const`}>
                  {'good' as const}
                </span>
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-medium">On Display</span>
            <button 
              onClick={() => {}}
              className="text-sm flex cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
            >View</button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-lg border border-slate-200 p-4 gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">Copy #def456</p>
              <p className="text-sm italic text-slate-500 mt-1">Gift from aunt</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-3 py-1 text-xs font-medium">Checked Out</span>
            <button className="text-sm flex sm:hidden cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50" onClick={() => {}}>View</button>
            <button className="hidden sm:flex sm:block mt-4 cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 items-center justify-between gap-3">Print Label</button>
          </div>
        </div>

        <button 
          onClick={() => setShowAddCopyForm(true)}
          className="mt-4 flex w-full items-center justify-center rounded-lg border border-dashed border-slate-300 p-3 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50"
        >
          + Add Another Copy
        </button>

        {showAddCopyForm && (
          <form onSubmit={(e) => { e.preventDefault(); alert('TODO: implement add copy'); setShowAddCopyForm(false); }} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className={'mb-1 font-semibold text-sm' as const}>New Copy</h3>
            <div className="sm:grid grid-cols-2 gap-3 sm:cols-span-2">
              <div>
                <label className="text-xs font-medium text-slate-700 block">Condition</label>
                <select default={'new' as const} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500">
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                  <option value="damaged">Damaged</option>
                </select>
              </div>
              <button type="submit" className="sm:cols-span-2 text-xx cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Add Copy</button>
            </div>
          </form>
        )}
      </section>

      {/* MANAGEMENT ACTIONS */}
      <div className="flex flex-wrap gap-3 sm:hidden items-center rounded-xl border bg-white p-4 shadow-sm hidden">
        <button onClick={() => {}} className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50">Edit Book Details</button>
        <button onClick={() => alert('TODO')} className="sm:flex flex sm:hidden cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 items-center hidden">Export Card</button>
      </div>
    </div>
  );
}
