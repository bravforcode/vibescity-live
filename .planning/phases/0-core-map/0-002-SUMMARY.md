---
phase: 0-core-map
plan: "002"
subsystem: ui
tags: [maplibre-gl, mapbox-gl, map, vue3, env-config, hot-roads, shop-service]

requires:
  - phase: 0-001
    provides: GET /api/v1/venues and GET /api/v1/hot-roads backend endpoints

provides:
  - maplibre-gl@4.7.1 replaces mapbox-gl (no access token required)
  - Env-driven map style: VITE_MAP_STYLE_URL > VITE_MAP_STYLE_FALLBACK_URL > demotiles fallback
  - Hot-roads polling with 30s base, pause-on-hidden, 2x backoff to 120s, diff-only via since= param
  - shopService.getMapPins: API-first /api/v1/venues with Supabase RPC fallback + circuit breaker

affects:
  - All map composables (useMapAtmosphere, useMapLayers, useMapPopups, useMapRealtime, useSentientMap)
  - Any feature consuming VITE_MAPBOX_TOKEN (now unused — remove from .env.* files)
  - E2E tests checking map initialization

tech-stack:
  added:
    - maplibre-gl@4.7.1 (replaces mapbox-gl — same Marker/Popup/LngLatBounds/MercatorCoordinate API)
  patterns:
    - No access token required for MapLibre GL — remove all pk.* token references
    - Style URL via VITE_MAP_STYLE_URL env var (not hardcoded mapbox:// URL)
    - mapboxgl CSS class names (.mapboxgl-popup, .mapboxgl-ctrl-*) unchanged — MapLibre uses same names

key-files:
  created: []
  modified:
    - package.json — mapbox-gl removed, maplibre-gl@^4.7.0 retained, lockfile updated to 4.7.1
    - src/composables/map/useMapCore.js — maplibre-gl import, env-driven MAP_STYLE constant, no token
    - src/components/map/MapboxContainer.vue — maplibre import, removed MAPBOX_TOKEN/sanitizeEnvToken, style constants from env
    - src/composables/map/useMapMarkers.js — import swap only
    - src/components/map/layers/WeatherLayer.js — import swap only (MercatorCoordinate preserved)

key-decisions:
  - "maplibre-gl is API-compatible drop-in: Marker, Popup, LngLatBounds, MercatorCoordinate APIs identical"
  - "VITE_MAPBOX_TOKEN is now unused — safe to remove from .env files; map still works without it"
  - "Task 5 (shopService.getMapPins) was already fully implemented with API-first + RPC fallback + circuit breaker — no code change needed"
  - "Hot-roads polling was already fully implemented in MapboxContainer.vue with all required guardrails — no change needed"
  - "mapboxgl.setTelemetryEnabled removed — MapLibre has no telemetry to opt out of"

duration: ~30min
completed: "2026-03-03"
---

# Phase 0 Plan 002: FE MapLibre Swap + API Wiring Summary

**mapbox-gl replaced with maplibre-gl@4.7.1 across all map files — no access token, env-driven style URL, clean bundle build**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-03T08:10:00Z
- **Completed:** 2026-03-03T08:40:00Z
- **Tasks:** 5 (4 with code changes + 1 already implemented)
- **Files modified:** 5

## Accomplishments

- mapbox-gl fully removed from bundle (verified via dist scan — only 2 string references remain: a Tailwind CSS class and a GitHub issue URL, not library code)
- All `mapboxgl.` references replaced with `maplibregl.` across 4 source files
- Access token logic removed entirely from useMapCore.js and MapboxContainer.vue
- Style URL now driven by VITE_MAP_STYLE_URL env var with safe public demotiles.maplibre.org fallback
- `bun run check` and `bun run build` pass cleanly with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: package.json + lockfile** - `ec6a4d3` (chore)
2. **Task 2: useMapCore.js** - `1977dd9` (feat)
3. **Task 3: MapboxContainer.vue** - `ca48c67` (feat)
4. **Task 4: useMapMarkers.js + WeatherLayer.js** - `1d793ba` (feat)
5. **Task 5: shopService.js** - No commit needed (already implemented)

## Files Created/Modified

- `package.json` — maplibre-gl@4.7.1 in lockfile, mapbox-gl removed
- `src/composables/map/useMapCore.js` — maplibre import, CSS import, env MAP_STYLE constant, no token init
- `src/components/map/MapboxContainer.vue` — maplibre import, removed token guard, env style constants, removed telemetry call
- `src/composables/map/useMapMarkers.js` — import swap only: mapbox-gl → maplibre-gl
- `src/components/map/layers/WeatherLayer.js` — import swap only: mapboxgl.MercatorCoordinate → maplibregl.MercatorCoordinate

## Decisions Made

- Used the same `mapboxgl` CSS class names in MapboxContainer.vue (`.mapboxgl-popup`, `.mapboxgl-ctrl-*`) — MapLibre renders the same class names, so no CSS changes needed
- Removed `if (!mapboxgl?.accessToken) return` guard from the directions proxy call — MapLibre has no accessToken; the guard was preventing route drawing unnecessarily
- E2E skip condition simplified from `IS_E2E && !IS_STRICT_MAP_E2E && !token` to `IS_E2E && !IS_STRICT_MAP_E2E` — token is no longer relevant

## Deviations from Plan

### Pre-implemented Tasks (Not Bugs — Already Correct)

**1. Task 5 — shopService.getMapPins already fully implemented**
- **Found during:** Task 5 review
- **Issue:** None — existing code already implements API-first (/api/v1/venues via apiFetch with getApiV1BaseUrl base), catches errors, falls back to Supabase RPC get_map_pins, and returns identical shape
- **Additional:** Existing implementation exceeds plan spec: circuit breaker (3 failures → backoff), AbortSignal threading, last-good-pins cache, and schema cache error handling
- **Action:** No code change made — locked decision #7 (return shape identical) already satisfied
- **Committed in:** N/A (no change)

**2. Hot-roads polling in MapboxContainer.vue already fully implemented**
- **Found during:** Task 3 review
- **Issue:** None — existing code has `pollHotRoads`, `scheduleHotRoadPoll`, `buildHotRoadBboxParam`, `computeHotRoadPollInterval`, and all guardrails from locked decisions (30s base, pause hidden, 2x backoff to 120s, since= diff-only)
- **Action:** No code change made — locked decisions #4 and #5 already satisfied
- **Committed in:** N/A (no change)

---

**Total deviations:** 2 pre-implemented (plan spec already met by existing production code)
**Impact on plan:** Zero scope change. Existing code was more robust than spec required.

## Issues Encountered

- Git permission error on first commit of Task 2 — resolved with `git gc --prune=now`

## User Setup Required

**VITE_MAPBOX_TOKEN is now unused.** Remove it from `.env`, `.env.local`, `.env.production.local` files. Map will initialize without it.

Required env vars for map to render tiles:
- `VITE_MAP_STYLE_URL` — your MapLibre-compatible style URL (e.g., from MapTiler, Stadia, or self-hosted)
- `VITE_MAP_STYLE_FALLBACK_URL` — optional secondary fallback
- If neither set, map falls back to `https://demotiles.maplibre.org/style.json` (basic demo tiles, sufficient for development)

## Next Phase Readiness

- All map composables use maplibre-gl — ready for MapLibre-specific feature work (e.g., PMTiles, custom projections)
- Backend /api/v1/venues and /api/v1/hot-roads from Phase 0-001 are wired and active
- Map style URL must be configured in env for production tile rendering

---
*Phase: 0-core-map*
*Completed: 2026-03-03*
