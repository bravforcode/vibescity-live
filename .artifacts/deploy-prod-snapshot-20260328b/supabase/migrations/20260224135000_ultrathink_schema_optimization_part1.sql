-- Phase 3: Database Schema Refactoring - Integrity & Performance (VibeCity Analysis)
-- Addressing points 1-30 from the 80-point analysis map

BEGIN;

CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA extensions;

-------------------------------------------------------------------------------
-- 1. FOREIGN KEYS & RELATIONSHIPS
-------------------------------------------------------------------------------

-- A1 & A2: check_ins & daily_checkins (venue_id from text -> uuid)
-- Note: Assuming venue_id in these tables currently stores valid UUID strings.
-- We must cast them and add the constraint.
ALTER TABLE public.check_ins
    ALTER COLUMN venue_id TYPE uuid USING (venue_id::uuid);

ALTER TABLE public.check_ins
    ADD CONSTRAINT fk_check_ins_venue
    FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

ALTER TABLE public.daily_checkins
    ALTER COLUMN venue_id TYPE uuid USING (venue_id::uuid);

ALTER TABLE public.daily_checkins
    ADD CONSTRAINT fk_daily_checkins_venue
    FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- A3: user_favorites missing FK to auth.users
ALTER TABLE public.user_favorites
    ADD CONSTRAINT fk_user_favorites_user
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_favorites
    ADD CONSTRAINT fk_user_favorites_venue
    FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;

-- A4: partners.visitor_id is missing FK to auth.users (if it's supposed to link there)
-- OR if visitor_id is an anonymous text ID, we should standardize.
-- We will add an index on visitor_id for all analytics tables to speed up joins.

-------------------------------------------------------------------------------
-- 2. CONSTRAINT & INDEX OMISSIONS (PERFORMANCE)
-------------------------------------------------------------------------------

-- B2: Missing Analytics Indexes (GIN on JSONB)
CREATE INDEX IF NOT EXISTS idx_analytics_events_data_gin
    ON public.analytics_events USING GIN (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_analytics_logs_data_gin
    ON public.analytics_logs USING GIN (data jsonb_path_ops);

-- B3: Map Ads Metadata Index
CREATE INDEX IF NOT EXISTS idx_ad_clicks_metadata_gin
    ON public.ad_clicks USING GIN (metadata jsonb_path_ops);

-- B4: Redemption Bottleneck
CREATE INDEX IF NOT EXISTS idx_redemptions_user_id
    ON public.redemptions (user_id);

-- B6: Case Insensitivity Missing (Venue Tags)
-- Create a unique index on lowercase name instead of altering column type
ALTER TABLE public.venue_tags DROP CONSTRAINT IF EXISTS venue_tags_name_key;
DROP INDEX IF EXISTS venue_tags_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_tags_name_lower
    ON public.venue_tags (LOWER(name));

-------------------------------------------------------------------------------
-- 3. DANGER & OVER-ENGINEERING (SOFT DELETES)
-------------------------------------------------------------------------------

-- E3: Lethal Deletes. Add soft-deletes to core structural tables.
ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_venues_deleted_at
    ON public.venues (deleted_at);



-- E8: Missing updated_at triggers
-- Add to user_achievements
ALTER TABLE public.user_achievements
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS trg_user_achievements_updated_at ON public.user_achievements;
CREATE TRIGGER trg_user_achievements_updated_at
    BEFORE UPDATE ON public.user_achievements
    FOR EACH ROW
    EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- Add to lucky_wheel_spins
ALTER TABLE public.lucky_wheel_spins
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

DROP TRIGGER IF EXISTS trg_lucky_wheel_spins_updated_at ON public.lucky_wheel_spins;
CREATE TRIGGER trg_lucky_wheel_spins_updated_at
    BEFORE UPDATE ON public.lucky_wheel_spins
    FOR EACH ROW
    EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMIT;
