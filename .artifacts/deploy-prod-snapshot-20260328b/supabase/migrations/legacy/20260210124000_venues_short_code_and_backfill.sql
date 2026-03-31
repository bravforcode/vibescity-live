-- Purpose: Add ultra-short venue codes for share/QR (/v/<CODE>) + backfill slugs/codes + expose via venues_public
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.venues, public.venues_public, public.backfill_venue_slugs, public.backfill_venue_short_codes
-- Risks (tier): High (schema change + triggers + backfill; verify on staging first)
-- Rollback plan:
--   - DROP TRIGGER IF EXISTS venues_set_short_code_trigger ON public.venues;
--   - DROP TRIGGER IF EXISTS venues_set_short_code_update_trigger ON public.venues;
--   - DROP FUNCTION IF EXISTS public.set_venue_short_code_on_write();
--   - DROP FUNCTION IF EXISTS public.generate_venue_short_code(INTEGER);
--   - DROP FUNCTION IF EXISTS public.base32_encode(BYTEA);
--   - DROP FUNCTION IF EXISTS public.backfill_venue_short_codes(INTEGER);
--   - DROP INDEX IF EXISTS public.venues_short_code_lower_uq;
--   - ALTER TABLE public.venues DROP COLUMN IF EXISTS short_code;
--   - Recreate public.venues_public from prior migration if needed.

-- 1) venues.short_code + uniqueness (case-insensitive)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS short_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS venues_short_code_lower_uq
  ON public.venues (lower(short_code))
  WHERE short_code IS NOT NULL AND short_code <> '';

-- 2) Base32 encode helper (RFC4648 alphabet, no padding)
CREATE OR REPLACE FUNCTION public.base32_encode(p_bytes BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  output TEXT := '';
  buffer INTEGER := 0;
  bits INTEGER := 0;
  i INTEGER;
  b INTEGER;
  idx INTEGER;
BEGIN
  IF p_bytes IS NULL THEN
    RETURN NULL;
  END IF;

  IF length(p_bytes) = 0 THEN
    RETURN '';
  END IF;

  FOR i IN 0..(length(p_bytes) - 1) LOOP
    b := get_byte(p_bytes, i);
    buffer := (buffer << 8) | b;
    bits := bits + 8;

    WHILE bits >= 5 LOOP
      idx := (buffer >> (bits - 5)) & 31;
      output := output || substr(alphabet, idx + 1, 1);
      bits := bits - 5;
      IF bits > 0 THEN
        buffer := buffer & ((1 << bits) - 1);
      ELSE
        buffer := 0;
      END IF;
    END LOOP;
  END LOOP;

  IF bits > 0 THEN
    idx := (buffer << (5 - bits)) & 31;
    output := output || substr(alphabet, idx + 1, 1);
  END IF;

  RETURN output;
END;
$$;

-- 3) Short code generator (Base32 uppercase)
CREATE OR REPLACE FUNCTION public.generate_venue_short_code(p_len INTEGER DEFAULT 7)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_len INTEGER := GREATEST(COALESCE(p_len, 7), 4);
  v_code TEXT;
  v_attempt INTEGER := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_code := upper(substr(public.base32_encode(gen_random_bytes(6)), 1, v_len));

    IF v_code IS NOT NULL AND v_code <> '' AND NOT EXISTS (
      SELECT 1
      FROM public.venues
      WHERE short_code IS NOT NULL
        AND short_code <> ''
        AND lower(short_code) = lower(v_code)
    ) THEN
      RETURN v_code;
    END IF;

    IF v_attempt > 80 THEN
      -- Extremely unlikely fallback. Keep short and stable enough.
      RETURN upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, v_len));
    END IF;
  END LOOP;
END;
$$;

-- 4) Trigger: set short_code on insert; normalize on update; never wipe existing code
CREATE OR REPLACE FUNCTION public.set_venue_short_code_on_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Normalize user-provided short_code
  IF NEW.short_code IS NOT NULL AND NEW.short_code <> '' THEN
    NEW.short_code := upper(trim(NEW.short_code));
  END IF;

  -- Prevent accidental wiping on update
  IF (TG_OP = 'UPDATE') AND (NEW.short_code IS NULL OR NEW.short_code = '') AND (OLD.short_code IS NOT NULL AND OLD.short_code <> '') THEN
    NEW.short_code := OLD.short_code;
  END IF;

  -- Set on insert when missing
  IF (TG_OP = 'INSERT') AND (NEW.short_code IS NULL OR NEW.short_code = '') THEN
    NEW.short_code := public.generate_venue_short_code(7);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_set_short_code_trigger ON public.venues;
CREATE TRIGGER venues_set_short_code_trigger
BEFORE INSERT ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_short_code_on_write();

DROP TRIGGER IF EXISTS venues_set_short_code_update_trigger ON public.venues;
CREATE TRIGGER venues_set_short_code_update_trigger
BEFORE UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_short_code_on_write();

-- 5) Backfill helper (used by migration to fill *all* existing venues)
CREATE OR REPLACE FUNCTION public.backfill_venue_short_codes(p_limit INTEGER DEFAULT 1000000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_updated INTEGER := 0;
  v_try INTEGER;
BEGIN
  FOR r IN
    SELECT id
    FROM public.venues
    WHERE (short_code IS NULL OR short_code = '')
    ORDER BY created_at NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 1000000), 1)
  LOOP
    v_try := 0;
    LOOP
      v_try := v_try + 1;
      v_code := public.generate_venue_short_code(7);
      BEGIN
        UPDATE public.venues
        SET short_code = v_code
        WHERE id = r.id
          AND (short_code IS NULL OR short_code = '');
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_try > 10 THEN
          EXIT;
        END IF;
      END;
    END LOOP;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_venue_short_codes(INTEGER) TO service_role;

-- 6) Run backfills (idempotent)
-- Slugs: ensure legacy venues have slug for canonical /v/<slug>
DO $$
BEGIN
  IF to_regprocedure('public.backfill_venue_slugs(integer)') IS NOT NULL THEN
    PERFORM public.backfill_venue_slugs(1000000);
  END IF;
END;
$$;

-- Short codes: ensure all venues get a code for /v/<CODE>
DO $$
BEGIN
  PERFORM public.backfill_venue_short_codes(1000000);
END;
$$;

-- 7) Update venues_public view to include short_code (keep existing column list)
CREATE OR REPLACE VIEW public.venues_public AS
SELECT
    v.id,
    v.slug,
    v.short_code,
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

ALTER VIEW public.venues_public SET (security_invoker = true, security_barrier = true);

