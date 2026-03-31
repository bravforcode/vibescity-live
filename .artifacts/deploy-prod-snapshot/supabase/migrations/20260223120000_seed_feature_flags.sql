-- =============================================================================
-- Migration: Seed Feature Flags (ensures table exists first)
-- Date: 2026-02-23 (Migration #3)
-- =============================================================================

BEGIN;

-- Ensure feature_flags_public table exists
CREATE TABLE IF NOT EXISTS public.feature_flags_public (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Allow anonymous read access
ALTER TABLE public.feature_flags_public ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read flags" ON public.feature_flags_public;
CREATE POLICY "Anyone can read flags"
  ON public.feature_flags_public FOR SELECT
  USING (true);

-- Seed missing feature flags
INSERT INTO public.feature_flags_public (key, enabled, description)
VALUES
  ('use_v2_feed', true, 'Use V2 feed cards RPC'),
  ('use_v2_search', true, 'Use V2 search RPC'),
  ('enable_partner_program', true, 'Enable partner referral program'),
  ('enable_cinema_mall_explorer', false, 'Enable cinema & mall floor explorer'),
  ('enable_web_vitals', false, 'Enable web vitals tracking'),
  ('enable_paypal_pins', false, 'Enable PayPal payment for pins'),
  ('enable_manual_pins', true, 'Enable bank transfer payment for pins')
ON CONFLICT (key) DO NOTHING;

-- Ensure user_stats has needed columns
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS check_ins_count INTEGER DEFAULT 0;

COMMIT;
