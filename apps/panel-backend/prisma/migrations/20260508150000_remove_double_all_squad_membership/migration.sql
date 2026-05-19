-- Cleanup historical bug: UserFormModal force-injected ALL_SQUAD_ID into
-- every submit, so users picked into [Basic] actually landed in [All, Basic].
-- That doubled per-protocol counters in the dashboard ("1 пользователь" in
-- every protocol even when only Basic had xray).
--
-- Fix: remove ALL membership from any user who has at least one OTHER
-- squad. ALL stays only as fallback for users with zero explicit squads.
-- Idempotent — re-running on a clean DB is a no-op.

DELETE FROM "group_members"
WHERE "group_id" = '00000000-0000-0000-0000-000000000001'
  AND "user_id" IN (
    SELECT "user_id"
    FROM "group_members"
    WHERE "group_id" != '00000000-0000-0000-0000-000000000001'
    GROUP BY "user_id"
  );
