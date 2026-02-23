-- RPC to downgrade expired entitlements
-- To be run periodically via pg_cron or Edge Function
-- FIXED to use 'venues' table

CREATE OR REPLACE FUNCTION public.expire_entitlements()
RETURNS TABLE(updated_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_rows INT;
BEGIN
    -- 1. Expire Verified
    UPDATE public.venues
    SET is_verified = false, verified_until = NULL
    WHERE is_verified = true AND verified_until < NOW();
    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    -- 2. Expire Glow
    UPDATE public.venues
    SET pin_metadata = pin_metadata - 'glow_color', glow_until = NULL
    WHERE glow_until < NOW();

    -- 3. Expire Boost
    UPDATE public.venues
    SET visibility_score = 0, boost_until = NULL
    WHERE boost_until < NOW();

    -- 4. Expire Giant
    UPDATE public.venues
    SET pin_type = 'normal', giant_until = NULL
    WHERE pin_type = 'giant' AND giant_until < NOW();

    RETURN QUERY SELECT affected_rows;
END;
$$;
