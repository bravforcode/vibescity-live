-- S2: Scale hardening indexes — remove table scans on hot query paths.

CREATE INDEX IF NOT EXISTS idx_orders_visitor_created
    ON orders(visitor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
    ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_venues_visibility
    ON venues(visibility_score DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_logs_created
    ON analytics_logs(created_at DESC);
