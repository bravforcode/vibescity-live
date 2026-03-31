-- RPC to apply entitlements after successful payment
-- Called by stripe-webhook
-- FIXED to use 'venues' table

CREATE OR REPLACE FUNCTION public.apply_entitlements(
    p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_venue_id UUID;
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Use venue_id (preferred) or shop_id (legacy fallback)
    v_venue_id := COALESCE(v_order.venue_id, NULLIF(v_order.shop_id::TEXT, '')::UUID);

    IF v_venue_id IS NULL THEN
         RAISE EXCEPTION 'No venue associated with order';
    END IF;

    -- 2. Iterate Items
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id
    LOOP
        -- Logic based on SKU
        -- 'verified_badge' -> is_verified = true
        IF v_item.sku = 'verified_badge' THEN
            UPDATE public.venues
            SET is_verified = true,
                verified_until = GREATEST(COALESCE(verified_until, NOW()), NOW()) + (INTERVAL '1 year' * v_item.quantity)
            WHERE id = v_venue_id;

        -- 'pin_glow_24h' -> add glow
        ELSIF v_item.sku = 'pin_glow_24h' THEN
            UPDATE public.venues
            SET pin_metadata = jsonb_set(COALESCE(pin_metadata, '{}'::jsonb), '{glow_color}', '"#FFD700"'),
                glow_until = GREATEST(COALESCE(glow_until, NOW()), NOW()) + (INTERVAL '24 hours' * v_item.quantity)
            WHERE id = v_venue_id;

        -- 'boost_1w' -> visibility_score boost
        ELSIF v_item.sku = 'boost_1w' THEN
             UPDATE public.venues
            SET visibility_score = visibility_score + 100, -- Cumulative boost? Or just set max? Let's add.
                boost_until = GREATEST(COALESCE(boost_until, NOW()), NOW()) + (INTERVAL '7 days' * v_item.quantity)
            WHERE id = v_venue_id;

        -- 'giant_monthly' -> giant pin
        ELSIF v_item.sku = 'giant_monthly' THEN
             UPDATE public.venues
            SET pin_type = 'giant',
                giant_until = GREATEST(COALESCE(giant_until, NOW()), NOW()) + (INTERVAL '30 days' * v_item.quantity)
            WHERE id = v_venue_id;
        END IF;

    END LOOP;
END;
$$;
