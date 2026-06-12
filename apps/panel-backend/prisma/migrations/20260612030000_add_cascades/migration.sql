-- Section C (cascades): multi-hop chains entry -> [transit...] -> exit.
-- C1 data model; config generation (C2) + node-agent chaining (C3) build on it.

CREATE TABLE "cascades" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cascades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cascades_name_key" ON "cascades"("name");

CREATE TABLE "cascade_hops" (
    "id" UUID NOT NULL,
    "cascade_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "entry_protocol" VARCHAR(32),
    "link_protocol" VARCHAR(32),
    "link_config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cascade_hops_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cascade_hops_cascade_id_position_key" ON "cascade_hops"("cascade_id", "position");
CREATE INDEX "cascade_hops_node_id_idx" ON "cascade_hops"("node_id");

ALTER TABLE "cascade_hops" ADD CONSTRAINT "cascade_hops_cascade_id_fkey" FOREIGN KEY ("cascade_id") REFERENCES "cascades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cascade_hops" ADD CONSTRAINT "cascade_hops_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
