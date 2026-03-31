-- Migration: Setup Geodata Refresh Cron
-- Description: Schedule the refresh_venue_geodata function to run every 15 minutes using pg_cron.

BEGIN;

-- 1. Ensure pg_cron extension is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule the refresh job
-- Cron syntax: '*/15 * * * *' (Every 15 minutes)
-- We use 'vibecity-refresh-geodata' as the job name for easy identification
SELECT cron.schedule(
    'vibecity-refresh-geodata',
    '*/15 * * * *',
    'SELECT public.refresh_venue_geodata();'
);

-- 3. Grant permissions if needed (usually handled by SECURITY DEFINER on the function)
-- But we ensure the cron schema can see it
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON FUNCTION public.refresh_venue_geodata() TO postgres;

COMMIT;
