// Auto-synced from the Supabase SQL migration in supabase/schema.sql
// This is your single source of truth for database shapes
export interface Profile {
  id: string                    // auth.user id (or uuid for manual patrons)
  name?: string | null          // legacy name field
  email?: string | null         // nullable, not always present
  first_name?: string | null    // first name (manual patrons)
  last_name?: string | null     // last name (manual patrons)
  role: 'system_admin' | 'library_owner' | 'librarian' | 'patron'
  created_at: string            // ISO datetime
}

export interface Library {
  id: string                    // uuid
  owner_id: string              // profiles.id — who owns it
  name: string                  // e.g., "The Great Hall"
  address?: string | null
  description?: string | null   // blurb for patrons
  phone?: string | null         // library phone number
  notes?: string | null         // internal admin notes
  created_at: string            // ISO datetime
  updated_at: string            // ISO datetime
}

export interface LibraryMember {
  id: string                    // uuid
  library_id: string            // which library
  user_id: string               // profiles.id
  role: 'library_owner' | 'librarian' | 'patron'
  created_at: string            // ISO datetime
}

export interface Location {
  id: string                    // uuid
  library_id: string            // belongs to which library
  name: string                  // e.g. "Main Shelf", "Reading Nook"
  floor_or_zone?: string | null // e.g., "Second Floor"
  notes?: string | null         // location-specific notes
  created_at: string            // ISO datetime
}

export interface Book {
  isbn: string                  // PRIMARY KEY — e.g. "978-0441172719"
  title?: string | null
  subtitle?: string | null     // e.g., "The Second Book of Isaac Asimov"
  authors?: string[] | null    // ["Asimov, Isaac", "Silverberg, Robert"]
  publisher?: string | null
  publish_date?: string | null // YYYY-MM-DD
  pages?: number | null         // total page count
  language?: string | null     // ISO 639-1: "en", "fr", etc.
  cover_url?: string | null    // URL to a book cover image
  genres?: string[] | null     // ["science-fiction", "space-opera"]
  notes?: string | null        // cataloging notes (not for patrons)
}

export interface BookCopy {
  id: string                    // uuid — the physical copy ID
  book_isbn: string             // foreign key → books.isbn
  library_id: string            // belongs to which library
  location_id?: string | null   // nullable = NOT YET SHELVED
  barcode?: string | null       // sticker ISBN (may differ from catalog ISBN)
  condition: 'new' | 'good' | 'fair'  | 'poor' | 'damaged'
  notes?: string | null         // copy-specific notes ("has a cracked spine")
  purchase_price?: number | null// e.g. 3599 (stored in cents if you want precision)
  acquired_date?: string | null // YYYY-MM-DD when acquired
  created_at: string            // ISO datetime
  updated_at: string            // ISO datetime
}

export interface BorrowRecord {
  id: string                    // uuid
  patron_user_id: string        // profiles.id who borrowed
  copy_id: string               // book_copies.id checked out
  checkout_date: string         // date when it left
  nudge_by_date?: string | null // soft reminder target — not enforced by DB
  return_date?: string | null   // when returned (set on check-in)
  created_at: string            // ISO datetime
  updated_at: string            // ISO datetime
}

export interface HoldRequest {
  id: string                    // uuid
  patron_user_id: string        // who placed the hold
  book_isbn: string             // which ISBN to wait for
  library_id: string            // which library to check  
  status: 'waiting' | 'accepted' | 'cancelled'
  created_at: string            // ISO datetime  
  updated_at: string            // ISO datetime
}

// ─── Dashboard stats (aggregated on client or via RPC) ──────
export interface LibraryStats {
  total_books: number
  copies_on_display: number     // book_copies NOT currently checked out
  checked_out_count: number     // active borrows (no return_date set)
  holds_in_queue: number        // holds with status = 'waiting'  
}

// ─── Auth types ──────────────
export interface Session {
  access_token: string
  user: {
    id: string
    email: string
    app_metadata: { provider: string }
    user_metadata: { display_name?: string; role?: string }
    identitities?: Array<{ provider: string }>
  }
  expires_at: number            // epoch ms
  expires_in: number            // seconds
  refresh_token: string
  token_type: string            // "bearer"
}
