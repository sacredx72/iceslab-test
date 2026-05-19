-- Slice 27.5: regions + capacity + sticky-affinity.
--
-- All three additions are nullable / additive — existing rows keep
-- working unchanged. Smart node selection (slice 28) reads regionId
-- against GeoIP; subscription generator may use preferredNodeId to bias
-- URL ordering. maxUsers powers the per-node utilization bar.

CREATE TABLE "regions" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"       VARCHAR(64)  NOT NULL,
    "code"       VARCHAR(16)  NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

ALTER TABLE "nodes"
    ADD COLUMN "region_id" UUID,
    ADD COLUMN "max_users" INTEGER;

CREATE INDEX "nodes_region_id_idx" ON "nodes"("region_id");

ALTER TABLE "nodes"
    ADD CONSTRAINT "nodes_region_id_fkey"
    FOREIGN KEY ("region_id") REFERENCES "regions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users"
    ADD COLUMN "preferred_node_id" UUID;
