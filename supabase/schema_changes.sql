-- ════════════════════════════════════════════════
-- Home Library — Account Management Migration
-- Adds admin profile-update policy + email sync trigger
-- Safe to run multiple times (idempotent)
-- ════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. RLS POLICY: profiles_update_admin
-- Lets admins (system_admin, library_owner, librarian)
-- update ANY user's profile fields (name, email, etc.)
-- ───────────────────────────────────────────────

-- DROP + CREATE so this is idempotent even if the policy
-- exists from a previous run.
DO $$
BEGIN
  -- Drop only if the policy exists (avoids errors on fresh DBs)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'profiles_update_admin'
      AND tablename = 'profiles'
  ) THEN
    DROP POLICY profiles_update_admin ON profiles;
  END IF;
END $$;

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

-- ───────────────────────────────────────────────
-- 2. TRIGGER: sync_profile_email
-- When auth.users.email changes, sync the change
-- to the profiles table automatically.
-- Uses SECURITY DEFINER so it can write to profiles
-- regardless of the calling user's RLS permissions.
-- ───────────────────────────────────────────────

-- DROP + CREATE for idempotency
DROP FUNCTION IF EXISTS sync_profile_email() CASCADE;

CREATE OR REPLACE FUNCTION sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when email actually changed
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE profiles
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_email_trigger ON auth.users;

CREATE TRIGGER sync_profile_email_trigger
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE sync_profile_email();
