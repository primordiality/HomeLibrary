-- Migration: Add first_name and last_name to profiles table
-- Run this in Supabase SQL Editor before using the patron creation form.
-- This script is idempotent and preserves the FK to auth.users.

-- Add first_name column if it doesn't exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'first_name') THEN
        ALTER TABLE profiles ADD COLUMN first_name text;
    END IF;
END $$;

-- Add last_name column if it doesn't exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'last_name') THEN
        ALTER TABLE profiles ADD COLUMN last_name text;
    END IF;
END $$;
