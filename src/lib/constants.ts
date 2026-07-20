// Shared book/copy constants used across catalog, manage-books, and edit-book pages.

import type { BookData, CopyData } from './types';

export const BOOK_DEFAULT: BookData = {
  id: '', isbn: '', title: '', subtitle: '', authors: '', publisher: '',
  publish_date: '', pages: null as number | null, cover_url: '', genres_str: '', notes: '',
};

export const COPY_DEFAULT: CopyData = {
  copy_id: '', book_id: '', library_id: '', location: '', barcode: '',
  condition: 'new' as 'new'|'good'|'fair'|'poor'|'damaged',
  purchase_price: null, acquired_date: null, notes: '', copyId: null,
};

export function isNullIsbn(isbn: string): boolean {
  return isbn === '' || isbn === 'null' || isbn === null;
}
