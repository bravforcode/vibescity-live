-- ==========================================
-- RPC: Get Feed Cards (20km radius, limit 30)
-- ==========================================

create or replace function public.get_feed_cards(
  p_lat double precision,
  p_lng double precision
)
returns table (
  id bigint,
  name text,
  category text,
  sub_categories text[],
  distance_km double precision,
  pin_type pin_type_enum,
  pin_metadata jsonb,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  images text[],
  status text
)
language sql
stable
as $$
  select
    s.id,
    s.name,
    s.category,
    s.sub_categories,

    round(
      (st_distance(
        s.location,
        st_setsrid(st_makepoint(p_lng, p_lat),4326)::geography
      ) / 1000.0)::numeric
    , 2)::double precision as distance_km,

    s.pin_type,
    s.pin_metadata,

    s.is_verified,
    (s.verified_until is not null and s.verified_until > now()) as verified_active,
    (s.glow_until is not null and s.glow_until > now()) as glow_active,
    (s.boost_until is not null and s.boost_until > now()) as boost_active,
    (s.giant_until is not null and s.giant_until > now()) as giant_active,

    s.images,
    s.status
  from public.shops s
  where s.status='active'
    and st_dwithin(
      s.location,
      st_setsrid(st_makepoint(p_lng, p_lat),4326)::geography,
      20000
    )
  order by st_distance(
    s.location,
    st_setsrid(st_makepoint(p_lng, p_lat),4326)::geography
  ) asc
  limit 30;
$$;
