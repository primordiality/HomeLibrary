-- Fix book_copies RLS policies
-- Without these, RLS blocks all INSERT/SELECT/UPDATE/DELETE on book_copies

-- Drop any existing broken policies
DROP POLICY IF EXISTS book_copies_select_all ON book_copies;
DROP POLICY IF EXISTS book_copies_insert_all ON book_copies;
DROP POLICY IF EXISTS book_copies_update_all ON book_copies;
DROP POLICY IF EXISTS book_copies_delete_all ON book_copies;

-- SELECT: authenticated users can read book_copies
CREATE POLICY book_copies_select_all ON book_copies
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: authenticated users can insert book_copies
CREATE POLICY book_copies_insert_all ON book_copies
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: authenticated users can update book_copies
CREATE POLICY book_copies_update_all ON book_copies
    FOR UPDATE USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: authenticated users can delete book_copies
CREATE POLICY book_copies_delete_all ON book_copies
    FOR DELETE USING (auth.uid() IS NOT NULL);
