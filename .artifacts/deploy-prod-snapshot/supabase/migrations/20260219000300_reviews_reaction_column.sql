-- =============================================================================
-- PR3: Review System — Additive reaction column (Zero Data Loss)
-- Purpose:
--   Add reaction column to reviews while preserving existing rating data.
--   Old reviews keep their rating; new reviews use reaction emoji codes.
-- Safety: Additive only. No existing columns dropped.
-- Rollback: ALTER TABLE reviews DROP COLUMN IF EXISTS reaction;
--           DROP INDEX IF EXISTS reviews_reaction_idx;
-- =============================================================================

BEGIN;

-- ─── 1. Add reaction column ───────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'reviews'
        AND column_name  = 'reaction'
    ) THEN
      ALTER TABLE public.reviews
        ADD COLUMN reaction text
        CHECK (reaction IS NULL OR reaction IN (
          'heart', 'fire', 'clap', 'wow', 'laugh', 'sad'
        ));
    END IF;
  END IF;
END $$;

-- ─── 2. Backfill reaction from existing rating (compatibility mapping) ────────
DO $$ BEGIN
  IF to_regclass('public.reviews') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'rating'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'reaction'
  ) THEN
    UPDATE public.reviews
    SET reaction = CASE
      WHEN rating >= 5 THEN 'fire'
      WHEN rating >= 4 THEN 'heart'
      WHEN rating >= 3 THEN 'clap'
      WHEN rating >= 2 THEN 'wow'
      ELSE 'sad'
    END
    WHERE reaction IS NULL AND rating IS NOT NULL;
  END IF;
END $$;

-- ─── 3. Index for fast aggregation queries ────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.reviews') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename  = 'reviews'
        AND indexname  = 'reviews_reaction_idx'
    ) THEN
      CREATE INDEX reviews_reaction_idx ON public.reviews (reaction)
        WHERE reaction IS NOT NULL;
    END IF;
  END IF;
END $$;

COMMIT;
