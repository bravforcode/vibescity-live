-- Production UUID unification delta
-- Keeps backward compatibility while normalizing all venues.id references to UUID.

-- 1) Normalize orders.venue_id to UUID when drifted
DO $$
DECLARE
  v_data_type TEXT;
  v_constraint RECORD;
BEGIN
  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'orders'
    AND c.column_name = 'venue_id';

  IF v_data_type IS NOT NULL AND v_data_type <> 'uuid' THEN
    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'orders'
        AND con.contype = 'f'
        AND att.attname = 'venue_id'
    LOOP
      EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', v_constraint.conname);
    END LOOP;

    EXECUTE $alter$
      ALTER TABLE public.orders
      ALTER COLUMN venue_id TYPE UUID
      USING CASE
        WHEN venue_id IS NULL THEN NULL
        WHEN venue_id::TEXT ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN venue_id::TEXT::UUID
        ELSE NULL
      END
    $alter$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_venue_id_fkey'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id);
  END IF;
END;
$$;

-- 2) Normalize enrichment_queue.venue_id to UUID when drifted
DO $$
DECLARE
  v_data_type TEXT;
  v_constraint RECORD;
BEGIN
  -- Defensive check: Ensure updated_at exists (fixes schema drift from 20260204099999)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'enrichment_queue' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.enrichment_queue ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  SELECT c.data_type
  INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'enrichment_queue'
    AND c.column_name = 'venue_id';

  IF v_data_type IS NULL THEN
    RETURN;
  END IF;

  IF v_data_type <> 'uuid' THEN
    FOR v_constraint IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k.attnum
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'enrichment_queue'
        AND con.contype = 'f'
        AND att.attname = 'venue_id'
    LOOP
      EXECUTE format('ALTER TABLE public.enrichment_queue DROP CONSTRAINT %I', v_constraint.conname);
    END LOOP;

    EXECUTE $alter$
      ALTER TABLE public.enrichment_queue
      ALTER COLUMN venue_id TYPE UUID
      USING CASE
        WHEN venue_id IS NULL THEN NULL
        WHEN venue_id::TEXT ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN venue_id::TEXT::UUID
        ELSE NULL
      END
    $alter$;
  END IF;

  DELETE FROM public.enrichment_queue eq
  USING public.enrichment_queue newer
  WHERE eq.venue_id IS NOT NULL
    AND eq.venue_id = newer.venue_id
    AND eq.id < newer.id;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'enrichment_queue_venue_id_fkey'
      AND conrelid = 'public.enrichment_queue'::regclass
  ) THEN
    ALTER TABLE public.enrichment_queue
      ADD CONSTRAINT enrichment_queue_venue_id_fkey
      FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS enrichment_queue_venue_id_uq
    ON public.enrichment_queue(venue_id);
END;
$$;

-- 3) Fix UUID signatures and remove BIGINT overloads
DROP FUNCTION IF EXISTS public.increment_venue_views(BIGINT);
CREATE OR REPLACE FUNCTION public.increment_venue_views(venue_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET total_views = COALESCE(total_views, 0) + 1
  WHERE id = venue_id;
END;
$$;

DROP FUNCTION IF EXISTS public.request_enrichment_priority(BIGINT);
CREATE OR REPLACE FUNCTION public.request_enrichment_priority(p_venue_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.enrichment_queue (venue_id, priority_score, status, missing_fields)
  VALUES (p_venue_id, 50, 'pending', ARRAY['images', 'video'])
  ON CONFLICT (venue_id) DO UPDATE
  SET priority_score = public.enrichment_queue.priority_score + 10,
      updated_at = NOW();
$$;

DROP FUNCTION IF EXISTS public.promote_to_giant(BIGINT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.promote_to_giant(UUID, TEXT, JSONB);   -- ← เพิ่มบรรทัดนี้
CREATE OR REPLACE FUNCTION public.promote_to_giant(
  p_shop_id UUID,
  p_giant_category TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET
    pin_type = 'giant',
    pin_metadata = COALESCE(pin_metadata, '{}'::JSONB)
      || COALESCE(p_metadata, '{}'::JSONB)
      || jsonb_build_object('giant_category', p_giant_category),
    giant_until = GREATEST(COALESCE(giant_until, NOW()), NOW()) + INTERVAL '30 days'
  WHERE id = p_shop_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_venue_stats(BIGINT);
CREATE OR REPLACE FUNCTION public.get_venue_stats(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live_visitors INT;
  v_total_views INT;
BEGIN
  SELECT COUNT(DISTINCT visitor_id)
  INTO v_live_visitors
  FROM public.analytics_events
  WHERE shop_id::TEXT = p_shop_id::TEXT
    AND created_at > (NOW() - INTERVAL '15 minutes');

  SELECT COUNT(*)
  INTO v_total_views
  FROM public.analytics_events
  WHERE shop_id::TEXT = p_shop_id::TEXT
    AND event_type = 'view';

  RETURN jsonb_build_object(
    'live_visitors', COALESCE(v_live_visitors, 0),
    'total_views', COALESCE(v_total_views, 0),
    'rating', 5.0
  );
END;
$$;

DROP FUNCTION IF EXISTS public.update_venue_anonymous(BIGINT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.update_venue_anonymous(
  p_shop_id UUID,
  p_visitor_id TEXT,
  p_updates JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.venues
    WHERE id = p_shop_id
      AND owner_visitor_id = p_visitor_id
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.venues
  SET
    name = COALESCE((p_updates->>'name'), name),
    category = COALESCE((p_updates->>'category'), category),
    description = COALESCE((p_updates->>'description'), description),
    updated_at = NOW()
  WHERE id = p_shop_id;

  RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_venue_anonymous(BIGINT, TEXT);
CREATE OR REPLACE FUNCTION public.claim_venue_anonymous(
  p_shop_id UUID,
  p_visitor_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.venues
  SET owner_visitor_id = p_visitor_id
  WHERE id = p_shop_id
    AND (owner_visitor_id IS NULL OR owner_visitor_id = '');

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_entitlements(
  p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_venue_id UUID;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_venue_id := COALESCE(v_order.venue_id, NULLIF(v_order.shop_id::TEXT, '')::UUID);

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'No venue associated with order';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    IF v_item.sku = 'verified_badge' THEN
      UPDATE public.venues
      SET is_verified = TRUE,
          verified_until = GREATEST(COALESCE(verified_until, NOW()), NOW())
            + (INTERVAL '1 year' * v_item.quantity)
      WHERE id = v_venue_id;

    ELSIF v_item.sku = 'pin_glow_24h' THEN
      UPDATE public.venues
      SET pin_metadata = jsonb_set(COALESCE(pin_metadata, '{}'::JSONB), '{glow_color}', '"#FFD700"'),
          glow_until = GREATEST(COALESCE(glow_until, NOW()), NOW())
            + (INTERVAL '24 hours' * v_item.quantity)
      WHERE id = v_venue_id;

    ELSIF v_item.sku = 'boost_1w' THEN
      UPDATE public.venues
      SET visibility_score = visibility_score + 100,
          boost_until = GREATEST(COALESCE(boost_until, NOW()), NOW())
            + (INTERVAL '7 days' * v_item.quantity)
      WHERE id = v_venue_id;

    ELSIF v_item.sku = 'giant_monthly' THEN
      UPDATE public.venues
      SET pin_type = 'giant',
          giant_until = GREATEST(COALESCE(giant_until, NOW()), NOW())
            + (INTERVAL '30 days' * v_item.quantity)
      WHERE id = v_venue_id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_venue_views(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_enrichment_priority(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_venue_stats(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_venue_anonymous(UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_venue_anonymous(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_to_giant(UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_entitlements(UUID) TO service_role;
