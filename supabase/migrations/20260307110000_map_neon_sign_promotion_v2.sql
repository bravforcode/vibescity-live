BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT NOT NULL DEFAULT 'one_time';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_purchase_mode_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_purchase_mode_check
      CHECK (purchase_mode IN ('one_time', 'subscription'))
      NOT VALID;
  END IF;

  BEGIN
    ALTER TABLE public.orders VALIDATE CONSTRAINT orders_purchase_mode_check;
  EXCEPTION
    WHEN undefined_object THEN
      NULL;
  END;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idempotency_key
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shop-branding',
  'shop-branding',
  true,
  6291456,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'shop_branding_public_read'
  ) THEN
    CREATE POLICY shop_branding_public_read ON storage.objects FOR SELECT
      USING (bucket_id = 'shop-branding');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'shop_branding_anon_upload'
  ) THEN
    CREATE POLICY shop_branding_anon_upload ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'shop-branding');
  END IF;
END $$;

INSERT INTO public.feature_flags_public (key, enabled, description)
VALUES
  ('promote_flow_v2_enabled', false, 'Owner promotion flow v2 rollout gate'),
  ('map_pins_api_v2_enabled', false, 'Rich /venues API contract rollout gate'),
  ('map_feed_fallback_enabled', true, 'Emergency fallback to feed-backed map pins'),
  ('neon_asset_render_enabled', false, 'Rendered neon asset pipeline rollout gate')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

COMMIT;
