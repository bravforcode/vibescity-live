-- =============================================================================
-- Staging Compatibility (Minimal, Idempotent)
-- Purpose:
--   - Add only runtime-critical legacy objects when missing
--   - Keep compatibility for mixed staging/prod states without contract collisions
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.buildings (
  id TEXT PRIMARY KEY,
  name TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  latitude NUMERIC,
  longitude NUMERIC,
  province VARCHAR,
  is_giant_active BOOLEAN DEFAULT TRUE,
  icon TEXT,
  short_name VARCHAR,
  floors JSONB
);

ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS province VARCHAR;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS is_giant_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS short_name VARCHAR;
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS floors JSONB;

CREATE INDEX IF NOT EXISTS idx_buildings_province ON public.buildings (province);

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'buildings'
      AND policyname = 'buildings_select_public'
  ) THEN
    CREATE POLICY buildings_select_public
    ON public.buildings
    FOR SELECT
    USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'buildings'
      AND policyname = 'buildings_service_write'
  ) THEN
    CREATE POLICY buildings_service_write
    ON public.buildings
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;
ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.stripe_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_stripe_webhook_events_event_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.stripe_webhook_events
      WHERE stripe_event_id IS NOT NULL
      GROUP BY stripe_event_id
      HAVING COUNT(*) > 1
    ) THEN
      CREATE INDEX idx_stripe_webhook_events_event_id
        ON public.stripe_webhook_events (stripe_event_id);
    ELSE
      CREATE UNIQUE INDEX idx_stripe_webhook_events_event_id
        ON public.stripe_webhook_events (stripe_event_id);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
  ON public.stripe_webhook_events (received_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages events" ON public.stripe_webhook_events;
DROP POLICY IF EXISTS stripe_webhook_events_service_all ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_service_all
ON public.stripe_webhook_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.entitlements_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  venue_id UUID,
  feature TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS venue_id UUID;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS feature TEXT;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.entitlements_ledger ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'entitlements_ledger_order_id_fkey'
         AND conrelid = 'public.entitlements_ledger'::regclass
     ) THEN
    ALTER TABLE public.entitlements_ledger
      ADD CONSTRAINT entitlements_ledger_order_id_fkey
      FOREIGN KEY (order_id)
      REFERENCES public.orders(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.venues') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'entitlements_ledger_venue_id_fkey'
         AND conrelid = 'public.entitlements_ledger'::regclass
     ) THEN
    ALTER TABLE public.entitlements_ledger
      ADD CONSTRAINT entitlements_ledger_venue_id_fkey
      FOREIGN KEY (venue_id)
      REFERENCES public.venues(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_entitlements_ledger_order_id
  ON public.entitlements_ledger (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entitlements_ledger_venue_id
  ON public.entitlements_ledger (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entitlements_ledger_order_feature
  ON public.entitlements_ledger (order_id, feature, created_at DESC);

ALTER TABLE public.entitlements_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlements_ledger_select_own_or_service ON public.entitlements_ledger;
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    CREATE POLICY entitlements_ledger_select_own_or_service
    ON public.entitlements_ledger
    FOR SELECT
    USING (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = entitlements_ledger.order_id
          AND o.user_id = auth.uid()
      )
    );
  ELSE
    CREATE POLICY entitlements_ledger_select_own_or_service
    ON public.entitlements_ledger
    FOR SELECT
    USING (auth.role() = 'service_role');
  END IF;
END $$;

DROP POLICY IF EXISTS entitlements_ledger_service_write ON public.entitlements_ledger;
CREATE POLICY entitlements_ledger_service_write
ON public.entitlements_ledger
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.apply_entitlement(
  p_user_id UUID,
  p_venue_id UUID,
  p_order_id UUID,
  p_feature TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature TEXT := LOWER(COALESCE(TRIM(p_feature), ''));
  v_start_at TIMESTAMPTZ := COALESCE(p_starts_at, now());
  v_ledger_id UUID;
BEGIN
  IF v_feature = '' THEN
    RAISE EXCEPTION 'apply_entitlement: p_feature is required';
  END IF;

  IF to_regclass('public.entitlements_ledger') IS NULL THEN
    RAISE EXCEPTION 'apply_entitlement: entitlements_ledger table is missing';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT id
    INTO v_ledger_id
    FROM public.entitlements_ledger
    WHERE order_id = p_order_id
      AND feature = v_feature
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_ledger_id IS NOT NULL THEN
    UPDATE public.entitlements_ledger
    SET
      user_id = COALESCE(p_user_id, user_id),
      venue_id = COALESCE(p_venue_id, venue_id),
      starts_at = v_start_at,
      ends_at = p_ends_at,
      feature = v_feature,
      quantity = GREATEST(COALESCE(quantity, 1), 1)
    WHERE id = v_ledger_id;
  END IF;

  IF v_ledger_id IS NULL THEN
    INSERT INTO public.entitlements_ledger (
      order_id,
      venue_id,
      feature,
      starts_at,
      ends_at,
      quantity,
      user_id,
      metadata
    ) VALUES (
      p_order_id,
      p_venue_id,
      v_feature,
      v_start_at,
      p_ends_at,
      1,
      p_user_id,
      '{}'::jsonb
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  IF p_venue_id IS NOT NULL AND to_regclass('public.venues') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'venues'
        AND column_name = 'updated_at'
    ) THEN
      UPDATE public.venues
      SET updated_at = now()
      WHERE id = p_venue_id;
    END IF;

    IF v_feature = 'verified' THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'is_verified'
      ) THEN
        UPDATE public.venues
        SET is_verified = TRUE
        WHERE id = p_venue_id;
      END IF;

      IF p_ends_at IS NOT NULL AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'verified_until'
      ) THEN
        UPDATE public.venues
        SET verified_until = CASE
          WHEN verified_until IS NULL OR verified_until < p_ends_at THEN p_ends_at
          ELSE verified_until
        END
        WHERE id = p_venue_id;
      END IF;
    ELSIF v_feature = 'glow' THEN
      IF p_ends_at IS NOT NULL AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'glow_until'
      ) THEN
        UPDATE public.venues
        SET glow_until = CASE
          WHEN glow_until IS NULL OR glow_until < p_ends_at THEN p_ends_at
          ELSE glow_until
        END
        WHERE id = p_venue_id;
      END IF;
    ELSIF v_feature = 'boost' THEN
      IF p_ends_at IS NOT NULL AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'boost_until'
      ) THEN
        UPDATE public.venues
        SET boost_until = CASE
          WHEN boost_until IS NULL OR boost_until < p_ends_at THEN p_ends_at
          ELSE boost_until
        END
        WHERE id = p_venue_id;
      END IF;
    ELSIF v_feature = 'giant' THEN
      IF p_ends_at IS NOT NULL AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'venues'
          AND column_name = 'giant_until'
      ) THEN
        UPDATE public.venues
        SET giant_until = CASE
          WHEN giant_until IS NULL OR giant_until < p_ends_at THEN p_ends_at
          ELSE giant_until
        END
        WHERE id = p_venue_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'entitlement_id', v_ledger_id,
    'feature', v_feature
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_entitlement(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_entitlement(UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;
