# Plan: Patron Creation Fixes

## Problems Identified

### 1. Column mismatch: borrows `return_date` vs schema `returned_at`
- **schema.sql** defines `returned_at timestamptz` (line 130)
- **patrons/page.tsx** line 55: `.is('return_date', null)`
- **borrowings/page.tsx** line 55: `.update({ return_date: now })` and line 43: `!b.return_date`
- **db.ts** types say `return_date` (line 78)
- **Decision**: Rename schema column to `return_date` — matches all existing code, cleaner naming (sibling of `due_date`)

### 2. Patron creation doesn't create an auth user
- `patrons/page.tsx` inserts directly into `profiles` table (line 115-121)
- `profiles.id` is a FK to `auth.users(id)` — this insert will fail with FK violation unless an auth user already exists
- No password field, no invite option, no way to actually give the patron login credentials
- Admin `admin/users/page.tsx` has the correct pattern (invite email OR manual password) but the patron page doesn't

### 3. `first_name` / `last_name` may not exist in schema
- Base `schema.sql` does NOT include `first_name` or `last_name` on `profiles`
- `migration-patron-fix.sql` adds them separately — must be run in Supabase SQL Editor
- If schema was run from `schema.sql` only, these columns don't exist

### 4. Missing `due_date` column in db.ts types
- Code references `due_date` in borrows (borrowings/page.tsx line 74, 153)
- Schema has it (line 129) — correct
- **db.ts** types DON'T have `due_date` on `BorrowRecord` — type mismatch

---

## Implementation

### Step 1: Fix borrows column naming
**Migration**: `ALTER TABLE borrows RENAME COLUMN returned_at TO return_date;`
Update `schema.sql` to use `return_date` going forward.

### Step 2: Redesign patron creation form
Two-mode creation flow (same pattern as admin/users):

**Mode A — Invite via email**:
- Uses existing `send-invite` edge function (creates auth user via `inviteUserByEmail`)
- Wait 1s for trigger, then insert `profiles` row with `role: 'patron'`, `first_name`, `last_name`, `email`, `name`

**Mode B — Manual password**:
- Uses `supabase.auth.signUp()` with email + password + user_metadata
- Wait 1s for trigger, then insert `profiles` row

**UI**: Add password input, "Send invite email" checkbox, `name` field. Lock role to `patron`.

### Step 3: Ensure migration is applied
- Add `first_name`, `last_name` to `schema.sql` base
- Keep `migration-patron-fix.sql` for existing deployments

### Step 4: Fix db.ts types
- Add `due_date` to `BorrowRecord` interface
- Fix column name to match schema decisions

---

## Files to modify
1. `supabase/schema.sql` — rename `returned_at` to `return_date`; add `first_name`, `last_name`
2. `src/app/patrons/page.tsx` — rewrite creation flow (invite/manual password)
3. `src/app/borrowings/page.tsx` — no changes needed if schema matches code
4. `src/types/db.ts` — add `due_date` to `BorrowRecord`

## Final Decisions
- Borrows column: `return_date` (rename schema)
- Keep both pages (patrons for patrons, admin for system users)
- Patron form locks to 'patron' role only
