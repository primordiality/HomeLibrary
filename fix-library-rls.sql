-- Fix: Allow system_admins to update library owner_id
DROP POLICY IF EXISTS libraries_owner_manage ON libraries;
CREATE POLICY libraries_owner_manage ON libraries 
    FOR ALL USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'system_admin'
        )
    );
