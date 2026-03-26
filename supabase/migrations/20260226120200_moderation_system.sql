-- =============================================================================
-- Moderation System — reports + moderation_logs + user_blocks + auto-trigger
-- Date: 2026-02-26
-- Purpose:
--   Create reports table (polymorphic: venue/review/photo/post/user)
--   Create moderation_logs audit trail
--   Create user_blocks for social blocking
--   Create auto-moderation trigger (5→soft_hide, 10/violence→block)
--   Add RLS policies and retention cleanup function
-- Safety: All IF NOT EXISTS / DO $$ — safe to re-run
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. reports — User-Submitted Content Reports
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('venue','review','photo','post','user')),
  entity_id       UUID NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN (
                    'spam','offensive','misleading','inappropriate','violence','other'
                  )),
  details         TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','reviewed','dismissed','actioned')),
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: 1 user can report the same entity only once
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_reports_user_entity'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT uq_reports_user_entity
      UNIQUE (reporter_id, entity_type, entity_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_entity
  ON public.reports (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_reports_open
  ON public.reports (entity_type, entity_id, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_reports_reporter
  ON public.reports (reporter_id);


-- ─────────────────────────────────────────────────────────────
-- 2. moderation_logs — Full Audit Trail
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN (
                    'auto_soft_hide','auto_block',
                    'manual_approve','manual_reject','manual_restore','escalate'
                  )),
  performed_by    TEXT NOT NULL DEFAULT 'system',
  reason          TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_moderation_logs_entity
  ON public.moderation_logs (entity_type, entity_id);

-- BRIN for time-range archival queries (append-only table)
DO $$
BEGIN
  IF to_regclass('public.moderation_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS brin_moderation_logs_created
             ON public.moderation_logs USING BRIN (created_at)';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 3. user_blocks — Social Blocking
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id      UUID NOT NULL,
  blocked_id      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Check constraint: cannot block yourself
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_user_blocks_no_self'
  ) THEN
    ALTER TABLE public.user_blocks
      ADD CONSTRAINT chk_user_blocks_no_self
      CHECK (blocker_id <> blocked_id);
  END IF;
END $$;

-- Reverse lookup: "who has blocked me?"
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON public.user_blocks (blocked_id);


-- ─────────────────────────────────────────────────────────────
-- 4. Auto-Moderation Trigger
--    >= 5 unique reporters → auto_soft_hide
--    >= 10 unique reporters OR reason='violence' → auto_block
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_auto_moderate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_count INTEGER;
  v_has_violence BOOLEAN;
  v_action TEXT;
  v_new_status TEXT;
BEGIN
  -- Count unique reporters for this entity
  SELECT COUNT(DISTINCT reporter_id)
  INTO v_report_count
  FROM public.reports
  WHERE entity_type = NEW.entity_type
    AND entity_id   = NEW.entity_id;

  -- Check if any report has reason = 'violence'
  SELECT EXISTS (
    SELECT 1 FROM public.reports
    WHERE entity_type = NEW.entity_type
      AND entity_id   = NEW.entity_id
      AND reason       = 'violence'
  ) INTO v_has_violence;

  -- Determine action
  IF v_report_count >= 10 OR v_has_violence THEN
    v_action     := 'auto_block';
    v_new_status := 'blocked';
  ELSIF v_report_count >= 5 THEN
    v_action     := 'auto_soft_hide';
    v_new_status := 'hidden';
  ELSE
    -- Not enough reports to take action yet
    RETURN NEW;
  END IF;

  -- Update the entity's status based on entity_type
  CASE NEW.entity_type
    WHEN 'venue' THEN
      UPDATE public.venues SET status = v_new_status::venue_status
      WHERE id = NEW.entity_id
        AND status NOT IN ('blocked', 'hidden');
    WHEN 'review' THEN
      UPDATE public.reviews SET status = v_new_status
      WHERE id = NEW.entity_id
        AND status NOT IN ('blocked', 'hidden');
    WHEN 'photo' THEN
      UPDATE public.venue_photos SET status = v_new_status
      WHERE id = NEW.entity_id
        AND status NOT IN ('blocked', 'hidden');
    ELSE
      -- For 'post', 'user' — log only, no direct table update
      NULL;
  END CASE;

  -- Log the moderation action
  INSERT INTO public.moderation_logs (entity_type, entity_id, action, reason, metadata)
  VALUES (
    NEW.entity_type,
    NEW.entity_id,
    v_action,
    'Auto-moderation: ' || v_report_count || ' unique reports',
    jsonb_build_object(
      'report_count', v_report_count,
      'has_violence', v_has_violence,
      'trigger_report_id', NEW.id
    )
  );

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trg_auto_moderate ON public.reports;
CREATE TRIGGER trg_auto_moderate
  AFTER INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_moderate();


-- ─────────────────────────────────────────────────────────────
-- 5. RLS Policies
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- reports: Users can INSERT (submit reports) and SELECT their own
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'Users can submit reports'
  ) THEN
    CREATE POLICY "Users can submit reports"
      ON public.reports FOR INSERT
      WITH CHECK (auth.uid() = reporter_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'Users can view own reports'
  ) THEN
    CREATE POLICY "Users can view own reports"
      ON public.reports FOR SELECT
      USING (auth.uid() = reporter_id);
  END IF;
END $$;

-- moderation_logs: Only service_role can read (admin dashboard)
-- No user-facing policy needed; RLS blocks all by default

-- user_blocks: Users manage their own blocks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_blocks' AND policyname = 'Users select own blocks'
  ) THEN
    CREATE POLICY "Users select own blocks"
      ON public.user_blocks FOR SELECT
      USING (auth.uid() = blocker_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_blocks' AND policyname = 'Users insert own blocks'
  ) THEN
    CREATE POLICY "Users insert own blocks"
      ON public.user_blocks FOR INSERT
      WITH CHECK (auth.uid() = blocker_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_blocks' AND policyname = 'Users delete own blocks'
  ) THEN
    CREATE POLICY "Users delete own blocks"
      ON public.user_blocks FOR DELETE
      USING (auth.uid() = blocker_id);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 6. Data Retention Cleanup Function
--    Reports: dismissed/actioned older than 180 days
--    Moderation logs: older than 365 days
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_old_moderation_data()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.reports
  WHERE status IN ('dismissed','actioned')
    AND created_at < now() - INTERVAL '180 days';

  DELETE FROM public.moderation_logs
  WHERE created_at < now() - INTERVAL '365 days';
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_moderation_data() TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 7. Autovacuum Tuning
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.reports SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE public.moderation_logs SET (
  autovacuum_vacuum_scale_factor = 0.03,
  autovacuum_analyze_scale_factor = 0.01
);

COMMIT;
