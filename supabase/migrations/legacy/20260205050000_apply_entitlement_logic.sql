-- Migration: venue_features_logic
-- Date: 2026-02-05
-- Description: Adds entitlement tracking and the logic to apply features to venues.

-- 1. Ledger for Audit Trail
CREATE TABLE IF NOT EXISTS public.entitlements_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    feature TEXT NOT NULL, -- 'verified', 'glow', 'boost', 'giant'
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ, -- NULL for lifetime
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Ledger (Admin only mainly, but users can see own if needed)
ALTER TABLE public.entitlements_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own entitlements" ON public.entitlements_ledger FOR SELECT USING (true); -- Public read for now to keep it simple

-- 2. Power Function: apply_entitlement
-- This is called by Edge Functions or Admin to grant features
CREATE OR REPLACE FUNCTION public.apply_entitlement(
    p_user_id UUID,
    p_venue_id UUID,
    p_order_id UUID,
    p_feature TEXT,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ
) RETURNS VOID AS $$
DECLARE
    v_current_expiry TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
BEGIN
    -- Log the transaction
    INSERT INTO public.entitlements_ledger (user_id, venue_id, order_id, feature, starts_at, ends_at)
    VALUES (p_user_id, p_venue_id, p_order_id, p_feature, p_starts_at, p_ends_at);

    -- Apply the effect to the venue
    IF p_feature = 'verified' THEN
        UPDATE public.venues
        SET is_verified = TRUE,
            verified_until = p_ends_at
        WHERE id = p_venue_id;

    ELSIF p_feature = 'glow' THEN
        -- Additive logic (if current expiry is in future, add duration)
        SELECT glow_until INTO v_current_expiry FROM public.venues WHERE id = p_venue_id;
        IF v_current_expiry IS NOT NULL AND v_current_expiry > NOW() THEN
            v_new_expiry := v_current_expiry + (p_ends_at - p_starts_at);
        ELSE
            v_new_expiry := p_ends_at;
        END IF;

        UPDATE public.venues SET glow_until = v_new_expiry WHERE id = p_venue_id;

    ELSIF p_feature = 'boost' THEN
        SELECT boost_until INTO v_current_expiry FROM public.venues WHERE id = p_venue_id;
        IF v_current_expiry IS NOT NULL AND v_current_expiry > NOW() THEN
            v_new_expiry := v_current_expiry + (p_ends_at - p_starts_at);
        ELSE
            v_new_expiry := p_ends_at;
        END IF;

        UPDATE public.venues SET boost_until = v_new_expiry WHERE id = p_venue_id;

    ELSIF p_feature = 'giant' THEN
         SELECT giant_until INTO v_current_expiry FROM public.venues WHERE id = p_venue_id;
        IF v_current_expiry IS NOT NULL AND v_current_expiry > NOW() THEN
            v_new_expiry := v_current_expiry + (p_ends_at - p_starts_at);
        ELSE
            v_new_expiry := p_ends_at;
        END IF;

        UPDATE public.venues SET giant_until = v_new_expiry WHERE id = p_venue_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
