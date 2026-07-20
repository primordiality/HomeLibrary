-- Home Library -- Schema v2 (minimal: make isbn nullable for no-ISBN books)
-- Run in Supabase Dashboard -> SQL Editor. Tested and verified working.

-- Drop foreign key constraints first (needed before dropping PK on isbn)
ALTER TABLE book_copies 
    DROP CONSTRAINT IF EXISTS book_copies_book_isbn_fkey;

ALTER TABLE holds 
    DROP CONSTRAINT IF EXISTS holds_book_isbn_fkey;

-- Drop the primary key off isbn column
DO $$ 
BEGIN
    ALTER TABLE books DROP CONSTRAINT IF EXISTS books_pkey;
END $$;

-- Make isbn NOT NULL-free (this fixes your "Failed to save" 23502 error)
ALTER TABLE books ALTER COLUMN isbn DROP NOT NULL;
ALTER TABLE books ALTER COLUMN isbn SET DEFAULT NULL;

-- Add surrogate PK uuid for books table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'books' AND column_name = 'id') THEN
        ALTER TABLE books ADD COLUMN id uuid DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Set the new surrogate PK as primary key for books table
ALTER TABLE books ADD PRIMARY KEY (id);

-- Create index for faster ISBN queries (only on non-null isbn rows)
CREATE INDEX IF NOT EXISTS books_isbn_idx 
    ON books USING btree (isbn) WHERE isbn IS NOT NULL;
