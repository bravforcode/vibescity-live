-- =============================================================================
-- Update Sheet Sync Schedule to 30 Minutes
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    -- Unschedule old daily job
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'admin-sheet-sync-daily';

    -- Schedule new 30-minute job
    PERFORM cron.schedule(
      'admin-sheet-sync-30min',
      '*/30 * * * *',
      'SELECT public.run_admin_sheet_sync();'
    );
  ELSE
    RAISE NOTICE 'cron.job unavailable; schedule skipped';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sheet sync cron schedule update failed: %', SQLERRM;
END $$;

COMMIT;
