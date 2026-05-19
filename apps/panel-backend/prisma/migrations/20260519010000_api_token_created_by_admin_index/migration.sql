-- Index the FK column for the ON DELETE SET NULL cascade.
-- Without an index, deleting an admin scans every row in api_tokens to
-- find which to NULL out. Today the table is tiny but the cost grows
-- with token volume, and the planner won't add the index for us.
CREATE INDEX IF NOT EXISTS "api_tokens_created_by_admin_id_idx"
  ON "api_tokens" ("created_by_admin_id");
