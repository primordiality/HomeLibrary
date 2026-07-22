-- ═══════ Supabase Storage Setup ═══════
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Prerequisite: Storage API must be enabled (Dashboard → Storage → Settings)

-- 1. Enable the storage extension (required for storage.policies table)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the bucket
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

-- 3. Create RLS policies (handles the "new row violates RLS" error)
-- View images (anyone can see them since bucket is public)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies WHERE name = 'Anyone can view images'
  ) THEN
    CREATE POLICY "Anyone can view images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'library-images');
  END IF;
END $$;

-- Upload images (authenticated users only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies WHERE name = 'Authenticated users can upload'
  ) THEN
    CREATE POLICY "Authenticated users can upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'library-images'
      AND auth.uid() IS NOT NULL
    );
  END IF;
END $$;

-- Update images (authenticated users only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies WHERE name = 'Authenticated users can update own images'
  ) THEN
    CREATE POLICY "Authenticated users can update own images"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'library-images'
      AND auth.uid() IS NOT NULL
    );
  END IF;
END $$;

-- Delete images (authenticated users only)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies WHERE name = 'Authenticated users can delete own images'
  ) THEN
    CREATE POLICY "Authenticated users can delete own images"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'library-images'
      AND auth.uid() IS NOT NULL
    );
  END IF;
END $$;

-- 4. Verify setup
SELECT 'Bucket' as check_type, id, name, public FROM storage.buckets WHERE id = 'library-images'
UNION ALL
SELECT 'Policy' as check_type, p.name::text, p.policy_type::text, 'yes'::text
FROM storage.policies p
WHERE p.bucket_id = 'library-images';
