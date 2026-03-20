BEGIN;

ALTER FUNCTION public.get_feed_cards(double precision, double precision, integer)
  SET statement_timeout = '30s';

ALTER FUNCTION public.get_feed_cards(double precision, double precision, integer)
  SET search_path = public, extensions;

COMMIT;
