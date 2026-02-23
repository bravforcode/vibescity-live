-- 010_analytics_indexes.sql

-- Add indexes for scale if they don't exist
CREATE INDEX IF NOT EXISTS idx_analytics_events_venue_id ON public.analytics_events(venue_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen ON public.analytics_sessions(last_seen_at);
