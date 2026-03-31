-- =============================================================================
-- PHASE 6: Enterprise Optimization - Database Performance Indexes
-- =============================================================================
-- Purpose: Add missing indexes for high-traffic UGC queries (Leaderboards, My Submissions).
-- Safety:  Uses IF NOT EXISTS to prevent errors.
-- Rollback: DROP INDEX CONCURRENTLY ...
-- =============================================================================

BEGIN;

-- 1. Leaderboard Optimization
-- Query: .select("user_id, xp, level, coins").order("xp", desc=True).limit(limit)
CREATE INDEX IF NOT EXISTS idx_user_stats_xp_desc ON public.user_stats (xp DESC);

-- 2. My Submissions Optimization
-- Query: .eq("user_id", user_id).order("created_at", desc=True)
CREATE INDEX IF NOT EXISTS idx_user_submissions_user_created ON public.user_submissions (user_id, created_at DESC);

-- 3. My Achievements Optimization
-- Query: .eq("user_id", user_id).range(...)
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements (user_id);

-- 4. Venue Photos Optimization (for gallery view)
-- Query: .eq("venue_id", venue_id).order("created_at", desc=True)
CREATE INDEX IF NOT EXISTS idx_venue_photos_venue_created ON public.venue_photos (venue_id, created_at DESC);

COMMIT;
