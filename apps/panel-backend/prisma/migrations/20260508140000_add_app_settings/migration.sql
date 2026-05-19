-- AppSetting: panel-wide key-value store (brand name, future flags).
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- Seed brandName so a fresh install lands on "Iceslab" rather than empty.
INSERT INTO "app_settings" ("key", "value", "is_public", "updated_at")
VALUES ('brandName', '"Iceslab"'::jsonb, true, NOW())
ON CONFLICT ("key") DO NOTHING;
