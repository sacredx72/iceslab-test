-- #14 - persist the time-step of the last accepted TOTP code per admin so a
-- captured code cannot be replayed within its ~90s validity window
-- (RFC 6238 section 5.2). Login rejects any code whose step is <= this value.
ALTER TABLE "admin_users" ADD COLUMN "totp_last_used_step" INTEGER;
