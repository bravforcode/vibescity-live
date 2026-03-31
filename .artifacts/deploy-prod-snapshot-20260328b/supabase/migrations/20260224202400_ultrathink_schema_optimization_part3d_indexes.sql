-- =============================================================================
-- Ultrathink schema optimization part 3D (idempotent)
-- Phase B split: index creation
-- Source: 20260224202000_ultrathink_schema_optimization_part3.sql
-- =============================================================================

DO $$
DECLARE
  has_postgis boolean := false;
  venue_status_udt text := NULL;
  subscription_status_udt text := NULL;
  has_location boolean := false;
  has_latitude boolean := false;
  has_longitude boolean := false;
  has_status boolean := false;
  has_deleted_at boolean := false;
  has_owner_id boolean := false;
  has_visitor_id boolean := false;
  has_h3_cell boolean := false;
  has_category_id boolean := false;
  has_category boolean := false;
  has_visibility_score boolean := false;
  has_name boolean := false;
  has_sub_user_id boolean := false;
  has_sub_status boolean := false;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') INTO has_postgis;

  IF to_regclass('public.venues') IS NOT NULL THEN
    SELECT udt_name INTO venue_status_udt
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status';

    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'location') INTO has_location;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'latitude') INTO has_latitude;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'longitude') INTO has_longitude;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status') INTO has_status;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'deleted_at') INTO has_deleted_at;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'owner_id') INTO has_owner_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'visitor_id') INTO has_visitor_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'h3_cell') INTO has_h3_cell;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category_id') INTO has_category_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'category') INTO has_category;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'visibility_score') INTO has_visibility_score;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'name') INTO has_name;

    IF has_postgis AND has_location THEN
      CREATE INDEX IF NOT EXISTS idx_venues_location_gist
        ON public.venues USING gist (location);
    END IF;

    IF has_latitude THEN
      CREATE INDEX IF NOT EXISTS idx_venues_lat
        ON public.venues (latitude);
    END IF;
    IF has_longitude THEN
      CREATE INDEX IF NOT EXISTS idx_venues_lng
        ON public.venues (longitude);
    END IF;

    IF has_deleted_at THEN
      CREATE INDEX IF NOT EXISTS idx_venues_deleted_at
        ON public.venues (deleted_at);
    END IF;

    IF has_visibility_score AND has_name THEN
      IF has_deleted_at THEN
        CREATE INDEX IF NOT EXISTS idx_venues_visibility_name_live
          ON public.venues (visibility_score DESC, name)
          WHERE deleted_at IS NULL;
      ELSE
        CREATE INDEX IF NOT EXISTS idx_venues_visibility_name
          ON public.venues (visibility_score DESC, name);
      END IF;
    END IF;

    IF venue_status_udt = 'venue_status' AND has_status THEN
      CREATE INDEX IF NOT EXISTS idx_venues_status_lower_map
        ON public.venues ((COALESCE(status, 'active'::venue_status)));

      IF has_owner_id AND has_visitor_id THEN
        CREATE INDEX IF NOT EXISTS idx_venues_owner_visitor_status
          ON public.venues (owner_id, visitor_id, COALESCE(status, 'active'::venue_status));
      END IF;

      IF has_h3_cell THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_h3_cell
          ON public.venues (COALESCE(status, 'active'::venue_status), h3_cell);
      END IF;

      IF has_category_id THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_category_id
          ON public.venues (COALESCE(status, 'active'::venue_status), category_id);
      END IF;

      IF has_category THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_category
          ON public.venues (COALESCE(status, 'active'::venue_status), category);
      END IF;

      IF has_deleted_at THEN
        CREATE INDEX IF NOT EXISTS idx_venues_status_live
          ON public.venues (status)
          WHERE deleted_at IS NULL;
      END IF;

      IF has_latitude AND has_longitude THEN
        IF has_deleted_at THEN
          CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_active
            ON public.venues (latitude, longitude)
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND deleted_at IS NULL
              AND COALESCE(status, 'active'::venue_status) NOT IN ('off'::venue_status, 'inactive'::venue_status, 'disabled'::venue_status, 'deleted'::venue_status);
        ELSE
          CREATE INDEX IF NOT EXISTS idx_venues_lat_lng_active
            ON public.venues (latitude, longitude)
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND COALESCE(status, 'active'::venue_status) NOT IN ('off'::venue_status, 'inactive'::venue_status, 'disabled'::venue_status, 'deleted'::venue_status);
        END IF;
      END IF;
    END IF;
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    SELECT udt_name INTO subscription_status_udt
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status';

    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id') INTO has_sub_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status') INTO has_sub_status;

    IF subscription_status_udt = 'subscription_status' AND has_sub_user_id AND has_sub_status THEN
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status
        ON public.subscriptions (user_id, COALESCE(status, 'active'::subscription_status));
    END IF;
  END IF;
END $$;
