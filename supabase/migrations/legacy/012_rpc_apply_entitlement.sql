-- 012_rpc_apply_entitlement.sql

CREATE OR REPLACE FUNCTION public.apply_entitlement(
    p_user_id UUID,
    p_venue_id UUID,
    p_order_id UUID,
    p_feature TEXT,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as Postgres (Service Role permissions)
SET search_path = public
AS $$
DECLARE
    v_duration INTERVAL;
BEGIN
    -- 1. Insert into Ledger
    INSERT INTO public.entitlements_ledger (
        order_id, venue_id, feature, starts_at, ends_at, quantity
    ) VALUES (
        p_order_id, p_venue_id, p_feature, p_starts_at, p_ends_at, 1
    );

    -- 2. Determine Duration based on feature (Hardcoded rules for stacking safety)
    -- verified: 1 year
    -- glow: 24 hours
    -- boost: 7 days
    -- giant: 30 days
    CASE p_feature
        WHEN 'verified' THEN v_duration := INTERVAL '1 year';
        WHEN 'glow' THEN v_duration := INTERVAL '24 hours';
        WHEN 'boost' THEN v_duration := INTERVAL '7 days';
        WHEN 'giant' THEN v_duration := INTERVAL '30 days';
        ELSE RAISE EXCEPTION 'Unknown feature type: %', p_feature;
    END CASE;

    -- 3. Update Venues (Stacking Logic)
    -- Logic: If currently active, add to existing expiry. If expired/null, start from NOW().

    IF p_feature = 'verified' THEN
        UPDATE public.venues
        SET
            -- is_verified = true, -- Can keep simple bool true
            verified_until = GREATEST(COALESCE(verified_until, NOW()), NOW()) + v_duration
        WHERE id = p_venue_id;

    ELSIF p_feature = 'glow' THEN
        UPDATE public.venues
        SET
            glow_until = GREATEST(COALESCE(glow_until, NOW()), NOW()) + v_duration
        WHERE id = p_venue_id;

    ELSIF p_feature = 'boost' THEN
        UPDATE public.venues
        SET
            boost_until = GREATEST(COALESCE(boost_until, NOW()), NOW()) + v_duration
        WHERE id = p_venue_id;

    ELSIF p_feature = 'giant' THEN
        UPDATE public.venues
        SET
            pin_type = 'giant', -- Upgrade pin type directly
            giant_until = GREATEST(COALESCE(giant_until, NOW()), NOW()) + v_duration
        WHERE id = p_venue_id;
    END IF;

END;
$$;

-- Revoke public access, allow only Service Role
REVOKE EXECUTE ON FUNCTION public.apply_entitlement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_entitlement TO service_role;
