-- Fix: missing RPC used by frontend analytics scroll/view tracking
CREATE OR REPLACE FUNCTION public.increment_venue_views(venue_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.venues
  SET total_views = COALESCE(total_views, 0) + 1
  WHERE id = venue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_venue_views(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_venue_views(UUID) TO authenticated;
