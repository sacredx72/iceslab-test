-- Slice 30: Hosts abstraction.
--
-- One ProfileNodeBinding can fan out into N hosts in subscriptions. The
-- subscription generator iterates bindings × hosts (post-this-migration);
-- to keep behaviour identical for existing data we backfill a single
-- "Default" host per binding. After backfill every binding has ≥1 host
-- and the generator's empty-binding fallback is unreachable.

CREATE TABLE "hosts" (
    "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
    "binding_id"            UUID         NOT NULL,
    "remark"                VARCHAR(64)  NOT NULL DEFAULT 'Default',
    "priority"              INTEGER      NOT NULL DEFAULT 0,
    "enabled"               BOOLEAN      NOT NULL DEFAULT TRUE,
    "address_override"      VARCHAR(253),
    "port_override"         INTEGER,
    "sni_override"          VARCHAR(253),
    "host_header_override"  VARCHAR(253),
    "path_override"         VARCHAR(253),
    "fingerprint_override"  VARCHAR(32),
    "alpn"                  TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "allow_insecure"        BOOLEAN      NOT NULL DEFAULT FALSE,
    "security_layer"        VARCHAR(16)  NOT NULL DEFAULT 'default',
    "disable_for_formats"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hosts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hosts_binding_id_priority_idx" ON "hosts"("binding_id", "priority");

ALTER TABLE "hosts"
    ADD CONSTRAINT "hosts_binding_id_fkey"
    FOREIGN KEY ("binding_id") REFERENCES "profile_node_bindings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one Default host per existing binding so the subscription
-- generator's per-host iteration produces the same URL set as before.
INSERT INTO "hosts" ("id", "binding_id", "remark", "priority", "enabled", "updated_at")
SELECT gen_random_uuid(), b."id", 'Default', 0, TRUE, NOW()
FROM "profile_node_bindings" b
WHERE NOT EXISTS (
    SELECT 1 FROM "hosts" h WHERE h."binding_id" = b."id"
);
