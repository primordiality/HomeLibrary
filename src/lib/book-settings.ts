import { supabase } from '@/lib/supabase/client';

export type BookSettings = {
  public: boolean;
  holds_enabled: boolean;
  checkouts_enabled: boolean;
};

/**
 * Fetch book-level visibility/hold/checkout settings from the first copy row.
 * Null values default to true for backwards compatibility.
 */
export async function getBookSettings(
  bookId: string,
  libraryId: string,
): Promise<BookSettings> {
  const { data: copies, error } = await supabase
    .from('book_copies')
    .select('public, holds_enabled, checkouts_enabled')
    .eq('book_id', bookId)
    .eq('library_id', libraryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to load book settings:', error.message);
    return { public: true, holds_enabled: true, checkouts_enabled: true };
  }

  return {
    public: copies?.public ?? true,
    holds_enabled: copies?.holds_enabled ?? true,
    checkouts_enabled: copies?.checkouts_enabled ?? true,
  };
}
