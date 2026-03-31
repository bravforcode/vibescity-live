-- 1. Enable PostGIS Extension
create extension if not exists postgis;

-- 2. Add Spatial Index (Critical for performance)
create index if not exists shops_geo_index
  on shops
  using GIST (st_setsrid(st_makepoint(longitude, latitude), 4326));

-- 3. RPC: Get Nearby Shops (Distance-based)
create or replace function get_nearby_shops(
  lat_param double precision,
  lng_param double precision,
  radius_meters int default 5000,
  filter_categories text[] default null
)
returns setof shops
language sql
as $$
  select *
  from shops
  where
    -- Spatial Filter (using Index)
    st_dwithin(
      st_setsrid(st_makepoint(longitude, latitude), 4326)::geography,
      st_setsrid(st_makepoint(lng_param, lat_param), 4326)::geography,
      radius_meters
    )
    -- Optional Category Filter
    and (filter_categories is null or category = any(filter_categories))
  order by
    -- Order by Distance
    st_distance(
      st_setsrid(st_makepoint(longitude, latitude), 4326)::geography,
      st_setsrid(st_makepoint(lng_param, lat_param), 4326)::geography
    ) asc;
$$;

-- 4. RPC: Get Shops in Bounds (Viewport-based)
create or replace function get_shops_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision
)
returns setof shops
language sql
as $$
  select *
  from shops
  where
    latitude between min_lat and max_lat
    and longitude between min_lng and max_lng;
$$;
