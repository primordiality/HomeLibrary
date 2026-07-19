-- ═══════════════════════─ deploy_fix_v2.sql ────────────────────
-- Home Library — Fix & align schema (idempotent, safe to rerun)
-- Fixes: publish_date text type, nullable ISBN, surrogate PK for books,
--        FK constraints on book_copies/holds, and clean RLS policies.
-- Key fix: we DROP CONSTRAINTS BEFORE dropping PK, not the other way around.

-- 1) Make publish_date text (year-only values like '1987' need it) ---
DO $$ BEGIN
    ALTER TABLE books ALTER COLUMN publish_date TYPE TEXT;
END $$;

-- 2) Drop all FKs that depend on books(isbn) FIRST, before touching PK
-- book_copies -> books(isbn)
DO $1$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_copies_book_isbn_fkey') THEN
        ALTER TABLE book_copies DROP CONSTRAINT book_copies_book_isbn_fkey;
    END IF;
END $1$;

-- holds -> books(isbn)
DO $1$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'holds_book_isbn_fkey') THEN
        ALTER TABLE holds DROP CONSTRAINT holds_book_isbn_fkey;
    END IF;
END $1$;

-- 3) Drop the primary key on isbn so we can make isbn NOT NULL-free
DO $1$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_pkey') THEN
        ALTER TABLE books DROP CONSTRAINT books_pkey;
    END IF;
END $1$;

-- 4) Now isbn is free — make it nullable/optional
ALTER TABLE books ALTER COLUMN isbn DROP NOT NULL;
ALTER TABLE books ALTER COLUMN isbn SET DEFAULT NULL;

-- 5) Add surrogate PK uuid column (if not already present)
DO $1$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'books' AND column_name = 'id') THEN
        ALTER TABLE books ADD COLUMN id uuid DEFAULT gen_random_uuid();
    END IF;
END $1$;

-- 6) Re-add primary key on the surrogate uuid column
DO $1$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_pkey') THEN
        ALTER TABLE books ADD PRIMARY KEY (id);
    END IF;
END $1$;

-- 7) Recreate FK constraints on isbn (nullable now, fine in Postgres 15+) ---
ALTER TABLE book_copies ADD CONSTRAINT book_copies_book_isbn_fkey 
    FOREIGN KEY (book_isbn) REFERENCES books(isbn) ON DELETE CASCADE;

ALTER TABLE holds ADD CONSTRAINT holds_book_isbn_fkey 
    FOREIGN KEY (book_isbn) REFERENCES books(isbn) ON DELETE CASCADE;

-- 8) Index for fast ISBN lookup ---
CREATE INDEX IF NOT EXISTS books_isbn_idx ON books USING btree (isbn) WHERE isbn IS NOT NULL;

-- 9) Ensure RLS is enabled on all tables
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE holds ENABLE ROW LEVEL SECURITY;

-- 10) Drop ALL existing POLICIES then rebuild clean ones ---

-- Books policies
DO $1$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'books' AND schemaname = 'public' LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON books');
    END LOOP;
END $1$;

CREATE POLICY books_select_all ON books FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY books_insert_all ON books FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY books_update_owned ON books
    FOR UPDATE USING (EXISTS (SELECT 1 FROM book_copies bc JOIN libraries l ON l.id = bc.library_id WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid())) 
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY books_delete_owned ON books
    FOR DELETE USING (EXISTS (SELECT 1 FROM book_copies bc JOIN libraries l ON l.id = bc.library_id WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()));

-- Book copies policies
DO $1$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'book_copies' AND schemaname = 'public' LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON book_copies');
    END LOOP;
END $1$;

CREATE POLICY book_copies_select_all ON book_copies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY book_copies_insert_all ON book_copies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY book_copies_owner_manage ON book_copies
    FOR ALL USING ((SELECT l.owner_id FROM libraries l WHERE l.id = book_copies.library_id) = auth.uid()) 
    WITH CHECK (auth.uid() IS NOT NULL);

-- Holds policies
DO $1$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'holds' AND schemaname = 'public' LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON holds');
    END LOOP;
END $1$;

CREATE POLICY holds_select_all ON holds FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY holds_insert_all ON holds FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY holds_manage_owners_or_librarians ON holds FOR ALL
    USING (patron_user_id = auth.uid() OR EXISTS (SELECT 1 FROM libraries l WHERE l.id = holds.library_id AND l.owner_id = auth.uid()));

-- Done
SELECT 'deploy_fix_v2.sql complete ✓ — books.isbn is now nullable' AS status;
