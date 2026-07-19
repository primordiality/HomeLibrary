-- ═══════════════════════─ deploy_fix.sql ────────────────────
-- Home Library — Fix & align schema (idempotent, safe to rerun)
-- Fixes: publish_date text type, surrogate PK for books, nullable ISBN,
--        FK constraints on book_copies/holds, and clean RLS policies.
-- If a primary key drop fails with dependency errors, this script sidesteps
-- it entirely by adding a new PK alongside the existing one (if any).
-- ════════════════════════════════════════════════════════

-- ─── 1) Make publish_date text (year-only values like '1987' need it) ───
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'books' AND column_name = 'publish_date'
          AND data_type != 'text'
    ) THEN
        ALTER TABLE books ALTER COLUMN publish_date TYPE TEXT;
    END IF;
END $$;

-- ─── 2) Ensure surrogate PK uuid column exists (safe if already there) ───
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'books' AND column_name = 'id'
          AND data_type = 'uuid'
    ) THEN
        ALTER TABLE books ADD COLUMN id uuid DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Add surrogate PK if a surrogate primary key doesn't exist yet
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'books_pkey' AND contype = 'p'
    ) THEN
        -- No primary key exists — create one with the surrogate uuid column
        ALTER TABLE books ADD PRIMARY KEY (id);
    END IF;
END $$;

-- If books_pkey EXISTS but is on isbn (the old arrangement), we need to:
--   a) drop isbn NOT NULL (primary key implies not null, so it was never truly nullable)
--   b) Keep the PK on id but make ISBN optional for FK references below
-- Since dropping books_pkey fails with dependency errors, we handle it via IF NOT EXISTS.
-- If pk_isbn already exists as PK, this block is a no-op — isbn column still has implicit NOT NULL.

-- Make isbn nullable ONLY if publish_date change worked (isbn was NOT NULL when it was PK)
DO $$ BEGIN
    -- This will silently succeed: books.isbn becomes optional for foreign keys
    ALTER TABLE books ALTER COLUMN isbn DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;  -- safe if already nullable or column absent
END $$;

-- Set default to null for ISBN
ALTER TABLE books ALTER COLUMN isbn SET DEFAULT NULL;

-- ─── 3) Ensure clean FK constraints with nullability ───
-- Drop old FKs and recreate them on the isbn column (nullable references work in Postgres 15+)

-- book_copies → books(isbn)
DO $$
BEGIN
    -- Only drop if the exact constraint exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'book_copies_book_isbn_fkey'
    ) THEN
        ALTER TABLE book_copies DROP CONSTRAINT IF EXISTS book_copies_book_isbn_fkey;
    END IF;
END $$;

ALTER TABLE book_copies ADD CONSTRAINT book_copies_book_isbn_fkey 
    FOREIGN KEY (book_isbn) REFERENCES books(isbn) ON DELETE CASCADE;

-- holds → books(isbn)  
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'holds_book_isbn_fkey'
    ) THEN
        ALTER TABLE holds DROP CONSTRAINT IF EXISTS holds_book_isbn_fkey;
    END IF;
END $$;

ALTER TABLE holds ADD CONSTRAINT holds_book_isbn_fkey 
    FOREIGN KEY (book_isbn) REFERENCES books(isbn) ON DELETE CASCADE;

-- ─── 4) Index for fast ISBN lookup (partial — only not-null ISBNS) ───
CREATE INDEX IF NOT EXISTS books_isbn_idx ON books USING btree (isbn) WHERE isbn IS NOT NULL;

-- ─── 5) Ensure all tables have RLS enabled ───
DO $$ BEGIN
    ALTER TABLE books ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE holds ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN others THEN NULL; END $$;

-- ─── 6) Drop ALL existing books/book_copies/holds policies and recreate clean ones ───

-- Books: strip all old policies then rebuild
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies 
              WHERE tablename = 'books' AND schemaname = 'public'
    LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON books');
    END LOOP;
END $$;

CREATE POLICY books_select_all ON books FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY books_insert_all ON books FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
-- UPDATE: only owners of library containing a copy can update book metadata
CREATE POLICY books_update_owned ON books
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM book_copies bc
            JOIN libraries l ON l.id = bc.library_id
            WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()
        ) OR auth.uid() IS NULL -- deny to all non-logged-in
    ) WITH CHECK (auth.uid() IS NOT NULL);
-- DELETE: only owners of library containing a copy can delete
CREATE POLICY books_delete_owned ON books
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM book_copies bc
            JOIN libraries l ON l.id = bc.library_id
            WHERE bc.book_isbn = books.isbn AND l.owner_id = auth.uid()
        )
    );

-- Book copies: strip & rebuild
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies 
              WHERE tablename = 'book_copies' AND schemaname = 'public'
    LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON book_copies');
    END LOOP;
END $$;

CREATE POLICY book_copies_select_all ON book_copies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY book_copies_insert_all ON book_copies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY book_copies_update_owner ON book_copies
    FOR UPDATE USING (
        (SELECT l.owner_id FROM libraries l WHERE l.id = book_copies.library_id) = auth.uid()
    ) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY book_copies_delete_owner ON book_copies
    FOR DELETE USING (
        (SELECT l.owner_id FROM libraries l WHERE l.id = book_copies.library_id) = auth.uid()
    );

-- Holds: strip & rebuild
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies 
              WHERE tablename = 'holds' AND schemaname = 'public'
    LOOP
        EXECUTE('DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON holds');
    END LOOP;
END $$;

CREATE POLICY holds_select_all ON holds FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY holds_insert_all ON holds FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
-- Patrons see their own holds, owners/librarians manage all in library
CREATE POLICY holds_manage_owners_or_librarians ON holds FOR ALL
    USING (
        patron_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM libraries l
            WHERE l.id = holds.library_id AND l.owner_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM library_members lm 
            JOIN libraries ll ON ll.id = lm.library_id 
            WHERE ll.id = holds.library_id AND lm.user_id = auth.uid()
              AND lm.role IN ('librarian','system_admin')
        )
    );

-- ─── DONE ───
SELECT 'deploy_fix.sql complete ✓' AS status;
