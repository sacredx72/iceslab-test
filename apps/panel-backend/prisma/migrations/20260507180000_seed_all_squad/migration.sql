-- Slice 26: wire-up the dormant Squad ACL.
--
-- The `groups`, `group_inbounds`, `group_members` tables have existed since
-- slice 3 but were never populated — every user implicitly saw every inbound.
-- This migration:
--   1. Inserts a default "All" group with a stable, well-known UUID so app
--      code can reference it without a query.
--   2. Backfills `group_inbounds` with (All × every existing inbound) — keeps
--      current behaviour identical post-migration.
--   3. Backfills `group_members` with (All × every existing user, including
--      soft-deleted ones — they're filtered at read time anyway).
--
-- Idempotent: re-running is a no-op because of the WHERE NOT EXISTS guards.

-- ───── 1. Seed "All" group ─────
INSERT INTO "groups" (id, name, description, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'All',
  'Default group containing every inbound. Auto-membership for new users.',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "groups" WHERE name = 'All'
);

-- ───── 2. Backfill group_inbounds (All × every inbound) ─────
INSERT INTO "group_inbounds" (group_id, inbound_id, created_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  i.id,
  NOW()
FROM "inbounds" i
WHERE NOT EXISTS (
  SELECT 1
  FROM "group_inbounds" gi
  WHERE gi.group_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND gi.inbound_id = i.id
);

-- ───── 3. Backfill group_members (All × every user) ─────
INSERT INTO "group_members" (group_id, user_id, created_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  u.id,
  NOW()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "group_members" gm
  WHERE gm.group_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND gm.user_id = u.id
);
