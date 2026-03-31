-- Purpose: Add SEO-friendly venue slugs and expose them via venues_public
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.venues, public.venues_public
-- Risks (tier): High (schema change + view replacement; verify on staging first)
-- Rollback plan:
--   - DROP TRIGGER IF EXISTS venues_set_slug_trigger ON public.venues;
--   - DROP FUNCTION IF EXISTS public.set_venue_slug();
--   - DROP FUNCTION IF EXISTS public.slugify(TEXT);
--   - DROP INDEX IF EXISTS public.venues_slug_lower_uq;
--   - ALTER TABLE public.venues DROP COLUMN IF EXISTS slug;
--   - Recreate public.venues_public from prior migration if needed.

-- 1) venues.slug + uniqueness
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS venues_slug_lower_uq
  ON public.venues (lower(slug))
  WHERE slug IS NOT NULL AND slug <> '';

-- 2) slugify helper (ASCII only; Thai-only names will become empty and fall back to short code)
CREATE OR REPLACE FUNCTION public.slugify(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(
    regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
    '-{2,}', '-', 'g'
  ));
$$;

-- 3) Trigger: set slug on insert when missing
CREATE OR REPLACE FUNCTION public.set_venue_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base TEXT;
  v_slug TEXT;
  v_i INTEGER := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  v_base := public.slugify(NEW.name);
  IF v_base IS NULL OR v_base = '' THEN
    v_base := 'v-' || substr(replace(NEW.id::TEXT, '-', ''), 1, 8);
  END IF;

  v_slug := v_base;
  WHILE EXISTS (
    SELECT 1
    FROM public.venues
    WHERE slug IS NOT NULL
      AND slug <> ''
      AND lower(slug) = lower(v_slug)
  ) LOOP
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i::TEXT;
    IF v_i > 999 THEN
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6);
      EXIT;
    END IF;
  END LOOP;

  NEW.slug := v_slug;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_set_slug_trigger ON public.venues;
CREATE TRIGGER venues_set_slug_trigger
BEFORE INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_slug();

-- 4) Update venues_public view to include slug (keep existing column list)
CREATE OR REPLACE VIEW public.venues_public AS
SELECT
    v.id,
    v.slug,
    v.name,
    v.description,
    v.category,
    v.location,
    v.address,
    v.province,
    v.district,
    v.image_urls,
    v.video_url,
    v.rating,
    v.review_count,
    v.pin_type,
    v.pin_metadata,
    v.visibility_score,
    v.opening_hours,
    v.phone,
    v.building_id,
    v.floor,

    -- Computed Booleans based on expiration dates
    (v.is_verified OR (v.verified_until IS NOT NULL AND v.verified_until > NOW())) AS verified_active,
    (v.glow_until IS NOT NULL AND v.glow_until > NOW()) AS glow_active,
    (v.boost_until IS NOT NULL AND v.boost_until > NOW()) AS boost_active,
    (v.giant_until IS NOT NULL AND v.giant_until > NOW()) AS giant_active,

    v.verified_until,
    v.glow_until,
    v.boost_until,
    v.giant_until

FROM public.venues v
WHERE v.status != 'OFF';

-- Ensure views run with invoker security (defense-in-depth; matches existing migration intent)
ALTER VIEW public.venues_public SET (security_invoker = true, security_barrier = true);

