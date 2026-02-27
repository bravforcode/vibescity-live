SELECT c.oid, n.nspname, c.relname, c.relkind, pg_get_viewdef(c.oid, true)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'venues_public';
