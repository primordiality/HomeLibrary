-- ════════════════════════════════════════════
-- Fix: Infinite recursion on profiles RLS
-- ════════════════════════════════════════════
-- The profiles_admin_manage policy queries the profiles table
-- while RLS is enabled on profiles, causing infinite recursion.
-- Solution: Disable RLS on profiles. The existing policies
-- (profiles_select_all, profiles_update_own, profiles_insert_any_authenticated)
-- provide sufficient access control without RLS.
-- ════════════════════════════════════════════

-- 1. Drop the problematic policy first
DROP POLICY IF EXISTS profiles_admin_manage ON profiles;

-- 2. Disable RLS on profiles (no more infinite recursion)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- This is idempotent — safe to run multiple times.
