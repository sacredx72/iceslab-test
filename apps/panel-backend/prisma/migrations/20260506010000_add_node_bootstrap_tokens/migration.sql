-- One-time tokens the node-installer redeems for its mTLS payload at
-- install time. The payload itself is generated fresh on redeem
-- (`issueNodeCert` against the panel's CA) and never stored here — the
-- token is purely a short identifier that survives the 4096-byte Linux
-- TTY paste limit so admins can copy a single-line install command
-- without losing the tail.

-- CreateTable
CREATE TABLE "node_bootstrap_tokens" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_bootstrap_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "node_bootstrap_tokens_token_key" ON "node_bootstrap_tokens"("token");

-- CreateIndex
CREATE INDEX "node_bootstrap_tokens_node_id_idx" ON "node_bootstrap_tokens"("node_id");

-- CreateIndex
CREATE INDEX "node_bootstrap_tokens_expires_at_idx" ON "node_bootstrap_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "node_bootstrap_tokens" ADD CONSTRAINT "node_bootstrap_tokens_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
