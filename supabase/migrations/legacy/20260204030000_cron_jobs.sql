-- Enable pg_cron if available (requires postgres role usually, might fail on some setups)
-- If this fails, user must enable 'pg_cron' in Dashboard > Database > Extensions

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Schedule Entitlement Expiry (Every hour)
SELECT cron.schedule(
    'expire_entitlements_job',
    '0 * * * *', -- Every hour
    $$SELECT public.expire_entitlements()$$
);

-- Schedule Analytics Rollup (Daily) - Placeholder for future
-- SELECT cron.schedule(
--    'analytics_rollup_job',
--    '0 0 * * *',
--    $$SELECT public.rollup_analytics()$$
-- );
