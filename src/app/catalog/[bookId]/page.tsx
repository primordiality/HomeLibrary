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

export default function BookDetailPage({ params }: { params: { bookId: string } }) {
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
         .eq('id', params.bookId)
         .single();
      if (data) setBook(data as Book);
     } catch {
      console.error('Failed to load book');
     } finally {
      setLoading(false);
     }
   }

  async function handleBookUpdate(field: string, value: string | null): Promise<void> {
    const { error } = await supabase.from('books').update({ [field]: value }).eq('id', params.bookId);

    if (!error) {
      setBook((prev) => (prev ? { ...prev, [field]: value } : null));
      alert('Updated successfully.');
     } else {
      alert(`Update failed: ${error.message}`);
     }
   }

  async function handleUploadCover(file: File): Promise<void> {
    const fileName = `book-covers/${params.bookId}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('library-images').upload(fileName, file);
    
    if (error) { alert(`Upload failed: ${error.message}`); return; }

    const { data } = await supabase.storage.from('library-images').getPublicUrl(fileName);

    await supabase.from('books').update({ cover_url: data?.publicUrl }).eq('id', params.bookId);
    setBook((prev) => (prev ? { ...prev, cover_url: data?.publicUrl } : null));
    alert('Cover image uploaded.');
   }

  async function handleUploadPersonalPhoto(file: File): Promise<void> {
    const fileName = `book-personal/${params.bookId}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('library-images').upload(fileName, file);
    
    if (error) alert(`Upload failed: ${error.message}`);
    else alert('Photo uploaded.');
   }

  async function handleDeleteCover(): Promise<void> {
     const confirmed = window.confirm('Delete the cover image from storage? This cannot be undone.');
     if (!confirmed) return;

     setBook((prev) => (prev ? { ...prev, cover_url: null } : null));
   }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (!book) return <p className="text-red-600">Book not found.</p>;

  return (
     <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
       <header>
         <Link href="/catalog" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 mb-2 inline-block">← Back to Catalog</Link>
         
          <div>
           <h1 className="text-3xl font-bold">{book.title || 'Unknown Book'}</h1>
            <p className="mt-2 text-slate-500">{book.authors?.join(', ') || 'Unknown author'}</p>
          </div>
       </header></div>
   );
}
