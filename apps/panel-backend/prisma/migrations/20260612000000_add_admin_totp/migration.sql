-- K8: admin 2FA (TOTP). `totp_secret` holds the base32 secret (set at setup,
-- before confirmation); `totp_enabled` flips true only after a valid code is
-- confirmed, and login enforces a code only when it is true.
ALTER TABLE "admin_users" ADD COLUMN "totp_secret" VARCHAR(64);
ALTER TABLE "admin_users" ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false;
