-- Fix statement timeout for get_feed_cards
ALTER FUNCTION public.get_feed_cards(double precision, double precision) SET statement_timeout = '30s';
