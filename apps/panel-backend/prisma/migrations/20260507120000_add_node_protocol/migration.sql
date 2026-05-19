-- Add protocol column to nodes table.
-- Existing nodes default to 'xray' (most deployed protocol).
ALTER TABLE "nodes" ADD COLUMN "protocol" VARCHAR(32) NOT NULL DEFAULT 'xray';
