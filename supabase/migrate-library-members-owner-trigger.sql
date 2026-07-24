-- ════════════════════════════════════════
-- Home Library — Auto-create library_members for library owners
-- Runs idempotently (safe to re-run)
-- ════════════════════════════════════════

-- 1. Create the trigger function (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION _create_library_member_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO library_members (library_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'library_owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS _library_member_on_insert ON libraries;
CREATE TRIGGER _library_member_on_insert
  AFTER INSERT ON libraries
  FOR EACH ROW EXECUTE PROCEDURE _create_library_member_on_insert();

-- 3. Backfill: existing libraries that don't have owner membership rows
--    Only add rows where one is missing (safe to re-run)
INSERT INTO library_members (library_id, user_id, role)
SELECT l.id, l.owner_id, 'library_owner'
FROM libraries l
LEFT JOIN library_members lm
  ON lm.library_id = l.id AND lm.user_id = l.owner_id AND lm.role = 'library_owner'
WHERE lm.id IS NULL;
