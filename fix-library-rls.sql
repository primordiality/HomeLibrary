-- Fix library RLS to allow system_admins to assign/change owners
-- Run this in Supabase SQL Editor

-- Drop the old policy that only allows the owner to manage
DROP POLICY IF EXISTS libraries_owner_manage ON libraries;

-- Create new policy that allows owners OR system_admins
CREATE POLICY libraries_owner_manage ON libraries 
    FOR ALL USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'system_admin'
        )
    );
