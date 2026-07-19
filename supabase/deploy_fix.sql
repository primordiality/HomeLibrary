-- ═══════─ books table migration — paste into Supabase SQL Editor ────────────
-- Fixes: publish_date validation, RLS insert blockage, null ISBN support
-- Safe to run multiple times (idempotent)

-- 1) Change publish_date from date → text so "2019" and similar work
ALTER TABLE books ALTER COLUMN publish_date TYPE TEXT;

-- 2) If isbn is PRIMARY KEY (NOT NULL), switch to surrogate PK + nullable isbn
-- This handles the case where you had isbn text PRIMARY KEY, now:
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_pkey;
ALTER TABLE books ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
-- Make isbn nullable (was PRIMARY KEY → implicit NOT NULL)
ALTER TABLE books ALTER COLUMN isbn DROP NOT NULL;
ALTER TABLE books ALTER COLUMN isbn SET DEFAULT NULL;

-- 3) Fast ISBN lookup index — partial to skip null values (no bloat)
CREATE INDEX IF NOT EXISTS books_isbn_idx ON books USING btree (isbn) WHERE isbn IS NOT NULL;

-- 4) Drop every existing books policy, then recreate cleanly per-operation
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies 
              WHERE tablename = 'books' AND schemaname = 'public'
    LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON books');
    END LOOP;
END $$;

-- INSERT: any logged-in user can add a book (even without ISBN)
CREATE POLICY books_any_insert ON books
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: all logged-in users can view books 
CREATE POLICY books_any_select ON books
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- UPDATE: only the owner of a copy in their library
CREATE POLICY books_owner_update ON books
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM book_copies bc
            JOIN libraries l ON l.id = bc.library_id
            WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()
        )
    ) WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: only owners of a copy in their library
CREATE POLICY books_owner_delete ON books
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM book_copies bc
            JOIN libraries l ON l.id = bc.library_id
            WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()
        )
    );

-- 5) Also recreate book_copies policies cleanly
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies 
              WHERE tablename = 'book_copies' AND schemaname = 'public'
    LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON book_copies');
    END LOOP;
END $$;

CREATE POLICY book_copies_any_insert ON book_copies
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY book_copies_any_select ON book_copies
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY book_copies_owner_manage ON book_copies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM libraries l
            WHERE l.id = book_copies.library_id AND l.owner_id = auth.uid()
        )
    );
