-- CreateTable
CREATE TABLE "subscription_response_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "ua_pattern" TEXT NOT NULL,
    "format" VARCHAR(16) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_response_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_response_rules_name_key" ON "subscription_response_rules"("name");

-- CreateIndex
CREATE INDEX "subscription_response_rules_priority_idx" ON "subscription_response_rules"("priority");

-- Seed default rules. Priorities are spaced by 10 so admins can drop new
-- rules between two existing ones without rewriting the whole list.
-- ON CONFLICT DO NOTHING makes the seed idempotent for re-applies.
INSERT INTO "subscription_response_rules" ("id", "name", "ua_pattern", "format", "priority", "updated_at") VALUES
  (gen_random_uuid(), 'Hiddify',         'Hiddify',                          'singbox',   10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NekoBox/NekoRay', 'NekoBox|NekoRay',                  'singbox',   20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'sing-box',        'sing-box|SFI|SFA|SFM|SFT',         'singbox',   30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Clash',           'Clash|ClashX|FlClash|stash|mihomo','clash',     40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'v2rayN',          'v2rayN|v2rayNG',                   'xrayjson',  50, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'AmneziaWG-app',   '(?i)amneziavpn|amneziawg|wireguard','wgconf',  60, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Default',         '.*',                               'plain',    900, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
