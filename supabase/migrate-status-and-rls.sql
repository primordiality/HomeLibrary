-- ════════════════════════════════════════════════════════════
-- Home Library — Add status + library_settings + proper RLS
-- Safe to run multiple times (idempotent)
-- Run in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 1. Helper functions for RLS (SECURITY DEFINER avoids recursion)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'system_admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_management_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('system_admin', 'library_owner', 'librarian')
  );
$$;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status IN ('active', 'pending')
  );
$$;

-- ════════════════════════════════════════════════════════════
-- 2. Add status column to profiles (if missing)
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN status text DEFAULT 'pending';
    -- Add constraint after the column exists
    ALTER TABLE profiles ADD CONSTRAINT profiles_status_check
      CHECK (status IN ('pending', 'active', 'suspended'));
    -- Backfill existing profiles
    UPDATE profiles SET status = 'active' WHERE status IS NULL;
    -- Make NOT NULL now that we've backfilled
    ALTER TABLE profiles ALTER COLUMN status SET NOT NULL;
    ALTER TABLE profiles ALTER COLUMN status SET DEFAULT 'pending';
  END IF;
END
$$;

-- Partial index for pending lookup
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status) WHERE status = 'pending';

-- ════════════════════════════════════════════════════════════
-- 3. Add library_settings table (if missing)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS library_settings (
  library_id uuid PRIMARY KEY REFERENCES libraries(id),
  allow_public_registration boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE library_settings ENABLE ROW LEVEL SECURITY;

-- system_admin full access
DROP POLICY IF EXISTS library_settings_admin_all ON library_settings;
CREATE POLICY library_settings_admin_all
  ON library_settings FOR ALL
  USING (is_system_admin())
  WITH CHECK (is_system_admin());

-- active/pending users can read their libraries' settings
DROP POLICY IF EXISTS library_settings_read ON library_settings;
CREATE POLICY library_settings_read
  ON library_settings FOR SELECT
  USING (
    is_active_user()
    AND library_id IN (
      SELECT id FROM libraries WHERE owner_id = auth.uid()
      UNION
      SELECT library_id FROM library_members
      WHERE user_id = auth.uid() AND role IN ('librarian', 'system_admin')
    )
  );

-- ════════════════════════════════════════════════════════════
-- 4. Update handle_new_user trigger to set status
-- ════════════════════════════════════════════════════════════

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
  meta_role := NEW.raw_user_meta_attr->>'role';

  INSERT INTO profiles (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_attr->>'display_name', ''),
    NEW.email,
    CASE
      WHEN meta_role IS NOT NULL AND meta_role != '' THEN meta_role
      ELSE 'patron'
    END,
    CASE
      WHEN meta_role IS NOT NULL AND meta_role != '' THEN 'active'
      ELSE 'pending'
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

CREATE TRIGGER handle_new_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ════════════════════════════════════════════════════════════
-- 5. Update ALL RLS policies
-- ════════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────
DROP POLICY IF EXISTS profiles_insert_any_authenticated ON profiles;
DROP POLICY IF EXISTS profiles_select_all ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;

CREATE POLICY profiles_insert_any_authenticated
  ON profiles FOR INSERT WITH CHECK (true);

CREATE POLICY profiles_select_all
  ON profiles FOR SELECT
  USING (
    -- system_admin sees everything
    is_system_admin()
    OR
    -- others see non-suspended profiles
    is_active_user()
  );

CREATE POLICY profiles_update_own
  ON profiles FOR UPDATE
  USING (
    id = auth.uid()
    AND (is_active_user() OR is_system_admin())
  )
  WITH CHECK (id = auth.uid());

-- ── libraries ─────────────────────────────────
DROP POLICY IF EXISTS libraries_select_all ON libraries;
DROP POLICY IF EXISTS libraries_owner_manage ON libraries;

CREATE POLICY libraries_select_all
  ON libraries FOR SELECT
  USING (is_active_user() OR is_system_admin());

CREATE POLICY libraries_owner_manage
  ON libraries FOR ALL
  USING (
    owner_id = auth.uid()
    AND is_active_user()
  );

-- ── library_members ───────────────────────────
DROP POLICY IF EXISTS library_members_select_all ON library_members;
DROP POLICY IF EXISTS library_members_manage_owned ON library_members;

CREATE POLICY library_members_select_all
  ON library_members FOR SELECT
  USING (is_active_user() OR is_system_admin());

CREATE POLICY library_members_manage_owned
  ON library_members FOR ALL
  USING (
    (SELECT lib.owner_id FROM libraries lib WHERE lib.id = library_members.library_id) = auth.uid()
    AND is_active_user()
  );

-- ── locations ─────────────────────────────────
DROP POLICY IF EXISTS locations_select_all ON locations;
DROP POLICY IF EXISTS locations_manage_owned ON locations;

CREATE POLICY locations_select_all
  ON locations FOR SELECT
  USING (is_active_user() OR is_system_admin());

CREATE POLICY locations_manage_owned
  ON locations FOR ALL
  USING (
    (SELECT lib.owner_id FROM libraries lib WHERE lib.id = locations.library_id) = auth.uid()
    AND is_active_user()
  );

-- ── books ─────────────────────────────────────
DROP POLICY IF EXISTS books_select_all ON books;
DROP POLICY IF EXISTS books_insert_all ON books;
DROP POLICY IF EXISTS books_update_owned ON books;
DROP POLICY IF EXISTS books_delete_owned ON books;

CREATE POLICY books_select_all
  ON books FOR SELECT
  USING (is_active_user() OR is_system_admin());

CREATE POLICY books_insert_all
  ON books FOR INSERT
  WITH CHECK (is_active_user() OR is_system_admin());

CREATE POLICY books_update_owned
  ON books FOR UPDATE
  USING (
    (SELECT lib.owner_id FROM libraries lib
     JOIN book_copies bc ON bc.library_id = lib.id
     WHERE bc.book_id = books.id) = auth.uid()
    AND is_active_user()
  )
  WITH CHECK (
    is_active_user() OR is_system_admin()
  );

CREATE POLICY books_delete_owned
  ON books FOR DELETE
  USING (
    (SELECT lib.owner_id FROM libraries lib
     JOIN book_copies bc ON bc.library_id = lib.id
     WHERE bc.book_id = books.id) = auth.uid()
    AND is_active_user()
  );

-- ── book_copies ───────────────────────────────
DROP POLICY IF EXISTS book_copies_select_all ON book_copies;
DROP POLICY IF EXISTS book_copies_manage_owners_or_librarians ON book_copies;
DROP POLICY IF EXISTS book_copies_insert_all ON book_copies;

CREATE POLICY book_copies_select_all
  ON book_copies FOR SELECT
  USING (is_active_user() OR is_system_admin());

CREATE POLICY book_copies_manage_owners_or_librarians
  ON book_copies FOR ALL
  USING (
    (
      (SELECT l.owner_id FROM libraries l WHERE l.id = book_copies.library_id) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM library_members lm
        JOIN libraries ll ON ll.id = lm.library_id
        WHERE ll.id = book_copies.library_id
          AND lm.user_id = auth.uid()
          AND lm.role IN ('librarian', 'system_admin')
      )
    )
    AND is_active_user()
  );

CREATE POLICY book_copies_insert_all
  ON book_copies FOR INSERT
  WITH CHECK (is_active_user() OR is_system_admin());

-- ── borrows ───────────────────────────────────
DROP POLICY IF EXISTS borrows_select_all ON borrows;
DROP POLICY IF EXISTS borrows_manage_owners_or_librarians ON borrows;

CREATE POLICY borrows_select_all
  ON borrows FOR SELECT
  USING (is_active_user() OR is_system_admin());

CREATE POLICY borrows_manage_owners_or_librarians
  ON borrows FOR ALL
  USING (
    (
      patron_user_id = auth.uid()
      OR copy_id IN (
        SELECT id FROM book_copies
        WHERE library_id IN (SELECT id FROM libraries WHERE owner_id = auth.uid())
      )
      OR copy_id IN (
        SELECT bc.id FROM book_copies bc
        JOIN libraries lib ON lib.id = bc.library_id
        JOIN library_members lm ON lm.library_id = lib.id
        WHERE lm.user_id = auth.uid() AND lm.role IN ('librarian', 'system_admin')
      )
    )
    AND is_active_user()
  );

-- ── holds ─────────────────────────────────────
DROP POLICY IF EXISTS holds_select_all ON holds;
DROP POLICY IF EXISTS holds_manage_owners_or_librarians ON holds;

CREATE POLICY holds_select_all
  ON holds FOR SELECT
  USING (is_active_user() OR is_system_admin());

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
    AND is_active_user()
  );

-- ════════════════════════════════════════════════════════════
-- 6. Bootstrap: activate existing users
-- ════════════════════════════════════════════════════════════

-- Activate existing system_admins (if any)
UPDATE profiles SET status = 'active' WHERE role = 'system_admin';

-- Promote oldest non-admin profile to system_admin + active (only if none exists)
UPDATE profiles SET status = 'active', role = 'system_admin'
WHERE id = (
    SELECT id FROM profiles
    WHERE id NOT IN (SELECT id FROM profiles WHERE role = 'system_admin')
    ORDER BY created_at ASC
    LIMIT 1
  )
AND NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'system_admin');
