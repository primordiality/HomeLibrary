-- Migration: Add status column, fix RLS infinite recursion, update trigger
-- Run this in Supabase SQL Editor
-- This script is idempotent

-- ════════════════════════════════════════════════════════════
-- FIX: Infinite recursion in profiles RLS policies
-- Policies that query profiles within their own USING clause
-- cause infinite loops. Use SECURITY DEFINER functions instead.
-- ════════════════════════════════════════════════════════════

-- Helper functions that bypass RLS
CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'system_admin'
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
    WHERE id = auth.uid()
    AND role IN ('system_admin', 'library_owner', 'librarian')
  );
$$;

-- Drop all existing profiles policies to start clean
DROP POLICY IF EXISTS profiles_insert_any_authenticated ON profiles;
DROP POLICY IF EXISTS profiles_select_all ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON profiles;
DROP POLICY IF EXISTS profiles_update_admin ON profiles;
DROP POLICY IF EXISTS profiles_delete_admin ON profiles;
DROP POLICY IF EXISTS profiles_admin_manage ON profiles;

-- Recreate safe policies
CREATE POLICY profiles_insert_any_authenticated ON profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY profiles_select_all ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Admin/management-only: use SECURITY DEFINER functions to avoid recursion
CREATE POLICY profiles_admin_manage ON profiles
  FOR ALL
  USING (is_management_role())
  WITH CHECK (is_management_role());

-- ════════════════════════════════════════════════════════════
-- ADD: status column to profiles
-- ════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'suspended'));
  END IF;
END
$$;

-- ════════════════════════════════════════════════════════════
-- UPDATE: auth trigger sets role='patron' status='pending'
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_attr->>'display_name', ''),
    NEW.email,
    'patron',
    'pending'
  )
  ON CONFLICT (id) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, profiles.name),
        email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
