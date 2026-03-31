-- =============================================================================
-- Push Notification System — user_devices + notifications upgrade
-- Date: 2026-02-26
-- Purpose:
--   Create user_devices table for OneSignal token management
--   Upgrade existing notifications table with user_id, channel, metadata
--   Add RLS policies for both tables
--   Add cleanup function for 60-day retention of read notifications
-- Safety: All IF NOT EXISTS / DO $$ — safe to re-run
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. user_devices — OneSignal Push Token Registry
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_devices (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL,
  onesignal_subscription_id TEXT NOT NULL,
  platform                  TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  push_opt_in               BOOLEAN NOT NULL DEFAULT true,
  app_version               TEXT,
  locale                    TEXT DEFAULT 'th',
  last_seen_at              TIMESTAMPTZ DEFAULT now(),
  revoked_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one OneSignal subscription per device
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_user_devices_onesignal_sub'
  ) THEN
    ALTER TABLE public.user_devices
      ADD CONSTRAINT uq_user_devices_onesignal_sub UNIQUE (onesignal_subscription_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id
  ON public.user_devices (user_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_active
  ON public.user_devices (user_id, platform)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_devices_last_seen
  ON public.user_devices (last_seen_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 2. Upgrade notifications table
--    Legacy schema: id, venue_id, visitor_id, type, title, message, is_read, created_at
--    Adding: user_id, channel, action_url, metadata, expires_at
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Ensure the table exists (it was created in legacy migration)
  IF to_regclass('public.notifications') IS NULL THEN
    CREATE TABLE public.notifications (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_id    UUID,
      visitor_id  TEXT,
      type        TEXT NOT NULL,
      title       TEXT NOT NULL,
      message     TEXT NOT NULL,
      is_read     BOOLEAN DEFAULT false,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  -- Add user_id column (links to Supabase auth)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN user_id UUID;
  END IF;

  -- Add channel column (system, promo, moderation, social, payment)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN channel TEXT DEFAULT 'system';
  END IF;

  -- Add action_url column (deep link target)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'action_url'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN action_url TEXT;
  END IF;

  -- Add metadata column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  -- Add expires_at column (for auto-cleanup targeting)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- Indexes for upgraded notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_cleanup
  ON public.notifications (created_at)
  WHERE is_read = true;

CREATE INDEX IF NOT EXISTS idx_notifications_channel
  ON public.notifications (channel, created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 3. RLS Policies
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- user_devices: Users see/manage only their own devices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users select own devices'
  ) THEN
    CREATE POLICY "Users select own devices"
      ON public.user_devices FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users insert own devices'
  ) THEN
    CREATE POLICY "Users insert own devices"
      ON public.user_devices FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users update own devices'
  ) THEN
    CREATE POLICY "Users update own devices"
      ON public.user_devices FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_devices' AND policyname = 'Users delete own devices'
  ) THEN
    CREATE POLICY "Users delete own devices"
      ON public.user_devices FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- notifications: ensure user_id-based policies exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users select own notifications by user_id'
  ) THEN
    CREATE POLICY "Users select own notifications by user_id"
      ON public.notifications FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Users update own notifications by user_id'
  ) THEN
    CREATE POLICY "Users update own notifications by user_id"
      ON public.notifications FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 4. Cleanup Function — 60-day retention for read notifications
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notifications
  WHERE is_read = true
    AND created_at < now() - INTERVAL '60 days';
$$;

-- Grant execute to service_role (for pg_cron or Edge Function)
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 5. Autovacuum tuning for notifications & user_devices
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.notifications SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
ALTER TABLE public.user_devices SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ANALYZE public.notifications;

COMMIT;
