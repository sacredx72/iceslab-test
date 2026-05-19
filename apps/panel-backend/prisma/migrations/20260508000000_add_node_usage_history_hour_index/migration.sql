-- Dashboard's trafficMetrics() does sumNodeUsageSince() with `WHERE hour >= $since`
-- (no nodeId predicate). The composite primary key (nodeId, hour) and the
-- existing (nodeId, hour DESC) index don't help that scan — both are leftmost
-- on nodeId. Add a standalone index on hour so once the table grows past a
-- few hundred thousand rows the dashboard query stays an index range scan
-- instead of a seq scan.
CREATE INDEX IF NOT EXISTS "node_usage_history_hour_idx"
  ON "node_usage_history" ("hour" DESC);
