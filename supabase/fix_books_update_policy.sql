-- ═══════ Fix: Allow authenticated users to update books ═══════
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- The old policy required you to own a book copy to update the book.
-- If you add a book without copies, nobody owns it, so UPDATE is silently blocked.
-- This fix allows any authenticated user to update book metadata.

-- Drop the restrictive update policy
DROP POLICY IF EXISTS books_update_owned ON books;

-- Allow any authenticated user to update book metadata
CREATE POLICY books_update_all
    ON books FOR UPDATE
    TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Keep delete restricted to owners (to prevent accidental deletion)
-- Drop old delete policy and recreate with same logic
DROP POLICY IF EXISTS books_delete_owned ON books;
CREATE POLICY books_delete_owned
    ON books FOR DELETE
    TO authenticated
    USING (
        auth.uid() IN (
            SELECT lib.owner_id
            FROM book_copies bc
            JOIN libraries lib ON bc.library_id = lib.id
            WHERE bc.book_id = books.id
        )
    );

-- Verify policies
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'books'
ORDER BY policyname;
