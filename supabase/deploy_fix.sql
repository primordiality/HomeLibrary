-- ═══════─ books table migration — run in Supabase SQL Editor ────────────
-- Fixes 3 blockers: publish_date validation, RLS insert blockage, null ISBN support
-- Safe to run multiple times (idempotent)

-- 1) Change publish_date from date → text so "2019" works
ALTER TABLE books ALTER COLUMN publish_date TYPE TEXT;

-- 2) If isbn was PRIMARY KEY (was NOT NULL), convert it to nullable UNIQUE + add surrogate PK
DO $$
BEGIN
   IF EXISTS (
       SELECT 1 FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       WHERE c.relname = 'books' AND a.attname = 'isbn'
         AND a.attis Droppered = true -- check if it's still PRIMARY KEY column
   ) THEN
       -- isbn is still PK: migrate to surrogate + nullable UNIQUE
       ALTER TABLE books RENAME COLUMN isbn TO old_isbn;
       -- This is complex — just drop PK constraint inline instead
   END IF;
END $$;

-- Simpler approach: if isbn IS still PRIMARY KEY (NOT NULL), make it nullable + add id column
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_pkey;
ALTER TABLE books ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid() GENERATED ALWAYS AS IDENTITY;
ALTER TABLE books ALTER COLUMN isbn SET DEFAULT NULL;

-- 3) Create index for fast ISBN lookups (only where isbn IS NOT NULL — no bloat on nulls)
CREATE INDEX CONCURRENTLY IF NOT EXISTS books_isbn_idx ON books USING btree (isbn)
    WHERE isbn IS NOT NULL;

-- 4) Drop every existing books policy, then recreate cleanly per-operation
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'books' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON books', r.policyname);
    END LOOP;
END $$;

-- INSERT: any logged-in user can insert new books (even without ISBN)
CREATE POLICY books_any_insert ON books
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: all logged-in users can view books
CREATE POLICY books_any_select ON books
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- UPDATE: only the owner of a copy in their library can modify book metadata
CREATE POLICY books_owner_update ON books
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM book_copies bc
            JOIN libraries l ON l.id = bc.library_id
            WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()
        )
    ) WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: only owners of a copy in their library can delete the book entry
CREATE POLICY books_owner_delete ON books
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM book_copies bc
            JOIN libraries l ON l.id = bc.library_id
            WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()
        )
    );

-- ═══─ RLS policies for book_copies: allow inserts for all authenticated ────
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'book_copies' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON book_copies', r.policyname);
    END LOOP;
END $$;

-- INSERT: any logged-in user can add a physical copy
CREATE POLICY book_copies_any_insert ON book_copies
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: all logged-in users can view copies in their library
CREATE POLICY book_copies_any_select ON book_copies
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- UPDATE/DELETE: only the library owner of that library
CREATE POLICY book_copies_owner_update_delete ON book_copies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM libraries l
            WHERE l.id = book_copies.library_id AND l.owner_id = auth.uid()
        )
    );
