-- Create table for caching real media scraped from external sources
CREATE TABLE IF NOT EXISTS public.real_media_cache (
    venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE PRIMARY KEY,
    video_url TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    source TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create an index on updated_at to easily clear old cache
CREATE INDEX IF NOT EXISTS idx_real_media_cache_updated_at ON public.real_media_cache(updated_at);

-- RLS
ALTER TABLE public.real_media_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to real_media_cache"
    ON public.real_media_cache FOR SELECT
    TO public
    USING (true);

-- Allow service role to manage cache
CREATE POLICY "Allow service role full access to real_media_cache"
    ON public.real_media_cache FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
