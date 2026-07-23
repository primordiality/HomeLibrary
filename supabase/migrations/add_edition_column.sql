-- Add edition column to books table
-- Allows tracking which edition of a book (e.g. "1st edition", "2nd ed.")

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'books' AND column_name = 'edition'
  ) THEN
    ALTER TABLE books ADD COLUMN edition text;
  END IF;
END $$;
