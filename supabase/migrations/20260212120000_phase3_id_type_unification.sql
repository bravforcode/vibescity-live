-- =============================================================================
-- PHASE 3: ID Type Unification & Foreign Key Enforcement
-- =============================================================================
-- Purpose: Convert text-based user_ids to proper UUID types, add missing FKs,
--          and add indexes for text-based venue_ref columns.
-- Safety:  Fully idempotent. Uses defensive DO blocks with type checks.
-- Rollback: See bottom of file.
-- =============================================================================

BEGIN;

-- ─── 3a) user_home_locations.user_id: text → uuid ────────────────────────────

DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_home_locations'
    AND column_name = 'user_id';

  -- Table might not exist
  IF v_type IS NULL THEN
    RAISE NOTICE 'user_home_locations.user_id not found — skipping';
    RETURN;
  END IF;

  IF v_type <> 'uuid' THEN
    RAISE NOTICE 'Converting user_home_locations.user_id from % to UUID', v_type;

    -- Drop any existing FK first
    IF to_regclass('public.user_home_locations') IS NOT NULL THEN
      DECLARE
        v_con RECORD;
      BEGIN
        FOR v_con IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = to_regclass('public.user_home_locations') AND contype = 'f'
        LOOP
          EXECUTE format('ALTER TABLE public.user_home_locations DROP CONSTRAINT %I', v_con.conname);
        END LOOP;
      END;
    END IF;

    -- Delete rows with non-UUID user_ids
    DELETE FROM public.user_home_locations
    WHERE user_id IS NOT NULL
      AND NOT (user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

    ALTER TABLE public.user_home_locations
      ALTER COLUMN user_id TYPE uuid
      USING user_id::text::uuid;
  END IF;
END $$;

-- Add FK if missing
DO $$
BEGIN
  IF to_regclass('public.user_home_locations') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_home_locations_user_id_fkey'
      AND conrelid = to_regclass('public.user_home_locations')
  ) THEN
    ALTER TABLE public.user_home_locations
      ADD CONSTRAINT user_home_locations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added FK user_home_locations → auth.users';
  END IF;
END $$;

-- ─── 3b) emergency_locations.user_id: fix type if text ──────────────────────

DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'emergency_locations'
    AND column_name = 'user_id';

  IF v_type IS NULL THEN
    RAISE NOTICE 'emergency_locations.user_id not found — skipping';
    RETURN;
  END IF;

  IF v_type <> 'uuid' THEN
    RAISE NOTICE 'Converting emergency_locations.user_id from % to UUID', v_type;

    DELETE FROM public.emergency_locations
    WHERE user_id IS NOT NULL
      AND NOT (user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

    ALTER TABLE public.emergency_locations
      ALTER COLUMN user_id TYPE uuid
      USING CASE
        WHEN user_id IS NULL THEN NULL
        WHEN user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN user_id::text::uuid
        ELSE NULL
      END;
  END IF;
END $$;

-- ─── 3c) Analytics indexes for venue_ref text lookups ────────────────────────

DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    EXECUTE $SQL$
      CREATE INDEX IF NOT EXISTS idx_analytics_events_venue_ref
        ON public.analytics_events (venue_ref)
        WHERE venue_ref IS NOT NULL
    $SQL$;
  ELSE
    RAISE NOTICE 'analytics_events not found — skipping idx_analytics_events_venue_ref';
  END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_map_pins_zoom_cache_venue_ref
  ON public.map_pins_zoom_cache (venue_ref)
  WHERE venue_ref IS NOT NULL;

-- ─── 3d) Document soft FK relationships ──────────────────────────────────────

COMMENT ON COLUMN public.analytics_events_p.venue_ref IS
  'Text ref to venues.id::text. Not a hard FK — allows batch inserts from edge functions without FK check overhead.';

COMMENT ON COLUMN public.map_pins_zoom_cache.venue_ref IS
  'Text ref to venues.id::text. Denormalized for cache query performance. Refreshed by cron.';

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN:
-- =============================================================================
-- DROP INDEX IF EXISTS idx_analytics_events_p_venue_ref;
-- DROP INDEX IF EXISTS idx_map_pins_zoom_cache_venue_ref;
-- ALTER TABLE public.user_home_locations DROP CONSTRAINT IF EXISTS user_home_locations_user_id_fkey;
-- Note: UUID→text reversal is destructive and not recommended.
