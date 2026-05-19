-- Slice 27 — Profiles + ProfileNodeBindings + GroupProfiles
--
-- Creates the new 3-table model that replaces the per-node `inbounds` table.
-- Backfills 1:1: every existing row in `inbounds` becomes one Profile + one
-- ProfileNodeBinding. Squad ACL rows in `group_inbounds` get mirrored into
-- `group_profiles` via the new profile UUIDs.
--
-- Old tables (`inbounds`, `group_inbounds`) STAY for now — they're dropped in
-- a follow-up migration once all backend/frontend callers are switched over.
-- During the transition the squad service keeps both join tables in sync.
--
-- Naming: every existing inbound becomes a profile named "<inbound.name>".
-- Collisions across nodes (same name on multiple nodes) are resolved with a
-- short-id suffix derived from the original inbound UUID. Admin can rename
-- and consolidate later from the Profiles UI.

-- ───── 1. profiles ─────
CREATE TABLE "profiles" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"        VARCHAR(64) NOT NULL,
  "protocol"    VARCHAR(32) NOT NULL,
  "description" TEXT,
  "config"      JSONB NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "profiles_name_key" UNIQUE ("name")
);
CREATE INDEX "profiles_protocol_idx" ON "profiles" ("protocol");

-- ───── 2. profile_node_bindings ─────
CREATE TABLE "profile_node_bindings" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_id"  UUID NOT NULL,
  "node_id"     UUID NOT NULL,
  "port"        INTEGER NOT NULL,
  "public_host" VARCHAR(253),
  "public_port" INTEGER,
  "overrides"   JSONB,
  "enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "profile_node_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "profile_node_bindings_node_id_port_key" UNIQUE ("node_id", "port"),
  CONSTRAINT "profile_node_bindings_profile_id_node_id_key" UNIQUE ("profile_id", "node_id"),
  CONSTRAINT "profile_node_bindings_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "profile_node_bindings_node_id_fkey"
    FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT
);
CREATE INDEX "profile_node_bindings_profile_id_idx" ON "profile_node_bindings" ("profile_id");
CREATE INDEX "profile_node_bindings_node_id_idx" ON "profile_node_bindings" ("node_id");

-- ───── 3. group_profiles ─────
CREATE TABLE "group_profiles" (
  "group_id"   UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "group_profiles_pkey" PRIMARY KEY ("group_id", "profile_id"),
  CONSTRAINT "group_profiles_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE,
  CONSTRAINT "group_profiles_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE
);
CREATE INDEX "group_profiles_profile_id_idx" ON "group_profiles" ("profile_id");

-- ───── 4. Backfill: inbounds → profiles + bindings ─────
--
-- We need to mint a stable profile UUID per existing inbound row and reuse
-- it both for the profiles INSERT and the bindings INSERT (and group_profiles
-- below). PostgreSQL's gen_random_uuid() inside an INSERT...SELECT would
-- generate fresh UUIDs we can't easily refer to from a follow-up statement.
--
-- Trick: keep the inbound UUID as the profile UUID. Names get suffixed with a
-- short fragment of the same UUID when they collide so the unique constraint
-- holds. The binding also gets a fresh UUID — minted inline.

INSERT INTO "profiles" (id, name, protocol, description, config, enabled, created_at, updated_at)
SELECT
  i.id,
  -- Resolve same-name collisions by appending the first 6 chars of the UUID.
  -- A row that's the only one with this name keeps its name unchanged.
  CASE
    WHEN COUNT(*) OVER (PARTITION BY i.name) > 1
      THEN i.name || '-' || SUBSTR(REPLACE(i.id::text, '-', ''), 1, 6)
    ELSE i.name
  END AS name,
  i.protocol,
  NULL AS description,
  i.config,
  i.enabled,
  i.created_at,
  i.updated_at
FROM "inbounds" i;

INSERT INTO "profile_node_bindings"
  (id, profile_id, node_id, port, public_host, public_port, overrides, enabled, created_at, updated_at)
SELECT
  gen_random_uuid(),
  i.id        AS profile_id,
  i.node_id,
  i.port,
  i.public_host,
  i.public_port,
  NULL        AS overrides,
  i.enabled,
  i.created_at,
  i.updated_at
FROM "inbounds" i;

-- ───── 5. Backfill: group_inbounds → group_profiles ─────
--
-- inbound.id == profile.id (we reused UUIDs above), so this is a direct copy.
-- ON CONFLICT DO NOTHING handles the case where multiple inbounds (across
-- nodes) somehow ended up referenced by the same group — after backfill they
-- all map to distinct profiles so no conflict, but the guard is cheap.

INSERT INTO "group_profiles" (group_id, profile_id, created_at)
SELECT
  gi.group_id,
  gi.inbound_id AS profile_id,
  gi.created_at
FROM "group_inbounds" gi
ON CONFLICT (group_id, profile_id) DO NOTHING;
