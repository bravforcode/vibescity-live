-- Migration: schedule EasySlip healthcheck (pg_cron + pg_net)
-- Date: 2026-02-05

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_easyslip_healthcheck() RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_headers JSONB := '{}'::jsonb;
BEGIN
    v_url := current_setting('app.ehc_url', true);
    v_secret := current_setting('app.ehc_secret', true);

    IF v_url IS NULL OR v_url = '' THEN
        RAISE NOTICE 'Healthcheck URL not configured (app.ehc_url)';
        RETURN;
    END IF;

    IF v_secret IS NOT NULL AND v_secret <> '' THEN
        v_headers := jsonb_build_object('x-healthcheck-secret', v_secret);
    END IF;

    PERFORM net.http_post(
        url := v_url,
        headers := v_headers,
        body := '{}'::jsonb
    );
END;
$$;

-- Run every 15 minutes
SELECT cron.schedule(
    'easyslip_healthcheck_job',
    '*/15 * * * *',
    $$SELECT public.run_easyslip_healthcheck()$$
);
