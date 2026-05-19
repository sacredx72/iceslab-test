-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "public_key" BYTEA,
    "country_code" CHAR(2),
    "status" VARCHAR(16) NOT NULL DEFAULT 'unknown',
    "last_status_change" TIMESTAMPTZ(6),
    "last_status_message" TEXT,
    "consumption_multiplier" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbounds" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "protocol" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "port" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inbounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nodes_name_key" ON "nodes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "nodes_address_key" ON "nodes"("address");

-- CreateIndex
CREATE INDEX "nodes_status_idx" ON "nodes"("status");

-- CreateIndex
CREATE INDEX "nodes_deleted_at_idx" ON "nodes"("deleted_at");

-- CreateIndex
CREATE INDEX "inbounds_node_id_idx" ON "inbounds"("node_id");

-- CreateIndex
CREATE INDEX "inbounds_protocol_idx" ON "inbounds"("protocol");

-- CreateIndex
CREATE UNIQUE INDEX "inbounds_node_id_port_key" ON "inbounds"("node_id", "port");

-- AddForeignKey
ALTER TABLE "inbounds" ADD CONSTRAINT "inbounds_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
