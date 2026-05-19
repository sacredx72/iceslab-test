-- Replace the regular UNIQUE constraints on `nodes.name` / `nodes.address`
-- with **partial** unique indexes that only enforce uniqueness across
-- ACTIVE rows (`deleted_at IS NULL`).
--
-- Without this, soft-deleting a node leaves the row in place and its
-- name/address are still bound by the constraint — admins can't recreate
-- a node with the same name/address until the row is purged manually.
-- That's both confusing and a real footgun: hit it the first time we
-- tried to recreate `se-xray-01` after a delete, and the request bounced
-- with a P2002 → 500 from the panel.
--
-- Postgres's partial UNIQUE INDEX is the right tool: it ignores tombstoned
-- rows entirely, so `INSERT (name, address) VALUES ('se-xray-01', ...)`
-- succeeds whenever no ACTIVE row holds those values.
--
-- The corresponding `@unique` annotations were removed from
-- `prisma/schema.prisma` for nodes.name + nodes.address — Prisma 7 doesn't
-- model partial unique indexes natively, so the schema-side guarantee is
-- enforced at the application layer (nodes.service.ts findActiveBy* + a
-- P2002 catch around `repo.create`).

-- DropConstraint
ALTER TABLE "nodes" DROP CONSTRAINT IF EXISTS "nodes_name_key";
ALTER TABLE "nodes" DROP CONSTRAINT IF EXISTS "nodes_address_key";

-- DropIndex (constraints sometimes ship under a separate index name)
DROP INDEX IF EXISTS "nodes_name_key";
DROP INDEX IF EXISTS "nodes_address_key";

-- CreateIndex (partial unique — only active rows)
CREATE UNIQUE INDEX "nodes_name_active_key"    ON "nodes"("name")    WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "nodes_address_active_key" ON "nodes"("address") WHERE "deleted_at" IS NULL;
