-- Slice 27 follow-up: AmneziawgPeer.inboundId → AmneziawgPeer.profileId
--
-- AmneziaWG peer rows have always been "(inboundId, userId) → IP allocation".
-- After the profiles refactor the deployment unit is the profile (one
-- AmneziaWG profile reused across nodes via bindings still uses one logical
-- identity per user — same private key, same IP). Pivoting the peer FK to
-- profiles keeps the model coherent.
--
-- The trick: in the previous migration we reused inbound.id as the new
-- profile.id, so peer.inbound_id values are already valid profile UUIDs.
-- We just rename the column and re-target the FK.

-- Drop the constraints and indexes that depend on the old column name
ALTER TABLE "amneziawg_peers" DROP CONSTRAINT IF EXISTS "amneziawg_peers_inbound_id_fkey";
ALTER TABLE "amneziawg_peers" DROP CONSTRAINT IF EXISTS "amneziawg_peers_inbound_id_ip_key";
ALTER TABLE "amneziawg_peers" DROP CONSTRAINT IF EXISTS "amneziawg_peers_inbound_id_user_id_key";

-- Rename the column
ALTER TABLE "amneziawg_peers" RENAME COLUMN "inbound_id" TO "profile_id";

-- Re-add unique constraints with the new column name
ALTER TABLE "amneziawg_peers"
  ADD CONSTRAINT "amneziawg_peers_profile_id_ip_key" UNIQUE ("profile_id", "ip");
ALTER TABLE "amneziawg_peers"
  ADD CONSTRAINT "amneziawg_peers_profile_id_user_id_key" UNIQUE ("profile_id", "user_id");

-- Re-target the FK at profiles. Values already match (inbound.id was reused
-- as profile.id in the backfill).
ALTER TABLE "amneziawg_peers"
  ADD CONSTRAINT "amneziawg_peers_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE;
