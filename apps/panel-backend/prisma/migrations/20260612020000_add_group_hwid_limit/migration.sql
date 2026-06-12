-- K7: per-squad HWID device-limit default. Applied only when the user has no
-- explicit hwidDeviceLimit; the effective default is the MAX across the user's
-- squads (most-permissive cohort wins). Null = no squad default.
ALTER TABLE "groups" ADD COLUMN "hwid_device_limit" INTEGER;
