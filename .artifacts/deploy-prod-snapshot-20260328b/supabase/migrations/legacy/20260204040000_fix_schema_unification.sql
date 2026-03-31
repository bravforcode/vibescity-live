-- ==========================================
-- 0005: Schema Unification (Venues) & Security Fixes
-- ==========================================

-- 1. Unify Entitlements on 'venues' table (Source of Truth)
-- Re-applying columns from '0001' to 'venues' since frontend uses 'venues'
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS pin_type pin_type_enum NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS pin_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verified_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS glow_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS boost_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS giant_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS visibility_score INTEGER NOT NULL DEFAULT 0;

-- Indexes for venues entitlements
CREATE INDEX IF NOT EXISTS venues_pin_type_idx ON public.venues(pin_type);
CREATE INDEX IF NOT EXISTS venues_verified_until_idx ON public.venues(verified_until);
CREATE INDEX IF NOT EXISTS venues_giant_until_idx ON public.venues(giant_until);
CREATE INDEX IF NOT EXISTS venues_visibility_score_idx ON public.venues(visibility_score DESC);

-- 2. Update RPCs to query 'venues' instead of 'shops'

-- RPC: get_feed_cards
DROP FUNCTION IF EXISTS public.get_feed_cards_venues(double precision, double precision);
CREATE FUNCTION public.get_feed_cards_venues(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  id text,
  name text,
  category text,
  distance_km double precision,
  pin_type pin_type_enum,
  pin_metadata jsonb,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  images text[],
  status text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.id::text as id,
    v.name,
    v.category,

    ROUND(
      (ST_Distance(
        v.location::geometry,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geometry
      ) / 1000.0)::numeric
    , 2)::double precision as distance_km,

    v.pin_type,
    v.pin_metadata,

    v.is_verified,
    (v.verified_until IS NOT NULL AND v.verified_until > NOW()) as verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > NOW()) as glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > NOW()) as boost_active,
    (v.giant_until IS NOT NULL AND v.giant_until > NOW()) as giant_active,

    v.image_urls AS images,
    'active' as status
  FROM public.venues v
  ORDER BY
    v.location <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326) ASC
  LIMIT 30;
$$;

-- RPC: get_map_pins
DROP FUNCTION IF EXISTS public.get_map_pins_venues(double precision, double precision, double precision, double precision, int);
CREATE FUNCTION public.get_map_pins_venues(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom int
)
RETURNS TABLE (
  id text,
  name text,
  lat double precision,
  lng double precision,
  pin_type pin_type_enum,
  pin_metadata jsonb,
  visibility_score int,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_zoom < 13 THEN
    RETURN QUERY
      SELECT
        v.id::text as id,
        v.name,
        ST_Y(v.location::geometry) as lat,
        ST_X(v.location::geometry) as lng,
        v.pin_type,
        v.pin_metadata,
        v.visibility_score,
        v.is_verified,
        (v.verified_until IS NOT NULL AND v.verified_until > NOW()) as verified_active,
        (v.glow_until IS NOT NULL AND v.glow_until > NOW()) as glow_active,
        (v.boost_until IS NOT NULL AND v.boost_until > NOW()) as boost_active,
        (v.giant_until IS NOT NULL AND v.giant_until > NOW()) as giant_active
      FROM public.venues v
      WHERE v.pin_type='giant'
        AND ST_Intersects(
          v.location::geometry,
          ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
        );

  ELSIF p_zoom BETWEEN 13 AND 15 THEN
    RETURN QUERY
      (
        SELECT
          v.id::text as id, v.name,
          ST_Y(v.location::geometry) as lat,
          ST_X(v.location::geometry) as lng,
          v.pin_type, v.pin_metadata, v.visibility_score, v.is_verified,
          (v.verified_until IS NOT NULL AND v.verified_until > NOW()) as verified_active,
          (v.glow_until IS NOT NULL AND v.glow_until > NOW()) as glow_active,
          (v.boost_until IS NOT NULL AND v.boost_until > NOW()) as boost_active,
          (v.giant_until IS NOT NULL AND v.giant_until > NOW()) as giant_active
        FROM public.venues v
        WHERE v.pin_type='giant'
          AND ST_Intersects(v.location::geometry, ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326))
      )
      UNION ALL
      (
        SELECT
          v.id::text as id, v.name,
          ST_Y(v.location::geometry) as lat,
          ST_X(v.location::geometry) as lng,
          v.pin_type, v.pin_metadata, v.visibility_score, v.is_verified,
          (v.verified_until IS NOT NULL AND v.verified_until > NOW()) as verified_active,
          (v.glow_until IS NOT NULL AND v.glow_until > NOW()) as glow_active,
          (v.boost_until IS NOT NULL AND v.boost_until > NOW()) as boost_active,
          (v.giant_until IS NOT NULL AND v.giant_until > NOW()) as giant_active
        FROM public.venues v
        WHERE ST_Intersects(v.location::geometry, ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326))
          AND ( (v.boost_until IS NOT NULL AND v.boost_until > NOW()) OR v.visibility_score > 0 )
        ORDER BY
          (CASE WHEN v.boost_until > NOW() THEN 999999 ELSE v.visibility_score END) DESC
        LIMIT 60
      );
  ELSE
    RETURN QUERY
      SELECT
        v.id::text as id, v.name,
        ST_Y(v.location::geometry) as lat,
        ST_X(v.location::geometry) as lng,
        v.pin_type,
        v.pin_metadata,
        v.visibility_score,
        v.is_verified,
        (v.verified_until IS NOT NULL AND v.verified_until > NOW()) as verified_active,
        (v.glow_until IS NOT NULL AND v.glow_until > NOW()) as glow_active,
        (v.boost_until IS NOT NULL AND v.boost_until > NOW()) as boost_active,
        (v.giant_until IS NOT NULL AND v.giant_until > NOW()) as giant_active
      FROM public.venues v
      WHERE ST_Intersects(
          v.location::geometry,
          ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
        )
      LIMIT 1000;
  END IF;
END;
$$;

-- 3. Security: Add RLS Policies to Order Items & Payment Events

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'Users view own order items'
    ) THEN
        DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
        CREATE POLICY "Users view own order items" ON public.order_items
        FOR SELECT
        USING (
            order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'payment_events' AND policyname = 'Service role manages events'
    ) THEN
        DROP POLICY IF EXISTS "Service role manages events" ON public.payment_events;
        CREATE POLICY "Service role manages events" ON public.payment_events
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Orders: Add venue_id foreign key
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id);

CREATE INDEX IF NOT EXISTS orders_venue_id_idx ON public.orders(venue_id);

-- 5. RPC: promote_to_giant Update
-- Re-point to venues table
CREATE OR REPLACE FUNCTION public.promote_to_giant(
  p_shop_id uuid,
  p_giant_category text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.venues
  SET
    pin_type = 'giant',
    pin_metadata = coalesce(pin_metadata, '{}'::jsonb) || p_metadata || jsonb_build_object('giant_category', p_giant_category),
    giant_until = NOW() + interval '30 days'
  WHERE id = p_shop_id;
END;
$$;
