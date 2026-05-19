-- Add an FK from api_tokens to the admin who issued the token. Without
-- this, the auth hook had to invent a fake "admin id" by reusing the
-- token's own PK, which (a) made /api/auth/me 404 for token-authed
-- callers, and (b) would FK-fail any future audit column that tries to
-- attribute actions to an admin.
--
-- Column is nullable: existing rows backfill to NULL. Legacy tokens stay
-- valid for "is the caller authorized" checks but produce request.admin=
-- undefined, so they can't be attributed to a person until the operator
-- rotates them.
ALTER TABLE "api_tokens"
ADD COLUMN "created_by_admin_id" UUID;

ALTER TABLE "api_tokens"
ADD CONSTRAINT "api_tokens_created_by_admin_id_fkey"
FOREIGN KEY ("created_by_admin_id")
REFERENCES "admin_users" ("id")
ON DELETE SET NULL;
