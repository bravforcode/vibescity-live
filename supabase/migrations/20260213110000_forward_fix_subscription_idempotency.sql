-- Purpose: Forward-fix subscription/notification policy and index idempotency.
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.subscriptions, public.notifications
-- Risks (tier): Medium
-- Rollback plan: Drop newly created indexes/policies by exact name if needed.

CREATE INDEX IF NOT EXISTS idx_subscriptions_venue_id
  ON public.subscriptions (venue_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id
  ON public.subscriptions (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_notifications_visitor_id
  ON public.notifications (visitor_id);

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
      AND policyname = 'View own subscriptions via VisitorID'
  ) THEN
    CREATE POLICY "View own subscriptions via VisitorID"
    ON public.subscriptions
    FOR SELECT
    USING (
      visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'View own notifications via VisitorID'
  ) THEN
    CREATE POLICY "View own notifications via VisitorID"
    ON public.notifications
    FOR SELECT
    USING (
      visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'Update own notifications via VisitorID'
  ) THEN
    CREATE POLICY "Update own notifications via VisitorID"
    ON public.notifications
    FOR UPDATE
    USING (
      visitor_id = current_setting('request.headers', true)::json->>'vibe_visitor_id'
    );
  END IF;
END $$;

