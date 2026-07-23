-- ════════════════════════════════════════════
-- Home Library — Suspend/Delete + Library Status Migration
-- Safe to run multiple times (idempotent)
-- ════════════════════════════════════════════

-- ── Helper: drop & recreate a constraint if needed ──────────────
CREATE OR REPLACE FUNCTION _recreate_constraint(
    tbl text, col text, cname text, new_expr text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = cname
          AND conrelid = tbl::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) = new_expr
    ) THEN
        RAISE NOTICE 'Constraint % already has correct expression, skipping', cname;
    ELSE
        RAISE NOTICE 'Recreating constraint %', cname;
        EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I; '
            'ALTER TABLE %I ADD CONSTRAINT %I %s',
            tbl, cname, tbl, cname, new_expr
        );
    END IF;
END;
$$;

-- ── Helper: add column if not exists ────────────────────────────
CREATE OR REPLACE FUNCTION _add_column(
    tbl text, col text, definition text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = tbl
          AND column_name = col
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', tbl, col, definition);
    END IF;
END;
$$;

-- ════════════════════════════════════════════
-- 1. UPDATE profiles status CHECK constraint
--    status IN ('pending', 'active', 'suspended', 'deleted')
-- ════════════════════════════════════════════
SELECT _recreate_constraint(
    'profiles', 'status',
    'profiles_status_check',
    'CHECK (status IN (''pending'', ''active'', ''suspended'', ''deleted''))'
);

-- ════════════════════════════════════════════
-- 2. ADD COLUMN profiles.updated_at
-- 3. ADD COLUMN profiles.deleted_at
-- ════════════════════════════════════════════
SELECT _add_column('profiles', 'updated_at', 'timestamptz NOT NULL DEFAULT now()');
SELECT _add_column('profiles', 'deleted_at', 'timestamptz');

-- ════════════════════════════════════════════
-- 4. CREATE FUNCTION update_updated_at_column()
-- 5. CREATE TRIGGER profiles_updated_at_trigger
-- ════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at_trigger ON profiles;
CREATE TRIGGER profiles_updated_at_trigger
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- ════════════════════════════════════════════
-- 6. CREATE RLS policy profiles_admin_manage
--    system admins can UPDATE/DELETE any profile
-- ════════════════════════════════════════════
DROP POLICY IF EXISTS profiles_admin_manage ON profiles;
CREATE POLICY profiles_admin_manage ON profiles
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role = 'system_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role = 'system_admin'
        )
    );

-- ════════════════════════════════════════════
-- 7. CREATE TABLE user_deletion_flags
-- ════════════════════════════════════════════
DROP TABLE IF EXISTS user_deletion_flags;
CREATE TABLE user_deletion_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id uuid REFERENCES libraries(id),
    deleted_user_id uuid REFERENCES profiles(id),
    borrow_id uuid REFERENCES borrows(id),
    copy_id uuid REFERENCES book_copies(id),
    status text CHECK (status IN ('pending', 'returned', 'lost')) DEFAULT 'pending',
    notes text,
    resolved_at timestamptz,
    resolved_by uuid REFERENCES profiles(id)
);
ALTER TABLE user_deletion_flags ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════
-- 8. RLS on user_deletion_flags
--    system admins: select/update all
--    librarians: select/update for their own library
-- ════════════════════════════════════════════
CREATE POLICY user_deletion_flags_select_all ON user_deletion_flags
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY user_deletion_flags_manage ON user_deletion_flags
    FOR ALL
    USING (
        -- System admins: full access
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role = 'system_admin'
        )
        OR
        -- Librarians: their own library
        EXISTS (
            SELECT 1 FROM library_members lm
            JOIN libraries lib ON lib.id = lm.library_id
            WHERE lm.user_id = auth.uid()
              AND lm.role = 'librarian'
              AND lib.id = user_deletion_flags.library_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role = 'system_admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM library_members lm
            JOIN libraries lib ON lib.id = lm.library_id
            WHERE lm.user_id = auth.uid()
              AND lm.role = 'librarian'
              AND lib.id = user_deletion_flags.library_id
        )
    );

-- ════════════════════════════════════════════
-- 9. ADD COLUMN libraries.library_status
--    CHECK ('active' | 'archived' | 'read_only') default 'active'
-- ════════════════════════════════════════════
SELECT _add_column('libraries', 'library_status', 'text DEFAULT ''active''');

-- Set existing rows (libraries table already has updated_at from schema.sql,
-- so any prior partial runs that added library_status would be NULL → default now)
UPDATE libraries SET library_status = 'active' WHERE library_status IS NULL;

-- Add NOT NULL + CHECK constraint
ALTER TABLE libraries ALTER COLUMN library_status SET NOT NULL;

SELECT _recreate_constraint(
    'libraries', 'library_status',
    'libraries_library_status_check',
    'CHECK (library_status IN (''active'', ''archived'', ''read_only''))'
);

-- ════════════════════════════════════════════
-- 10. CREATE helper function for library status checks
-- ════════════════════════════════════════════
CREATE OR REPLACE FUNCTION _library_status(lib_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
    SELECT library_status FROM libraries WHERE id = lib_id
$$;

-- ════════════════════════════════════════════
-- 10. UPDATE libraries_select_all RLS
--     exclude library_status = 'archived' for non-admins
-- ════════════════════════════════════════════
DROP POLICY IF EXISTS libraries_select_all ON libraries;
CREATE POLICY libraries_select_all ON libraries
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            _library_status(id) <> 'archived'
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE id = auth.uid() AND role = 'system_admin'
            )
        )
    );

-- ════════════════════════════════════════════
-- 11. UPDATE book_copies RLS
--     allow inserts only when library_status != 'archived'
-- ════════════════════════════════════════════
DROP POLICY IF EXISTS book_copies_insert_all ON book_copies;
CREATE POLICY book_copies_insert_all ON book_copies
    FOR INSERT
    WITH CHECK (
        _library_status(library_id) <> 'archived'
    );

-- Also restrict library owners/librarians from creating copies in archived libraries
DROP POLICY IF EXISTS book_copies_manage_owners_or_librarians ON book_copies;
CREATE POLICY book_copies_manage_owners_or_librarians ON book_copies
    FOR ALL
    USING (
        _library_status(library_id) <> 'archived'
        AND (
            (SELECT l.owner_id FROM libraries l WHERE l.id = book_copies.library_id) = auth.uid()
            OR EXISTS (
                SELECT 1 FROM library_members lm
                JOIN libraries ll ON ll.id = lm.library_id
                WHERE ll.id = book_copies.library_id
                  AND lm.user_id = auth.uid()
                  AND lm.role IN ('librarian', 'system_admin')
            )
        )
    );

-- ════════════════════════════════════════════
-- 12. UPDATE borrows RLS
--     allow inserts only when library_status != 'archived'
-- ════════════════════════════════════════════
DROP POLICY IF EXISTS borrows_manage_owners_or_librarians ON borrows;
CREATE POLICY borrows_manage_owners_or_librarians ON borrows
    FOR ALL
    USING (
        patron_user_id = auth.uid()
        OR (
            _library_status((SELECT library_id FROM book_copies WHERE id = borrows.copy_id)) <> 'archived'
            AND copy_id IN (
                SELECT id FROM book_copies WHERE library_id IN (
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
    );

-- ════════════════════════════════════════════
-- 13. UPDATE holds RLS
--     allow inserts only when library_status != 'archived'
-- ════════════════════════════════════════════
DROP POLICY IF EXISTS holds_manage_owners_or_librarians ON holds;
CREATE POLICY holds_manage_owners_or_librarians ON holds
    FOR ALL
    USING (
        _library_status(library_id) <> 'archived'
        AND (
            EXISTS (
                SELECT 1 FROM libraries lib
                WHERE lib.id = library_id AND lib.owner_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM library_members lm
                JOIN libraries ll ON ll.id = lm.library_id
                WHERE ll.id = holds.library_id
                  AND lm.user_id = auth.uid()
                  AND lm.role IN ('librarian', 'system_admin')
            )
        )
    );

-- ════════════════════════════════════════════
-- VERIFICATION: check_after
-- Paste this into Supabase SQL Editor to verify:
-- ════════════════════════════════════════════
--
-- -- Constraints
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('profiles'::regclass, 'libraries'::regclass, 'user_deletion_flags'::regclass)
--     AND contype = 'c'
--   ORDER BY conrelid::text, conname;
--
-- -- Column existence
-- SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name IN ('profiles', 'libraries', 'user_deletion_flags')
--     AND column_name IN ('updated_at', 'deleted_at', 'library_status')
--   ORDER BY table_name, ordinal_position;
--
-- -- Triggers on profiles
-- SELECT tgname, tgtype, pg_get_triggerdef(oid) FROM pg_trigger
--   WHERE tgrelid = 'profiles'::regclass
--     AND NOT tgisinternal;
--
-- -- RLS policies
-- SELECT tablename, policyname, cmd, roles, qual IS NOT NULL as has_using, with_check IS NOT NULL as has_with_check
--   FROM pg_policies
--   WHERE tablename IN ('profiles', 'libraries', 'book_copies', 'borrows', 'holds', 'user_deletion_flags')
--   ORDER BY tablename, policyname;
--
-- -- RLS enabled?
-- SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname IN ('profiles', 'libraries', 'book_copies', 'borrows', 'holds', 'user_deletion_flags');
--
-- -- Test: library_status check works
-- SELECT current_setting('role') AS role, auth.uid() AS uid;
--
-- -- Test: function returns non-null for all libraries
-- SELECT library_status, count(*) FROM libraries GROUP BY library_status;
