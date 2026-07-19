-- Run in Supabase SQL Editor (Dashboard) → fixes publish_date + RLS insert blockage
-- This drops ALL books-related policies and recreates them cleanly.

-- Drop everything that might exist on the books table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'books' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON books', r.policyname);
    END LOOP;
END $$;

-- Recreate clean per-operation policies
CREATE POLICY books_insert_all ON books 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY books_select_all ON books 
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY books_update_own ON books 
    FOR UPDATE USING ((SELECT lib.owner_id FROM libraries lib JOIN book_copies bc ON bc.library_id = lib.id WHERE bc.book_isbn = books.isbn) = auth.uid()) 
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY books_delete_own ON books 
    FOR DELETE USING ((SELECT lib.owner_id FROM libraries lib JOIN book_copies bc ON bc.library_id = lib.id WHERE bc.book_isbn = books.isbn) = auth.uid());
