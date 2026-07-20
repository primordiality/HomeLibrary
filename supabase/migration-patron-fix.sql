-- Migration: Allow manual patron creation in profiles table
-- Run this in Supabase SQL Editor before using the patron creation form.
-- This script is idempotent.

-- ════════════════════════════════════════
-- Fix 1: Remove FK constraint on profiles.id
-- ════════════════════════════════════════
-- profiles.id was constrained to auth.users(id), preventing manual creation
-- of patrons without a corresponding auth.user record.

-- Drop PK first to remove FK index
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
-- Drop the FK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
-- Add auto-generated UUID as default so INSERTs without explicit id work
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- Restore PK
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

-- ════════════════════════════════════════
-- Fix 2: Add first_name and last_name columns
-- ════════════════════════════════════════
-- The profiles table currently only has a 'name' column, but the patron
-- form inserts first_name and last_name.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'first_name') THEN
        ALTER TABLE profiles ADD COLUMN first_name text;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'last_name') THEN
        ALTER TABLE profiles ADD COLUMN last_name text;
    END IF;
END $$;

-- ════════════════════════════════════════
-- Fix 3: Update RLS policies
-- ════════════════════════════════════════
-- Drop the old permissive insert policy and replace with role-based admin insert

DROP POLICY IF EXISTS profiles_insert_any_authenticated ON profiles;

CREATE POLICY profiles_insert_admin ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('system_admin', 'library_owner', 'librarian')
    )
  );

CREATE POLICY profiles_select_all ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_admin ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('system_admin', 'library_owner', 'librarian')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('system_admin', 'library_owner', 'librarian')
    )
  );

CREATE POLICY profiles_delete_admin ON profiles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('system_admin', 'library_owner', 'librarian')
    )
  );

-- ════════════════════════════════════════
-- Fix 4: Update auth trigger for new columns
-- ════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_attr->>'display_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_attr->>'first_name', NULL),
    COALESCE(NEW.raw_user_meta_attr->>'last_name', NULL)
  )
  ON CONFLICT (id) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, profiles.name),
        email = EXCLUDED.email,
        first_name = COALESCE(EXCLUDED.first_name, profiles.first_name),
        last_name = COALESCE(EXCLUDED.last_name, profiles.last_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ════════════════════════════════════════
-- Fix 5: Add unique email index
-- ════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email) WHERE email IS NOT NULL;
