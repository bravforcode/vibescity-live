-- Qualify PostGIS functions/types explicitly for trigger functions that run with search_path=''
-- Prevents runtime errors like:
--   - type "geometry" does not exist
--   - type "geography" does not exist

CREATE OR REPLACE FUNCTION public.sync_venue_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.location IS NOT NULL AND (
    TG_OP = 'INSERT' OR
    OLD.location IS DISTINCT FROM NEW.location
  ) THEN
    NEW.latitude := public.ST_Y(NEW.location::public.geometry);
    NEW.longitude := public.ST_X(NEW.location::public.geometry);
  ELSIF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL AND (
    TG_OP = 'INSERT' OR
    OLD.latitude IS DISTINCT FROM NEW.latitude OR
    OLD.longitude IS DISTINCT FROM NEW.longitude
  ) THEN
    NEW.location := public.ST_SetSRID(
      public.ST_MakePoint(NEW.longitude, NEW.latitude),
      4326
    )::public.geography;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_venue_location_latlng()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.location IS NULL AND NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      NEW.location := public.ST_SetSRID(
        public.ST_MakePoint(NEW.longitude, NEW.latitude),
        4326
      )::public.geography;
    ELSIF NEW.location IS NOT NULL THEN
      NEW.latitude := COALESCE(NEW.latitude, public.ST_Y(NEW.location::public.geometry));
      NEW.longitude := COALESCE(NEW.longitude, public.ST_X(NEW.location::public.geometry));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.location IS DISTINCT FROM OLD.location AND NEW.location IS NOT NULL THEN
    NEW.latitude := public.ST_Y(NEW.location::public.geometry);
    NEW.longitude := public.ST_X(NEW.location::public.geometry);
  ELSIF (NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude)
    AND NEW.latitude IS NOT NULL
    AND NEW.longitude IS NOT NULL THEN
    NEW.location := public.ST_SetSRID(
      public.ST_MakePoint(NEW.longitude, NEW.latitude),
      4326
    )::public.geography;
  END IF;

  RETURN NEW;
END;
$$;
