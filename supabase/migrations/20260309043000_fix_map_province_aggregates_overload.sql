-- Resolve overloaded get_map_province_aggregates RPCs.
-- PostgREST cannot choose between text[] and uuid[] variants reliably.
-- Keep the canonical uuid[] signature from the later normalization migration.

BEGIN;

DROP FUNCTION IF EXISTS public.get_map_province_aggregates(text[]);

COMMIT;
