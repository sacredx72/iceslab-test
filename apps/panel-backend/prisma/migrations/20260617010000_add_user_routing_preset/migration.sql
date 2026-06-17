-- R3: per-user routing-preset override. Null = inherit (squad -> global ->
-- default). Highest precedence below the per-request ?routing= query.
ALTER TABLE "users" ADD COLUMN "routing_preset" VARCHAR(32);
