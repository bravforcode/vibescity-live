-- Purpose: Keep SEO slugs stable + support slug changes with redirects (slug history)
-- Safety: idempotent, SQL Editor safe
-- Affected objects: public.venues, public.venue_slug_history
-- Risks (tier): High (schema change + trigger; verify on staging first)
-- Rollback plan:
--   - DROP TRIGGER IF EXISTS venues_set_slug_update_trigger ON public.venues;
--   - DROP FUNCTION IF EXISTS public.set_venue_slug_on_update();
--   - DROP FUNCTION IF EXISTS public.backfill_venue_slugs(INTEGER);
--   - ALTER TABLE public.venues DROP COLUMN IF EXISTS slug_is_manual;
--   - DROP TABLE IF EXISTS public.venue_slug_history;

-- Track whether a slug was manually set (prevents auto-changing on name updates)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS slug_is_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- History table for old slugs -> venue_id (redirect support)
CREATE TABLE IF NOT EXISTS public.venue_slug_history (
  slug TEXT PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS venue_slug_history_venue_id_idx
  ON public.venue_slug_history (venue_id);

-- RLS: slug history is public but only for public-visible venues (align with venues_select_public)
ALTER TABLE public.venue_slug_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_slug_history_select_public" ON public.venue_slug_history;
CREATE POLICY "venue_slug_history_select_public" ON public.venue_slug_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = venue_id
        AND (
          (v.status IS NULL OR v.status IN ('active', 'approved', 'LIVE'))
          OR (auth.uid() IS NOT NULL AND v.owner_id = auth.uid())
          OR (auth.role() = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS "venue_slug_history_insert_owner" ON public.venue_slug_history;
CREATE POLICY "venue_slug_history_insert_owner" ON public.venue_slug_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = venue_id
        AND (
          (auth.uid() IS NOT NULL AND v.owner_id = auth.uid())
          OR (auth.role() = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS "venue_slug_history_service_role_all" ON public.venue_slug_history;
CREATE POLICY "venue_slug_history_service_role_all" ON public.venue_slug_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Update trigger: auto-update slug on name change (unless manual) + store old slug for redirects
CREATE OR REPLACE FUNCTION public.set_venue_slug_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_slug TEXT;
  v_new_slug TEXT;
  v_base TEXT;
  v_i INTEGER := 0;
BEGIN
  v_old_slug := NULLIF(OLD.slug, '');

  -- Normalize user-provided slug input (if any)
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    NEW.slug := public.slugify(NEW.slug);
  END IF;

  -- If slug cleared, switch to auto mode (we'll keep old if name unchanged)
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug_is_manual := FALSE;
  END IF;

  -- If slug changed to a non-empty value, treat as manual override
  IF NULLIF(NEW.slug, '') IS NOT NULL AND NULLIF(NEW.slug, '') IS DISTINCT FROM v_old_slug THEN
    NEW.slug_is_manual := TRUE;
  END IF;

  -- Auto-update slug on name change when not manual
  IF (NEW.name IS DISTINCT FROM OLD.name) AND (COALESCE(NEW.slug_is_manual, FALSE) = FALSE) THEN
    v_base := public.slugify(NEW.name);
    IF v_base IS NULL OR v_base = '' THEN
      v_base := 'v-' || substr(replace(NEW.id::TEXT, '-', ''), 1, 8);
    END IF;

    v_new_slug := v_base;
    v_i := 0;
    WHILE EXISTS (
      SELECT 1
      FROM public.venues
      WHERE id <> NEW.id
        AND slug IS NOT NULL
        AND slug <> ''
        AND lower(slug) = lower(v_new_slug)
    ) LOOP
      v_i := v_i + 1;
      v_new_slug := v_base || '-' || v_i::TEXT;
      IF v_i > 999 THEN
        v_new_slug := v_base || '-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6);
        EXIT;
      END IF;
    END LOOP;

    NEW.slug := v_new_slug;
  END IF;

  -- Avoid accidentally wiping slug on unrelated updates
  IF (NEW.slug IS NULL OR NEW.slug = '') AND v_old_slug IS NOT NULL THEN
    NEW.slug := v_old_slug;
  END IF;

  -- Record old slug for redirects when it changes
  IF v_old_slug IS NOT NULL
    AND NULLIF(NEW.slug, '') IS NOT NULL
    AND lower(NEW.slug) <> lower(v_old_slug) THEN
    INSERT INTO public.venue_slug_history (slug, venue_id)
    VALUES (lower(v_old_slug), NEW.id)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS venues_set_slug_update_trigger ON public.venues;
CREATE TRIGGER venues_set_slug_update_trigger
BEFORE UPDATE ON public.venues
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_slug_on_update();

-- Helper: safe slug backfill (manual run recommended; does not run automatically)
CREATE OR REPLACE FUNCTION public.backfill_venue_slugs(p_limit INTEGER DEFAULT 100000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_base TEXT;
  v_slug TEXT;
  v_i INTEGER;
  v_updated INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, name
    FROM public.venues
    WHERE (slug IS NULL OR slug = '')
    ORDER BY created_at NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 100000), 1)
  LOOP
    v_base := public.slugify(r.name);
    IF v_base IS NULL OR v_base = '' THEN
      v_base := 'v-' || substr(replace(r.id::TEXT, '-', ''), 1, 8);
    END IF;

    v_slug := v_base;
    v_i := 0;
    WHILE EXISTS (
      SELECT 1
      FROM public.venues
      WHERE slug IS NOT NULL
        AND slug <> ''
        AND lower(slug) = lower(v_slug)
    ) LOOP
      v_i := v_i + 1;
      v_slug := v_base || '-' || v_i::TEXT;
      IF v_i > 999 THEN
        v_slug := v_base || '-' || substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 6);
        EXIT;
      END IF;
    END LOOP;

    UPDATE public.venues
    SET slug = v_slug,
        slug_is_manual = FALSE
    WHERE id = r.id;

    v_updated := v_updated + 1;
  END LOOP;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_venue_slugs(INTEGER) TO service_role;

