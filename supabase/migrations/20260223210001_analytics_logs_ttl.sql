-- S4: analytics_logs retention — prevent table explosion.
-- Index supports both TTL prune scan and dashboard range queries.

CREATE INDEX IF NOT EXISTS idx_analytics_logs_ttl
    ON analytics_logs(created_at);

CREATE OR REPLACE FUNCTION prune_analytics_logs()
RETURNS void AS $$
DELETE FROM analytics_logs
WHERE created_at < now() - interval '30 days';
$$ LANGUAGE sql;
