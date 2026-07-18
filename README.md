# librarium — Personal Library Manager

Manage books, patrons, borrowings across multiple physical libraries.
One library per space (house). Track checkouts with nudge dates only (no fines).

## Tech Stack
- **Frontend:** Next.js 14 + React 19 + Tailwind CSS v4
- **Backend:** Supabase PostgreSQL + Auth + Storage
- **Mobile Ready:** Same data layer for Expo/React Native apps

## Setup
1. Create a [Supabase project](https://app.supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Copy `.env.local.example` to `.env.local` and fill in your credentials
4. `npm install && npm run dev` → http://localhost:3000

## Features
- Library > Location > Book hierarchy  
- Role-based permissions (system_admin, library_owner, librarian, patron)  
- ISBN barcode scanning with OpenLibrary API auto-fill  
- Cover image upload to Supabase Storage for books and libraries  
- Borrow tracking with soft nudge dates (no enforced deadlines, no fines)
- Holds queue for borrowing reserved titles

## Architecture
```
library (one per physical space / house)
  ├── Library Members (who belongs, with role)
  ├── Locations (rooms, shelves, zones)  
  ├── Books (master record by ISBN + metadata + cover image URL)
  │   └── Book Copies (individual physical items)  
  │      └── Borrow Records (checkout/return tracking)
  │         └── Holds Queue (reservations for checked-out books)
```
