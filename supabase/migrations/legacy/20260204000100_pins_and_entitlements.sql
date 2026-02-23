-- ==========================================
-- 0001: pins + entitlements fields on shops
-- ==========================================

-- 1) pin_type enum
do $$ begin
  if not exists (select 1 from pg_type where typname = 'pin_type_enum') then
    create type pin_type_enum as enum ('normal','giant');
  end if;
end $$;

-- 2) add columns to shops (Defensive Check: Skip if shops is a view)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'shops'
      AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.shops
      ADD COLUMN if not exists pin_type pin_type_enum not null default 'normal',
      add column if not exists pin_metadata jsonb not null default '{}'::jsonb,
      add column if not exists is_verified boolean not null default false,
      add column if not exists verified_until timestamptz,
      add column if not exists glow_until timestamptz,
      add column if not exists boost_until timestamptz,
      add column if not exists giant_until timestamptz,
      add column if not exists visibility_score integer not null default 0;

    -- 3) indexes
    create index if not exists shops_pin_type_idx on public.shops(pin_type);
    create index if not exists shops_status_idx on public.shops(status);
    create index if not exists shops_visibility_score_idx on public.shops(visibility_score desc);

    create index if not exists shops_verified_until_idx on public.shops(verified_until);
    create index if not exists shops_glow_until_idx on public.shops(glow_until);
    create index if not exists shops_boost_until_idx on public.shops(boost_until);
    create index if not exists shops_giant_until_idx on public.shops(giant_until);

    -- location gist
    if not exists (
      select 1
      from pg_indexes
      where schemaname='public'
        and tablename='shops'
        and indexname='shops_location_gix'
    ) then
      create index shops_location_gix on public.shops using gist(location);
    end if;

    -- 4) safety: default metadata shape description
    comment on column public.shops.pin_metadata is
    'JSONB config: {"giant_category": "...", "model_scale": 1.2, "glow_color":"#FFD700", "anchor_rank":10}';
  END IF;
END $$;
