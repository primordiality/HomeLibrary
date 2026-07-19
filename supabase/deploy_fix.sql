-- ════════════ deploy_fix.sql (correct order) ═══════════─
-- Orders: 1) Drop FK constraints ON books(isbn) 2) Drop PK on isbn
-- 3) Make isbn nullable 4) Add surrogate id and recreate PK
-- 
-- The old version failed because PostgreSQL won't drop a PK if other tables
-- have FK constraints that depend on it. We must DROP those FKs FIRST.

-- Step 1: Drop all FKs referencing books(isbn) — MUST happen before dropping PK
DO $block$
BEGIN
    -- book_copies -> books(isbn)
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'book_copies_book_isbn_fkey') THEN
        ALTER TABLE book_copies DROP CONSTRAINT book_copies_book_isbn_fkey;
    END IF;

    -- holds -> books(isbn)  
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'holds_book_isbn_fkey') THEN
        ALTER TABLE holds DROP CONSTRAINT holds_book_isbn_fkey;
    END IF;
END $block$;

-- Step 2: Now safely drop PK from isbn
DO $block$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'books_pkey') THEN
        ALTER TABLE books DROP CONSTRAINT books_pkey;
    END IF;
END $block$;

-- Step 3: Make isbn nullable/optional
ALTER TABLE books ALTER COLUMN isbn DROP NOT NULL;
ALTER TABLE books ALTER COLUMN isbn SET DEFAULT NULL;

-- Step 4: Add surrogate PK uuid (if absent already)  
DO $block$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'books' AND column_name = 'id') THEN
        ALTER TABLE books ADD COLUMN id uuid DEFAULT gen_random_uuid();
    END IF;
END $block$;

-- Step 5: Back-populate old rows with surrogate UUIDs (isbn NOT NULL rows only)
DO $block$
BEGIN
    UPDATE books SET id = gen_random_uuid() WHERE id IS NULL AND isbn IS NOT NULL;
END $block$;

-- Step 6: Recreate PK on surrogate uuid
ALTER TABLE books ADD PRIMARY KEY (id);

-- Step 7: Recreate FK constraints — now that isbn is nullable, these allow nulls too
ALTER TABLE book_copies ADD CONSTRAINT book_copies_book_isbn_fkey 
    FOREIGN KEY (book_isbn) REFERENCES books(isbn) ON DELETE CASCADE;

ALTER TABLE holds ADD CONSTRAINT holds_book_isbn_fkey 
    FOREIGN KEY (book_isbn) REFERENCES books(isbn) ON DELETE CASCADE;

-- Step 8: Index for ISBN lookups
CREATE INDEX IF NOT EXISTS books_isbn_idx ON books USING btree (isbn) WHERE isbn IS NOT NULL;
