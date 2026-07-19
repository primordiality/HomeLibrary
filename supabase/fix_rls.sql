# Run these two fixes in Supabase SQL Editor (in order):
# 1. publish_date: date → text
# 2. RLS: split books_manage_owned into per-op policies
-- Fix 1: publish_date type change (date → text so year-only values like '1987' don't fail)
ALTER TABLE books ALTER COLUMN publish_date TYPE text;

-- Fix 2: Replace RLS policies (FOR ALL was blocking INSERT when no book_copies exist)
DROP POLICY IF EXISTS books_manage_owned ON books;
DROP POLICY IF EXISTS books_insert_all ON books;
DROP POLICY IF EXISTS books_update_all ON books;

CREATE POLICY books_select_all ON books 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY books_insert_all ON books 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY books_update_owned ON books 
    FOR UPDATE USING (((SELECT lib.owner_id FROM libraries lib JOIN book_copies bc 
          ON bc.library_id = lib.id WHERE bc.book_isbn = books.isbn) = auth.uid()))
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY books_delete_owned ON books 
    FOR DELETE USING ((SELECT lib.owner_id FROM libraries lib JOIN book_copies bc 
          ON bc.library_id = lib.id WHERE bc.book_isbn = books.isbn) = auth.uid());
