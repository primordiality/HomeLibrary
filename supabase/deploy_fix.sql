-- Fix for Supabase DB — run in SQL Editor
-- 2 changes: publish_date type + proper RLS policies

-- 1. Change publish_date from date → text so year-only values like '1987' work
ALTER TABLE books ALTER COLUMN publish_date TYPE TEXT;

-- 2. Replace the single FOR ALL policy with per-operation policies
DROP POLICY IF EXISTS books_manage_owned ON books;
DROP POLICY IF EXISTS books_insert_all ON books;
DROP POLICY IF EXISTS books_update_all ON books;
DROP POLICY IF EXISTS books_update_owned ON books;
DROP POLICY IF EXISTS books_delete_owned ON books;

-- INSERT: any logged-in user can add new books (no ownership check → fix the RLS error)
CREATE POLICY books_insert_all ON books 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: any logged-in user can view
CREATE POLICY books_select_all ON books 
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- UPDATE: owners of a copy in their library only
CREATE POLICY books_update_owned ON books 
    FOR UPDATE
    USING ((SELECT lib.owner_id FROM libraries lib 
          JOIN book_copies bc ON bc.library_id = lib.id 
          WHERE bc.book_isbn = books.isbn) = auth.uid())
    WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: owners of a copy in their library only
CREATE POLICY books_delete_owned ON books 
    FOR DELETE
    USING ((SELECT lib.owner_id FROM libraries lib 
          JOIN book_copies bc ON bc.library_id = lib.id 
          WHERE bc.book_isbn = books.isbn) = auth.uid());
