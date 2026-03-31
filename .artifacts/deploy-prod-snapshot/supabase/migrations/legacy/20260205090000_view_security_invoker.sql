-- Enforce security_invoker on public views to prevent RLS bypass

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'shops' AND c.relkind = 'v'
    ) THEN
        EXECUTE 'ALTER VIEW public.shops SET (security_invoker = true, security_barrier = true)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'venues_public' AND c.relkind = 'v'
    ) THEN
        EXECUTE 'ALTER VIEW public.venues_public SET (security_invoker = true, security_barrier = true)';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'user_coin_balance' AND c.relkind = 'v'
    ) THEN
        EXECUTE 'ALTER VIEW public.user_coin_balance SET (security_invoker = true, security_barrier = true)';
    END IF;
END $$;
