-- Slice 38 — heartbeat self-destruct.
-- Each node gets a private 32-byte secret. The bootstrap payload bundles
-- an HMAC over (nodeId, secret); the agent presents that token on every
-- heartbeat poll, panel verifies + checks deletedAt → 200 / 410.

-- pgcrypto provides gen_random_bytes — load it unconditionally so a fresh
-- Postgres container (which doesn't auto-load it) doesn't silently fall
-- into a `digest() does not exist` failure inside a DO-block. The prior
-- version of this migration used a `DO $$ IF EXISTS pg_extension` pattern
-- whose ELSE branch ALSO depended on pgcrypto via digest() — defeating
-- the purpose of the fallback. TROUBLESHOOTING.md cycle #5 documents the
-- exact failure mode. Unconditional CREATE EXTENSION is a no-op when the
-- extension is already loaded, so this is safe across all Postgres
-- versions / images.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add column nullable first so we can backfill, then enforce NOT NULL.
ALTER TABLE "nodes" ADD COLUMN "heartbeat_secret" BYTEA;

-- Backfill: every existing row gets a fresh random 32-byte secret.
UPDATE "nodes" SET "heartbeat_secret" = gen_random_bytes(32);

ALTER TABLE "nodes" ALTER COLUMN "heartbeat_secret" SET NOT NULL;
