-- CreateTable
CREATE TABLE "amneziawg_peers" (
    "id" UUID NOT NULL,
    "inbound_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amneziawg_peers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amneziawg_peers_user_id_idx" ON "amneziawg_peers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "amneziawg_peers_inbound_id_ip_key" ON "amneziawg_peers"("inbound_id", "ip");

-- CreateIndex
CREATE UNIQUE INDEX "amneziawg_peers_inbound_id_user_id_key" ON "amneziawg_peers"("inbound_id", "user_id");

-- AddForeignKey
ALTER TABLE "amneziawg_peers" ADD CONSTRAINT "amneziawg_peers_inbound_id_fkey" FOREIGN KEY ("inbound_id") REFERENCES "inbounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amneziawg_peers" ADD CONSTRAINT "amneziawg_peers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
