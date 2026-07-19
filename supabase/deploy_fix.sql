-- Run in Supabase SQL Editor (Dashboard) → fixes 2 issues:
-- 1) publish_date type (date → text so "1987" works)
-- 2) Replace FOR ALL RLS policy with per-operation policies so INSERT doesn't fail

ALTER TABLE books ALTER COLUMN publish_date TYPE TEXT;

DROP POLICY IF EXISTS books_manage_owned ON books;
DROP POLICY IF EXISTS books_insert_all ON books;
DROP POLICY IF EXISTS books_update_all ON books;
DROP POLICY IF EXISTS books_update_owned ON books;
DROP POLICY IF EXISTS books_delete_owned ON books;

CREATE POLICY books_insert_all ON books 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY books_select_all ON books 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY books_update_owned ON books 
    FOR UPDATE
    USING ((SELECT lib.owner_id FROM libraries lib 
          JOIN book_copies bc ON bc.library_id = lib.id 
          WHERE bc.book_isbn = books.isbn) = auth.uid())
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY books_delete_owned ON books 
    FOR DELETE
    USING ((SELECT lib.owner_id FROM libraries lib 
          JOIN book_copies bc ON bc.library_id = lib.id 
          WHERE bc.book_isbn = books.isbn) = auth.uid());
