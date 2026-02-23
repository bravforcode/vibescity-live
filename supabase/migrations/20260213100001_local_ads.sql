-- ============================================================
-- Local Ads (Geofenced Advertising) - VibeCity
-- Creates local_ads table + get_local_ads RPC for radius queries
-- ============================================================

-- Ensure PostGIS extension is available (already enabled in this project)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ----------------------------------------------------------
-- Table: local_ads
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS local_ads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    image_url   TEXT DEFAULT '',
    link_url    TEXT DEFAULT '',
    location    GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_km   REAL NOT NULL DEFAULT 5.0,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'expired')),
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    starts_at   TIMESTAMPTZ DEFAULT now(),
    ends_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Spatial index for fast radius lookups
CREATE INDEX IF NOT EXISTS idx_local_ads_location
    ON local_ads USING GIST (location);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_local_ads_status
    ON local_ads (status);

-- ----------------------------------------------------------
-- RPC: get_local_ads
-- Returns active ads whose center is within the ad's own
-- radius_km from the user's location.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_local_ads(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION
)
RETURNS TABLE (
    id          UUID,
    title       TEXT,
    description TEXT,
    image_url   TEXT,
    link_url    TEXT,
    radius_km   REAL,
    distance_km DOUBLE PRECISION,
    starts_at   TIMESTAMPTZ,
    ends_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        la.id,
        la.title,
        la.description,
        la.image_url,
        la.link_url,
        la.radius_km,
        ROUND(
            (ST_Distance(la.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY) / 1000.0)::NUMERIC,
            2
        )::DOUBLE PRECISION AS distance_km,
        la.starts_at,
        la.ends_at
    FROM local_ads la
    WHERE la.status = 'active'
      AND (la.ends_at IS NULL OR la.ends_at > now())
      AND (la.starts_at IS NULL OR la.starts_at <= now())
      -- Check if user is within the ad's targeting radius
      AND ST_DWithin(
              la.location,
              ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::GEOGRAPHY,
              la.radius_km * 1000  -- convert km to meters
          )
    ORDER BY distance_km ASC;
END;
$$;

-- ----------------------------------------------------------
-- RLS Policies
-- ----------------------------------------------------------
ALTER TABLE local_ads ENABLE ROW LEVEL SECURITY;

-- Anyone can read active ads (public feed)
CREATE POLICY "Public can read active ads"
    ON local_ads FOR SELECT
    USING (status = 'active' AND (ends_at IS NULL OR ends_at > now()));

-- Admins can do everything (via service_role or admin check)
-- This uses a simple authenticated user check for insert/update/delete
-- In production, tighten this with an is_admin function
CREATE POLICY "Authenticated users can insert ads"
    ON local_ads FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update own ads"
    ON local_ads FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Authenticated users can delete own ads"
    ON local_ads FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- ----------------------------------------------------------
-- Updated_at trigger
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_local_ads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_local_ads_updated_at
    BEFORE UPDATE ON local_ads
    FOR EACH ROW
    EXECUTE FUNCTION update_local_ads_updated_at();
