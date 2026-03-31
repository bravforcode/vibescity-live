CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.authority_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id text NOT NULL,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  province text NOT NULL,
  category text NOT NULL,
  district text,
  address text,
  status text,
  source text,
  source_ref text,
  updated_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_authority_places_authority_id
  ON public.authority_places (authority_id);

CREATE INDEX IF NOT EXISTS idx_authority_places_province
  ON public.authority_places (province);

CREATE INDEX IF NOT EXISTS idx_authority_places_category
  ON public.authority_places (category);
