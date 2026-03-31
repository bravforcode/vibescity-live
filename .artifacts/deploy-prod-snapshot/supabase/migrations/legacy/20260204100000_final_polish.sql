-- ==============================================================================
-- FINAL POLISH MIGRATION (20260204_final_polish.sql)
-- ==============================================================================
-- Goal: Link 'venues' to 'buildings' (Missing Piece)
-- Context: 'buildings.id' is TEXT, so 'venues.building_id' must be TEXT.

-- 1. Add Building & Floor columns to Venues
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS building_id TEXT REFERENCES public.buildings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS floor TEXT;

CREATE INDEX IF NOT EXISTS idx_venues_building_id ON public.venues(building_id);

-- 2. Ensure RPC 'get_building_details' returns correct data
CREATE OR REPLACE FUNCTION public.get_building_details(p_building_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_building JSONB;
    v_shops JSONB;
BEGIN
    -- Get Building
    SELECT row_to_json(b)::jsonb INTO v_building
    FROM public.buildings b
    WHERE id = p_building_id;

    IF v_building IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get Shops in Building (using the new building_id column)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', v.id,
            'name', v.name,
            'category', v.category,
            'floor', v.floor,
            'pin_type', v.pin_type,
            'image', v.image_urls[1] -- Use 1st image as cover
        )
    ) INTO v_shops
    FROM public.venues v
    WHERE v.building_id = p_building_id AND v.status != 'OFF';

    -- Merge
    RETURN v_building || jsonb_build_object('shops', COALESCE(v_shops, '[]'::jsonb));
END;
$$;
