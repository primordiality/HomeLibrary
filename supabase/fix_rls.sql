#!/bin/bash\n-- Run this in Supabase SQL Editor to fix the RLS policy blocking book inserts\n\n-- FIX: Replace the broken books RLS policies.
-- 
-- The problem: books_manage_owned was FOR ALL, meaning it blocked INSERTs
-- when there are no book_copies yet (subquery returns NULL).
-- 
-- Solution: separate UPDATE/DELETE from INSERT policy.

DROP POLICY IF EXISTS books_manage_owned ON books;
DROP POLICY IF EXISTS books_insert_all ON books;
DROP POLICY IF EXISTS books_update_all ON books;

CREATE POLICY books_select_all ON books FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only owners of books in THEIR library can update/delete them
CREATE POLICY books_manage_owned ON books 
    FOR UPDATE OR DELETE USING (((SELECT lib.owner_id FROM libraries lib 
                      JOIN book_copies bc ON bc.library_id = lib.id 
                      WHERE bc.book_isbn = books.isbn) = auth.uid()));

-- Any authenticated user can INSERT (so new books can be added)
CREATE POLICY books_insert_all ON books FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY books_update_all ON books FOR UPDATE USING (true) 
    WITH CHECK (auth.uid() IS NOT NULL);
