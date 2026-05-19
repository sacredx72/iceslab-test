-- Slice S2: HWID enforcement.
--
-- Tracks (user, hwid) pairs hit on /sub/:token. The header is opt-in
-- (only Hiddify/Streisand/Happ/V2RayNG style clients send `x-hwid`),
-- so this table grows lazily — admins who don't enforce limits never
-- see rows.

CREATE TABLE "hwid_user_devices" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"        UUID         NOT NULL,
    "hwid"           VARCHAR(255) NOT NULL,
    "first_seen_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label"          VARCHAR(64),

    CONSTRAINT "hwid_user_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hwid_user_devices_user_id_hwid_key"
    ON "hwid_user_devices"("user_id", "hwid");

CREATE INDEX "hwid_user_devices_user_id_idx"
    ON "hwid_user_devices"("user_id");

ALTER TABLE "hwid_user_devices"
    ADD CONSTRAINT "hwid_user_devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
