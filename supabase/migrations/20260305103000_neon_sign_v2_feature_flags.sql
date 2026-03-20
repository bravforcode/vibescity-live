-- =============================================================================
-- Migration: Neon Sign V2 Feature Flags (rollout + kill switch + config)
-- Date: 2026-03-05
-- =============================================================================

BEGIN;

ALTER TABLE public.feature_flags_public
  ADD COLUMN IF NOT EXISTS rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  ADD COLUMN IF NOT EXISTS kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_feature_flags_public_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_flags_public_updated_at ON public.feature_flags_public;
CREATE TRIGGER trg_feature_flags_public_updated_at
BEFORE UPDATE ON public.feature_flags_public
FOR EACH ROW
EXECUTE FUNCTION public.touch_feature_flags_public_updated_at();

INSERT INTO public.feature_flags_public (
  key,
  enabled,
  description,
  rollout_percent,
  kill_switch,
  config
)
VALUES (
  'neon_sign_v2_enabled',
  TRUE,
  'Neon sign V2 rollout control with kill switch and config',
  0,
  FALSE,
  jsonb_build_object(
    'experiment_id', 'stable',
    'signature_version', '2-stable',
    'refresh_interval_ms', 30000,
    'circuit_breaker_window_ms', 60000,
    'sprite_error_rate_threshold', 0.05
  )
)
ON CONFLICT (key)
DO UPDATE SET
  description = EXCLUDED.description,
  config = COALESCE(public.feature_flags_public.config, '{}'::jsonb) || EXCLUDED.config;

COMMIT;
