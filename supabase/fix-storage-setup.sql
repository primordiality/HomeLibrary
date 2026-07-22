-- ═══════ Supabase Storage Setup ═══════
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Prerequisite: Storage API must be enabled (Dashboard → Storage → Settings)
-- Note: Policies must be created via the Storage UI (Dashboard → Storage → Policies),
-- not via SQL Editor, as storage.policies is not queryable directly.

-- 1. Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'library-images',
  'library-images',
  true,
  5242880,        -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- 2. Verify bucket exists
SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'library-images';
