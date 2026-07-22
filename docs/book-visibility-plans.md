# Book Visibility Plan — Per-Library Phased Implementation

## Overview
Three related features added to the book system, **scoped per-library** (stored on `book_copies`, not `books`):
1. **Visibility** — a `public` boolean on `book_copies` so each library independently controls whether its copies appear in patron catalog search
2. **Holds toggle** — a `holds_enabled` boolean on `book_copies` to enable/disable placing holds on copies at that library
3. **Checkouts toggle** — a `checkouts_enabled` boolean on `book_copies` to enable/disable checking out copies at that library

**Why per-library on `book_copies`**: Each library can have its own copies of the same book with different settings. If Library A sets "The Great Gatsby" to private, Library B's copies still appear in their catalog. This matches the existing data model where `book_copies` is the per-library-per-item record.

---

## DATA MODEL (Phase 0 — Migration)

**File**: `supabase/schema.sql`

Add three columns to the `book_copies` table:

```sql
ALTER TABLE book_copies
  ADD COLUMN public boolean NOT NULL DEFAULT true,
  ADD COLUMN holds_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN checkouts_enabled boolean NOT NULL DEFAULT true;
```

- `public` — when false, that library's copies are hidden from patron-facing catalog search. Staff/library owners can still see and manage it.
- `holds_enabled` — when false, patrons cannot place holds on copies of this book at this library.
- `checkouts_enabled` — when false, patrons/staff cannot check out copies of this book at this library (useful for reference-only or special collections).

**RLS**: No changes needed — `book_copies` already has `ENABLE ROW LEVEL SECURITY` with existing select/manage policies.

**Types**: `src/types/db.ts` — update `BookCopy` interface:
```typescript
export interface BookCopy {
  // ... existing fields ...
  public?: boolean | null           // NEW: visible to patrons in this library
  holds_enabled?: boolean | null     // NEW: patrons can place holds on this library's copies
  checkouts_enabled?: boolean | null // NEW: patrons can check out this library's copies
}
```

**Migration note**: If the Supabase project already exists (`ydfrrhssnho1hbuxaagq`), the new SQL will need to be run in the Supabase SQL Editor as well as kept in the schema file for future reference.

---

## PHASE 1: Edit Book Page — Per-Library Settings

**File**: `src/app/books/[bookId]/edit/page.tsx`

**Current state**: This page loads all copies for a book (across all libraries) and shows them together. It has no concept of "which library" since books are global.

**Changes**:
1. Load all copies in `loadAll()` (already happens). Each copy already comes with its copy-level data.
2. Add state for settings:
   ```typescript
   const [bookPublic, setBookPublic] = useState(true);
   const [holdsEnabled, setHoldsEnabled] = useState(true);
   const [checkoutsEnabled, setCheckoutsEnabled] = useState(true);
   ```
3. Add a "Visibility & Settings" section below the metadata form. Since a book can span multiple libraries, show settings **per library copy**:
   - For each copy row, show the three toggle checkboxes
   - OR show a library-level selector + the three toggles (staff picks which library's settings to edit)

**Approach**: Show a settings section that groups copies by library. For each library group, display the three checkboxes. Changes update that specific copy's `book_copies` row via a direct Supabase update (not the main save button).

**Auto-sync option**: Add a "Apply to all copies" checkbox — when checked, changes sync to all library copies of this book.

4. Save individual copy settings via:
   ```typescript
   await supabase.from('book_copies').update({
     public: bookPublic,
     holds_enabled: holdsEnabled,
     checkouts_enabled: checkoutsEnabled
   }).eq('id', selectedCopyId);
   ```

5. Update `handleSave()` for book metadata only — do NOT mix copy settings into the book metadata save.

**UI Style**: Match existing form fields. Group by library name when multiple libraries have copies. Add small "Apply to all copies" link for bulk changes.

---

## PHASE 2: Manage Books — Visibility, Holds & Checkouts Columns

**File**: `src/app/libraries/[id]/manage-books/page.tsx`

**Current state**: This page is library-scoped (already loads `book_copies` filtered by `library_id`). It shows copies with condition, barcode, notes.

**Changes**:
1. Update the copy load query to include new columns:
   ```typescript
   .select('*, books:book_id(title, isbn, authors)')
   // Now also get the new boolean columns (they're on book_copies, already selected)
   ```

2. In the book list rows, add new columns/columns badges:
   - "🔒 Private" badge if `public === false`
   - "Holds: ✓/✗" badge
   - "Checkouts: ✓/✗" badge

3. Add inline toggle controls in the Edit Copy mode (when user clicks "Edit Copy"):
   - Three checkboxes: "Public", "Allow holds", "Allow checkouts"
   - Save updates to that copy's `book_copies` row
   - Trigger a refresh after save

4. Add bulk toggle controls in the batch actions area (when copies are selected):
   - Buttons: "Set Public", "Set Private", "Enable Holds", "Disable Holds", "Enable Checkouts", "Disable Checkouts"
   - Each performs a bulk `UPDATE book_copies SET column = value WHERE id IN (...)`

5. Update `handleSaveEdit` to include the three new fields in the updates object.

---

## PHASE 3: Catalog Search — Per-Library Visibility Filter + Book Badges

**File**: `src/app/catalog/page.tsx`

**Current state**: Loads `book_copies` filtered by library, then maps to unique books. The catalog is library-scoped — a library's copies determine what shows.

**Changes**:
1. The existing query already fetches `book_copies` per library:
   ```typescript
   supabase.from('book_copies').select('*')
   ```
   We just need to add filtering on the new `public` column.

2. In the `loadCatalog` function, after fetching copies, filter out non-public copies:
   ```typescript
   const copiesToConsider = libId
     ? (copies || []).filter((c: any) => c.library_id === libId && (c.public !== false))
     : (copies || []).filter((c: any) => (c.public !== false));
   ```
   Treat `null` as `true` for backwards compatibility.

3. Staff view (library owners/librarians/system_admins): Show ALL copies including private ones, with a "🔒 Private" badge. The filtering only applies to patron (non-staff) views.

4. In the filter panel (`showFilters` section), add a visibility filter dropdown:
   - "All Books" (shows private books for staff)
   - "Public Only" (default for patrons)
   - Only shown when user has staff role

5. On each book card, add small status badges (visible to staff):
   - "🔒 Private" if `public === false`
   - "No Holds" if `holds_enabled === false`
   - "No Checkouts" if `checkouts_enabled === false`

6. **Cross-library view**: When browsing "All Libraries", a book that appears in multiple libraries will show separately per library, each with its own visibility settings. Private copies from one library won't appear; public copies from another library will.

---

## PHASE 4: Checkout & Hold Workflows — Respect Toggle Settings

**Files**:
- `src/app/borrowings/page.tsx` (staff checkout modal + borrowings list)
- `src/app/catalog/[bookId]/page.tsx` (book detail page)
- `src/app/profile/page.tsx` (patron profile — has hold-related UI)
- `src/app/libraries/[id]/manage-books/page.tsx` (copy-level checkout)
- `src/components/add-book-dialog.tsx` (new book creation — ensure defaults are set)

**Changes**:

### Checkout enforcement
1. **Staff checkout modal** (`borrowings/page.tsx`):
   - In `handleSelectBook`, after loading available copies, also fetch the book's settings
   - Check `checkouts_enabled` on the selected copies
   - If false: show a message "This book's copies cannot be checked out at this library" and disable the Confirm button
   - When checking out, double-check the flag before inserting the borrow record

2. **Copy-level checkout** (`manage-books/page.tsx`):
   - When a copy has `checkouts_enabled === false`, disable the checkout select dropdown
   - Show a tooltip/note: "Checkouts disabled for this book"

3. **Book edit page** (`books/[bookId]/edit/page.tsx`):
   - When a copy has `checkouts_enabled === false`, disable the checkout section for that copy
   - Show note: "Checkouts disabled"

### Hold enforcement
4. **Borrowings page** (holds tab + checkout modal):
   - Before allowing hold creation, check `holds_enabled` on the target copies
   - If false: show "Holds are not available for this book at this library"
   - In `handleSelectBook`, disable hold placement if `holds_enabled === false`

5. **Catalog detail page** (`catalog/[bookId]/page.tsx`):
   - If `checkouts_enabled === false`: hide/disable checkout buttons
   - If `holds_enabled === false`: hide/disable place hold button
   - Add small notes explaining why

### New book creation
6. **Add book dialog** (`components/add-book-dialog.tsx`):
   - Ensure new copies are created with the three new fields defaulting to `true`
   - This is already handled by the DB DEFAULT, but add explicit defaults in the API layer for safety

**Implementation approach for Phase 4**:
- Create a shared utility: `getBookSettings(bookId, libraryId)` that fetches the new fields from `book_copies`
- Return: `{ public, holds_enabled, checkouts_enabled }`
- Use this utility across checkout, holds, and catalog pages
- Handle the case where copies might not have the new columns yet (treat missing as true for backwards compat)

---

## IMPLEMENTATION ORDER

| Phase | Files Changed | Purpose | Risk |
|-------|--------------|---------|------|
| 0 | `supabase/schema.sql`, `src/types/db.ts` | Add columns to `book_copies`, update types | Low — simple DDL |
| 1 | `src/app/books/[bookId]/edit/page.tsx` | Per-library visibility settings UI | Medium — book spans libraries |
| 2 | `src/app/libraries/[id]/manage-books/page.tsx` | Bulk toggles + inline edits + badges | Medium — complex list |
| 3 | `src/app/catalog/page.tsx` | Visibility filter + staff/patron views | Medium — affects patron browsing |
| 4 | borrowings, manage-books, catalog detail, profile, add-book-dialog | Respect toggles in all workflows | Low — defensive checks |

---

## FULL PROMPTS (one per phase, ready to execute)

### Phase 0 Prompt
```
Run two changes:

1. In supabase/schema.sql, add these three columns to the book_copies table:
   ADD COLUMN public boolean NOT NULL DEFAULT true,
   ADD COLUMN holds_enabled boolean NOT NULL DEFAULT true,
   ADD COLUMN checkouts_enabled boolean NOT NULL DEFAULT true;
   Add a COMMENT on each explaining what they do.

2. In src/types/db.ts, update the BookCopy interface to include:
   public?: boolean | null
   holds_enabled?: boolean | null
   checkouts_enabled?: boolean | null

The changes are on book_copies (not books) so settings are per-library.
```

### Phase 1 Prompt
```
In src/app/books/[bookId]/edit/page.tsx, add a "Visibility & Settings" section
below the "Book Metadata" form and above the "Copies" section.

Since a book can have copies in multiple libraries:
- Group settings by library name
- For each library group, show three checkboxes: "Public — visible in patron catalog", 
  "Allow holds", "Allow checkouts"
- Load current values from the first copy in each library group (or default true)
- Each group has its own save button to update that library's copy settings
  (UPDATE book_copies SET public=..., holds_enabled=..., checkouts_enabled=... WHERE id=...)
- Add a "Apply to all copies" link per group that syncs the setting to all library copies
  (UPDATE book_copies SET field=... WHERE book_id=...)

Use existing form field styling (rounded-lg, border, etc.).

IMPORTANT: Don't mix these copy-level settings into the main "Save Changes" button
(which saves book metadata). These are separate copy-level updates.
```

### Phase 2 Prompt
```
In src/app/libraries/[id]/manage-books/page.tsx:

1. The existing query already fetches book_copies for this library. The new boolean
   columns (public, holds_enabled, checkouts_enabled) come along for free.

2. In each book copy row (view mode), add small status badges:
   - "🔒 Private" if public === false
   - "Holds: ✓" or "Holds: ✗" 
   - "Checkouts: ✓" or "Checkouts: ✗"
   Place them next to the existing condition badge.

3. In the "Edit Copy" inline edit mode, add three checkboxes:
   "Public", "Allow holds", "Allow checkouts"
   Include them in the handleSaveEdit updates object.

4. In the batch actions toolbar (below the book list), add these buttons when
   copies are selected:
   - "Set Public" / "Set Private"
   - "Enable Holds" / "Disable Holds"
   - "Enable Checkouts" / "Disable Checkouts"
   Each performs: supabase.from('book_copies').update({ column: value }).in('id', selectedIds)

5. Also add these toggles to the "Remove ALL Books" danger zone area for
   discoverability (smaller section above it).
```

### Phase 3 Prompt
```
In src/app/catalog/page.tsx, modify the catalog loading and display:

1. In loadCatalog, filter copies to exclude non-public ones for patron view:
   Change copiesToConsider to also filter: c.public !== false (treat null as true).

2. Add a visibility filter dropdown in the showFilters panel:
   - "Public Only" (default — all views)
   - "All Books" (including private — only show when user has staff role)
   Staff roles: system_admin, library_owner, librarian (check via useAuth().profile?.role)

3. When user is staff, show ALL copies (including private) and display badges:
   - "🔒 Private" badge next to title if public === false
   - "No Holds" badge if holds_enabled === false
   - "No Checkouts" badge if checkouts_enabled === false

4. When user is patron, only show public copies. Private books don't appear at all.

5. When viewing "All Libraries" (no library selected), a book appearing in multiple
   libraries shows once per library with separate availability, and the private/public
   flag applies per-library.

Use existing badge styling. Match the pattern from availability/status badges already
on the page.
```

### Phase 4 Prompt
```
Implement workflow enforcement for the new visibility/holds/checkouts toggles.

1. src/app/borrowings/page.tsx (checkout modal):
   - In handleSelectBook, after loading available copies, check if all available copies
     have checkouts_enabled === false. If so, show a message "This book cannot be 
     checked out at this library" and disable the Confirm button.
   - In handleCheckout, add a pre-flight check: query the copy's checkouts_enabled
     before inserting. If false, show error.
   - In handleSelectBook, also check holds_enabled before allowing the user to place
     a hold (if hold placement is available from this modal).

2. src/app/catalog/[bookId]/page.tsx (book detail):
   - Add a useEffect to fetch the book's copies and check their settings
   - If checkouts_enabled === false: disable/hide checkout buttons, show note
   - If holds_enabled === false: disable/hide hold buttons, show note
   - If public === false: redirect to catalog or show "This book is not available"

3. src/app/libraries/[id]/manage-books/page.tsx (copy-level checkout):
   - When a copy has checkouts_enabled === false, disable the checkout select dropdown
   - Show tooltip: "Checkouts disabled for this book"

4. src/components/add-book-dialog.tsx:
   - When creating new copies, explicitly set public=true, holds_enabled=true, 
     checkouts_enabled=true in the insert payload (belt-and-suspenders with DB defaults)

Create a small utility function getBookSettings(bookId, libraryId) that:
- Queries book_copies for the given book+library
- Returns { public, holds_enabled, checkouts_enabled } (defaulting null to true)
- Used across pages for consistent behavior
```

---

## NOTES & EDGE CASES

1. **Cross-library independence**: Each library's copies have independent settings. Library A's private copies don't affect Library B's public copies. This is the key difference from the original plan.

2. **Edit book page complexity**: The edit book page (`/books/[bookId]/edit`) is shared across libraries. Since it shows ALL copies, it needs to display settings per-library-group. Consider adding a library selector dropdown at the top of the settings section.

3. **New book creation**: When a patron or librarian adds a new book via `add-book-dialog`, the `library_id` on the copy is set. The new boolean columns default to `true` on the DB side.

4. **SQL migration on live DB**: The Supabase project `ydfrrhssnho1hbuxaagq` needs the ALTER TABLE statement run in its SQL Editor. Keep the schema file as source of truth for version control.

5. **Backwards compatibility**: All new columns default to `true`, so existing copies continue to work. The `c.public !== false` filter treats null/undefined as true.

6. **RLS**: Existing `book_copies_select_all` and `book_copies_manage_owners_or_librarians` policies already handle access. No changes needed.

7. **Catalog deduplication**: The catalog deduplicates books by `book_id` across copies. With per-library visibility, the dedup logic needs to respect the library filter first, then the visibility filter, then deduplicate.
