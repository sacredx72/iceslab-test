-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "short_id" VARCHAR(16) NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "expire_at" TIMESTAMPTZ(6),
    "traffic_limit_bytes" BIGINT,
    "traffic_limit_strategy" VARCHAR(16) NOT NULL DEFAULT 'no_reset',
    "subscription_token" VARCHAR(64) NOT NULL,
    "sub_revoked_at" TIMESTAMPTZ(6),
    "hysteria_password" VARCHAR(64) NOT NULL,
    "amneziawg_private_key" VARCHAR(64) NOT NULL,
    "amneziawg_public_key" VARCHAR(64) NOT NULL,
    "naive_password" VARCHAR(64) NOT NULL,
    "xray_uuid" UUID NOT NULL,
    "hwid_device_limit" INTEGER,
    "description" TEXT,
    "tag" VARCHAR(64),
    "telegram_id" BIGINT,
    "email" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_traffic" (
    "user_id" UUID NOT NULL,
    "used_traffic_bytes" BIGINT NOT NULL DEFAULT 0,
    "lifetime_traffic_bytes" BIGINT NOT NULL DEFAULT 0,
    "online_at" TIMESTAMPTZ(6),
    "first_connected_at" TIMESTAMPTZ(6),
    "last_connected_node_id" UUID,
    "last_traffic_reset_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_traffic_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_short_id_key" ON "users"("short_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_subscription_token_key" ON "users"("subscription_token");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_expire_at_idx" ON "users"("expire_at");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "users_telegram_id_idx" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_traffic_last_connected_node_id_idx" ON "user_traffic"("last_connected_node_id");

-- CreateIndex
CREATE INDEX "user_traffic_online_at_idx" ON "user_traffic"("online_at");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- AddForeignKey
ALTER TABLE "user_traffic" ADD CONSTRAINT "user_traffic_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_traffic" ADD CONSTRAINT "user_traffic_last_connected_node_id_fkey" FOREIGN KEY ("last_connected_node_id") REFERENCES "nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
