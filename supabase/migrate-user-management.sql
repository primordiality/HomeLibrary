-- ════════════════════════════════════════════
-- Home Library — User Management Migration
-- 1. Add status column to profiles
-- 2. Update handle_new_user trigger logic
-- 3. Add library_settings table
-- 4. Add RLS policy for system_admin profile access
-- 5. Update ALL RLS policies to check profiles.status
-- ════════════════════════════════════════════

-- ════════════════════════════════════════════
-- 1. ALTER TABLE profiles: add status column
-- ════════════════════════════════════════════
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS status text
        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'suspended'));

-- ════════════════════════════════════════════
-- 2. Partial index on pending profiles (for admin lookup)
-- ════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_profiles_status
    ON profiles (status)
    WHERE status = 'pending';

-- ════════════════════════════════════════════
-- 3. Update handle_new_user trigger
--    - Self-register: role=patron, status=pending
--    - Admin creates user (role in raw_user_meta_attr): status=active, role from metadata
-- ════════════════════════════════════════════
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users CASCADE;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    meta_role text;
BEGIN
    -- Determine if a role was explicitly set (admin creating user)
    meta_role := NEW.raw_user_meta_attr->>'role';

    INSERT INTO profiles (id, name, email, role, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_attr->>'display_name', ''),
        NEW.email,
        CASE
            WHEN meta_role IS NOT NULL AND meta_role != '' THEN meta_role  -- admin created: use given role
            ELSE 'patron'                                                  -- self-register: default patron
        END,
        CASE
            WHEN meta_role IS NOT NULL AND meta_role != '' THEN 'active'    -- admin created: active immediately
            ELSE 'pending'                                                 -- self-register: pending
        END
    )
    ON CONFLICT (id) DO UPDATE
        SET
            name   = COALESCE(EXCLUDED.name, profiles.name),
            email  = EXCLUDED.email,
            role   = EXCLUDED.role,
            status = EXCLUDED.status;

    RETURN NEW;
END;
$$;

-- Re-wire the auth trigger
CREATE TRIGGER handle_new_user_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ════════════════════════════════════════════
-- 4. library_settings table
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS library_settings (
    library_id uuid PRIMARY KEY REFERENCES libraries(id),
    allow_public_registration boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════
-- 5. RLS POLICIES — update ALL tables
--    New rules:
--      - profiles.status must be 'active' or 'pending' for normal users
--      - system_admin can see ALL profiles regardless of status
--      - suspended users get NO access
-- ════════════════════════════════════════════

-- Helper: current user is NOT suspended
-- helper for downgrading to legacy auth.users approach:
-- since we now have profiles table, we need to join profiles for status checks
-- But auth.uid() exists — we join profiles on id for status

-- ── profiles ──────────────────────────────────
-- INSERT: any authenticated can insert (auth trigger handles it)
DROP POLICY IF EXISTS profiles_insert_any_authenticated ON profiles;
CREATE POLICY profiles_insert_any_authenticated
    ON profiles FOR INSERT WITH CHECK (true);

-- SELECT: non-suspended users can see profiles; system_admin sees all
DROP POLICY IF EXISTS profiles_select_all ON profiles;
CREATE POLICY profiles_select_all
    ON profiles FOR SELECT
    USING (
        -- system_admin sees everything
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
        OR
        -- others see non-suspended profiles only
        (
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
            )
        )
    );

-- UPDATE: non-suspended users can update their own row
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own
    ON profiles FOR UPDATE
    USING (
        id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
            )
            OR
            EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid() AND p.role = 'system_admin'
            )
        )
    )
    WITH CHECK (id = auth.uid());

-- ── libraries ─────────────────────────────────
DROP POLICY IF EXISTS libraries_select_all ON libraries;
CREATE POLICY libraries_select_all
    ON libraries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS libraries_owner_manage ON libraries;
CREATE POLICY libraries_owner_manage
    ON libraries FOR ALL
    USING (
        owner_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

-- ── library_members ───────────────────────────
DROP POLICY IF EXISTS library_members_select_all ON library_members;
CREATE POLICY library_members_select_all
    ON library_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS library_members_manage_owned ON library_members;
CREATE POLICY library_members_manage_owned
    ON library_members FOR ALL
    USING (
        (SELECT lib.owner_id FROM libraries lib WHERE lib.id = library_members.library_id) = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

-- ── locations ─────────────────────────────────
DROP POLICY IF EXISTS locations_select_all ON locations;
CREATE POLICY locations_select_all
    ON locations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS locations_manage_owned ON locations;
CREATE POLICY locations_manage_owned
    ON locations FOR ALL
    USING (
        (SELECT lib.owner_id FROM libraries lib WHERE lib.id = locations.library_id) = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

-- ── books ─────────────────────────────────────
DROP POLICY IF EXISTS books_select_all ON books;
CREATE POLICY books_select_all
    ON books FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS books_insert_all ON books;
CREATE POLICY books_insert_all
    ON books FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS books_update_owned ON books;
CREATE POLICY books_update_owned
    ON books FOR UPDATE
    USING (
        (
            SELECT lib.owner_id FROM libraries lib
            JOIN book_copies bc ON bc.library_id = lib.id
            WHERE bc.book_isbn = books.isbn
        ) = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS books_delete_owned ON books;
CREATE POLICY books_delete_owned
    ON books FOR DELETE
    USING (
        (
            SELECT lib.owner_id FROM libraries lib
            JOIN book_copies bc ON bc.library_id = lib.id
            WHERE bc.book_isbn = books.isbn
        ) = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

-- ── book_copies ───────────────────────────────
DROP POLICY IF EXISTS book_copies_select_all ON book_copies;
CREATE POLICY book_copies_select_all
    ON book_copies FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS book_copies_manage_owners_or_librarians ON book_copies;
CREATE POLICY book_copies_manage_owners_or_librarians
    ON book_copies FOR ALL
    USING (
        (
            (SELECT l.owner_id FROM libraries l
             WHERE l.id = book_copies.library_id) = auth.uid()
            OR EXISTS (
                SELECT 1 FROM library_members lm
                JOIN libraries ll ON ll.id = lm.library_id
                WHERE ll.id = book_copies.library_id
                  AND lm.user_id = auth.uid()
                  AND lm.role IN ('librarian', 'system_admin')
            )
        )
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

DROP POLICY IF EXISTS book_copies_insert_all ON book_copies;
CREATE POLICY book_copies_insert_all
    ON book_copies FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

-- ── borrows ───────────────────────────────────
DROP POLICY IF EXISTS borrows_select_all ON borrows;
CREATE POLICY borrows_select_all
    ON borrows FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS borrows_manage_owners_or_librarians ON borrows;
CREATE POLICY borrows_manage_owners_or_librarians
    ON borrows FOR ALL
    USING (
        (
            patron_user_id = auth.uid()
            OR copy_id IN (
                SELECT id FROM book_copies
                WHERE library_id IN (
                    SELECT id FROM libraries WHERE owner_id = auth.uid()
                )
            )
            OR copy_id IN (
                SELECT bc.id FROM book_copies bc
                JOIN libraries lib ON lib.id = bc.library_id
                JOIN library_members lm ON lm.library_id = lib.id
                WHERE lm.user_id = auth.uid() AND lm.role IN ('librarian', 'system_admin')
            )
        )
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

-- ── holds ─────────────────────────────────────
DROP POLICY IF EXISTS holds_select_all ON holds;
CREATE POLICY holds_select_all
    ON holds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.role = 'system_admin'
        )
    );

DROP POLICY IF EXISTS holds_manage_owners_or_librarians ON holds;
CREATE POLICY holds_manage_owners_or_librarians
    ON holds FOR ALL
    USING (
        (
            EXISTS (
                SELECT 1 FROM libraries lib
                WHERE lib.id = holds.library_id AND lib.owner_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM library_members lm
                JOIN libraries ll ON ll.id = lm.library_id
                WHERE ll.id = holds.library_id AND lm.user_id = auth.uid()
                  AND lm.role IN ('librarian', 'system_admin')
            )
        )
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.status IN ('active', 'pending')
        )
    );

-- ════════════════════════════════════════════
-- 6. Bootstrap: promote existing user to system_admin
--    If a system_admin already exists → activate them
--    If none exists → promote the oldest profile to system_admin + active
--    This solves the chicken-and-egg: without an active admin, no one can
--    flip pending users to active after this migration.
-- ════════════════════════════════════════════

-- Activate existing system_admins (if any)
UPDATE profiles SET status = 'active'
WHERE role = 'system_admin';

-- Promote oldest profile to system_admin + active (only if none exists)
UPDATE profiles SET status = 'active', role = 'system_admin'
WHERE id = (
    SELECT id FROM profiles
    WHERE id NOT IN (SELECT id FROM profiles WHERE role = 'system_admin')
    ORDER BY created_at ASC
    LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'system_admin');
