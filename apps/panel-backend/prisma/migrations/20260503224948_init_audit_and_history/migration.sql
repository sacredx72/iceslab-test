-- CreateTable
CREATE TABLE "subscription_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(32) NOT NULL,
    "performed_by_admin_id" UUID,
    "traffic_limit_before" BIGINT,
    "traffic_limit_after" BIGINT,
    "traffic_used_before" BIGINT,
    "traffic_used_after" BIGINT,
    "expire_at_before" TIMESTAMPTZ(6),
    "expire_at_after" TIMESTAMPTZ(6),
    "status_before" VARCHAR(16),
    "status_after" VARCHAR(16),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_request_history" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "request_ip" VARCHAR(45),
    "user_agent" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_request_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_user_usage_history" (
    "node_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "bytes_in" BIGINT NOT NULL DEFAULT 0,
    "bytes_out" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "node_user_usage_history_pkey" PRIMARY KEY ("node_id","date","user_id")
);

-- CreateTable
CREATE TABLE "node_usage_history" (
    "node_id" UUID NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "download_bytes" BIGINT NOT NULL DEFAULT 0,
    "upload_bytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "node_usage_history_pkey" PRIMARY KEY ("node_id","hour")
);

-- CreateIndex
CREATE INDEX "subscription_events_user_id_created_at_idx" ON "subscription_events"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_events_event_type_idx" ON "subscription_events"("event_type");

-- CreateIndex
CREATE INDEX "subscription_request_history_user_id_requested_at_idx" ON "subscription_request_history"("user_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "node_user_usage_history_user_id_date_idx" ON "node_user_usage_history"("user_id", "date" DESC);

-- CreateIndex
CREATE INDEX "node_usage_history_node_id_hour_idx" ON "node_usage_history"("node_id", "hour" DESC);

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_performed_by_admin_id_fkey" FOREIGN KEY ("performed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_request_history" ADD CONSTRAINT "subscription_request_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_user_usage_history" ADD CONSTRAINT "node_user_usage_history_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_user_usage_history" ADD CONSTRAINT "node_user_usage_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_usage_history" ADD CONSTRAINT "node_usage_history_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
