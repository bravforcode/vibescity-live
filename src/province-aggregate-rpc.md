# Province Aggregate RPC

## Goal

Replace province-level giant pin aggregation in the client with a dedicated Supabase RPC that returns province aggregate payloads directly.

## Scope

- Add a new SQL RPC in `supabase/migrations`
- Update frontend map pin fetching to use the new RPC only for province render level
- Scope province aggregates to the current filtered venue set so category/status filtering stays intact
- Keep zone/detail behavior unchanged
- Keep drill-down behavior unchanged

## Phase 2

- Decouple province giant pins from `get_feed_cards()` so province mode can render nationwide aggregates even when the v2 feed only hydrates a local subset
- Keep the fast feed/card subset behavior for `visibleShops`
- Resolve province aggregate IDs on demand from the store for active category/status filters
- Avoid showing a misleading local-only instant fallback while province aggregates are loading

## Phase 3

- Optimize `get_map_province_aggregates(uuid[])` so nationwide `p_venue_ids = null` requests do not hit the remote statement timeout
- Replace expensive province aggregate fields with cheap deterministic defaults where the map does not need per-venue sorting
- Verify browser-level province zoom and category filters against the real Supabase project, not just direct RPC smoke tests

## Phase 4

- Remove client-side province `venueIds` hydration for category/status filter switches
- Route baseline province mode to the proven nationwide RPC and filtered province mode to a new direct-filter RPC
- Verify browser-level province filtering now sends compact RPC params (`p_categories` / `p_statuses`) instead of giant `p_venue_ids` arrays

## Why

- Province counts should not depend on client-side pin lists
- Province aggregation should not be limited by generic map pin result caps
- Province label/count/center should come from a deterministic server payload

## Success Criteria

- Province zoom level fetches aggregate rows directly from the database
- Province RPC respects the same filtered venue scope the map already uses
- Client renders province giant pins from aggregate payload without re-aggregating shops
- Zone and detail levels still use the existing `get_map_pins` path
- Existing map interactions and drill-down continue to work

## Risks

- SQL must match current `venues` schema and status conventions
- Province naming normalization can split aggregates if source values are inconsistent
- Generic fallback still depends on local shops if the new RPC fails
- Client-side ID hydration for filtered province mode can be expensive on first use and should be cached
