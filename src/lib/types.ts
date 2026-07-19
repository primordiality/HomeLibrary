export type LibraryId = string;

export interface BookData {
  id: string;
  isbn: string;
  title: string;
  subtitle: string;
  authors: string;
  publisher: string;
  publish_date: string;
  pages: number | null;
  cover_url: string;
  genres_str: string;
  notes: string;
}

export interface CopyData {
  copy_id?: string;           // book_copies.id (stored)
  id?: string;               // alias for UUID field
  book_isbn: string;
  library_id: string;
  location: string;          // maps to locations.id / name text
  barcode: string;
  condition: 'new'|'good'|'fair'|'poor'|'damaged';
  purchase_price: number | null;
  acquired_date: string | null;
  notes: string;

  // UI-only helpers (not stored in DB)
  locationName?: string;
  copyId?: string | null;    // display-friendly ID
}
