-- 009_public_views.sql

CREATE OR REPLACE VIEW public.venues_public AS
SELECT
    v.id,
    v.name,
    v.description,
    v.category,
    v.location,
    v.address,
    v.province,
    v.district,
    v.image_urls, -- Ensure we use image_urls as per schema
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
WHERE v.status != 'OFF'; -- Basic filtering, adjust if needed
