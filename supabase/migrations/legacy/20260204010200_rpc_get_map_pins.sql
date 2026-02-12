-- ==========================================
-- RPC: Get Map Pins (Bounds + Zoom Rules)
-- ==========================================

create or replace function public.get_map_pins(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom int
)
returns table (
  id bigint,
  name text,
  lat double precision,
  lng double precision,
  pin_type pin_type_enum,
  pin_metadata jsonb,
  visibility_score int,
  is_verified boolean,
  verified_active boolean,
  glow_active boolean,
  boost_active boolean,
  giant_active boolean,
  cover_image text
)
language plpgsql
stable
as $$
begin
  if p_zoom < 13 then
    return query
      select
        s.id,
        s.name,
        st_y(s.location::geometry) as lat,
        st_x(s.location::geometry) as lng,
        s.pin_type,
        s.pin_metadata,
        s.visibility_score,
        s.is_verified,
        (s.verified_until is not null and s.verified_until > now()) as verified_active,
        (s.glow_until is not null and s.glow_until > now()) as glow_active,
        (s.boost_until is not null and s.boost_until > now()) as boost_active,
        (s.giant_until is not null and s.giant_until > now()) as giant_active,
        s.image_urls[1] as cover_image
      from public.shops s
      where s.status='active'
        and s.pin_type='giant'
        and st_intersects(
          s.location::geometry,
          st_makeenvelope(p_min_lng,p_min_lat,p_max_lng,p_max_lat,4326)
        );

  elsif p_zoom between 13 and 15 then
    return query
      (
        -- all giant pins in bounds
        select
          s.id, s.name,
          st_y(s.location::geometry) as lat,
          st_x(s.location::geometry) as lng,
          s.pin_type,
          s.pin_metadata,
          s.visibility_score,
          s.is_verified,
          (s.verified_until is not null and s.verified_until > now()) as verified_active,
          (s.glow_until is not null and s.glow_until > now()) as glow_active,
          (s.boost_until is not null and s.boost_until > now()) as boost_active,
          (s.giant_until is not null and s.giant_until > now()) as giant_active,
          s.image_urls[1] as cover_image
        from public.shops s
        where s.status='active'
          and s.pin_type='giant'
          and st_intersects(s.location::geometry, st_makeenvelope(p_min_lng,p_min_lat,p_max_lng,p_max_lat,4326))
      )
      union all
      (
        -- recommended set (boost or visibility_score)
        select
          s.id, s.name,
          st_y(s.location::geometry) as lat,
          st_x(s.location::geometry) as lng,
          s.pin_type,
          s.pin_metadata,
          s.visibility_score,
          s.is_verified,
          (s.verified_until is not null and s.verified_until > now()) as verified_active,
          (s.glow_until is not null and s.glow_until > now()) as glow_active,
          (s.boost_until is not null and s.boost_until > now()) as boost_active,
          (s.giant_until is not null and s.giant_until > now()) as giant_active,
          s.image_urls[1] as cover_image
        from public.shops s
        where s.status='active'
          and st_intersects(s.location::geometry, st_makeenvelope(p_min_lng,p_min_lat,p_max_lng,p_max_lat,4326))
          and ( (s.boost_until is not null and s.boost_until > now()) or s.visibility_score > 0 )
        order by
          (case when s.boost_until > now() then 999999 else s.visibility_score end) desc
        limit 60
      );

  else
    return query
      select
        s.id,
        s.name,
        st_y(s.location::geometry) as lat,
        st_x(s.location::geometry) as lng,
        s.pin_type,
        s.pin_metadata,
        s.visibility_score,
        s.is_verified,
        (s.verified_until is not null and s.verified_until > now()) as verified_active,
        (s.glow_until is not null and s.glow_until > now()) as glow_active,
        (s.boost_until is not null and s.boost_until > now()) as boost_active,
        (s.giant_until is not null and s.giant_until > now()) as giant_active,
        s.image_urls[1] as cover_image
      from public.shops s
      where s.status='active'
        and st_intersects(
          s.location::geometry,
          st_makeenvelope(p_min_lng,p_min_lat,p_max_lng,p_max_lat,4326)
        )
      limit 1000;
  end if;
end $$;
