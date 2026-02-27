-- =============================================================================
-- Venues Admin Granularity (Thailand)
-- Adds detailed admin columns + bulk RPC for backfill from coordinates.
-- =============================================================================

SET statement_timeout = '15min';

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict TEXT,
  ADD COLUMN IF NOT EXISTS province_th TEXT,
  ADD COLUMN IF NOT EXISTS province_en TEXT,
  ADD COLUMN IF NOT EXISTS district_th TEXT,
  ADD COLUMN IF NOT EXISTS district_en TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict_th TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict_en TEXT,
  ADD COLUMN IF NOT EXISTS province_code TEXT,
  ADD COLUMN IF NOT EXISTS district_code TEXT,
  ADD COLUMN IF NOT EXISTS subdistrict_code TEXT,
  ADD COLUMN IF NOT EXISTS admin_source TEXT,
  ADD COLUMN IF NOT EXISTS admin_confidence SMALLINT,
  ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMPTZ;

ALTER TABLE public.venues
  ALTER COLUMN admin_source SET DEFAULT 'unknown',
  ALTER COLUMN admin_confidence SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venues_admin_confidence_range_ck'
      AND conrelid = 'public.venues'::regclass
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_admin_confidence_range_ck
      CHECK (admin_confidence BETWEEN 0 AND 100) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS venues_province_code_idx
  ON public.venues (province_code) WHERE province_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_district_code_idx
  ON public.venues (district_code) WHERE district_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_subdistrict_code_idx
  ON public.venues (subdistrict_code) WHERE subdistrict_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS venues_admin_resolved_at_idx
  ON public.venues (admin_resolved_at DESC);

CREATE OR REPLACE FUNCTION public.bulk_update_venue_admin(p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.venues v
  SET
    province_th = COALESCE(NULLIF(BTRIM(r.province_th), ''), v.province_th),
    province_en = COALESCE(NULLIF(BTRIM(r.province_en), ''), v.province_en),
    district_th = COALESCE(NULLIF(BTRIM(r.district_th), ''), v.district_th),
    district_en = COALESCE(NULLIF(BTRIM(r.district_en), ''), v.district_en),
    subdistrict_th = COALESCE(NULLIF(BTRIM(r.subdistrict_th), ''), v.subdistrict_th),
    subdistrict_en = COALESCE(NULLIF(BTRIM(r.subdistrict_en), ''), v.subdistrict_en),
    province_code = COALESCE(NULLIF(BTRIM(r.province_code), ''), v.province_code),
    district_code = COALESCE(NULLIF(BTRIM(r.district_code), ''), v.district_code),
    subdistrict_code = COALESCE(NULLIF(BTRIM(r.subdistrict_code), ''), v.subdistrict_code),
    province = CASE
      WHEN COALESCE(v.province, '') IN ('', 'Thailand', 'Unknown', 'UNKNOWN')
        THEN COALESCE(NULLIF(BTRIM(r.province_en), ''), NULLIF(BTRIM(r.province_th), ''), v.province)
      ELSE COALESCE(NULLIF(BTRIM(r.province_en), ''), v.province)
    END,
    district = COALESCE(NULLIF(BTRIM(r.district_en), ''), NULLIF(BTRIM(r.district_th), ''), v.district),
    subdistrict = COALESCE(NULLIF(BTRIM(r.subdistrict_en), ''), NULLIF(BTRIM(r.subdistrict_th), ''), v.subdistrict),
    admin_source = COALESCE(NULLIF(BTRIM(r.admin_source), ''), 'thai-geolocate', v.admin_source),
    admin_confidence = GREATEST(0, LEAST(100, COALESCE(r.admin_confidence, v.admin_confidence, 0))),
    admin_resolved_at = COALESCE(r.admin_resolved_at, NOW())
  FROM jsonb_to_recordset(p_rows) AS r(
    id UUID,
    province_th TEXT, province_en TEXT,
    district_th TEXT, district_en TEXT,
    subdistrict_th TEXT, subdistrict_en TEXT,
    province_code TEXT, district_code TEXT, subdistrict_code TEXT,
    admin_source TEXT, admin_confidence SMALLINT, admin_resolved_at TIMESTAMPTZ
  )
  WHERE v.id = r.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_venue_admin(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_update_venue_admin(JSONB) TO service_role;
