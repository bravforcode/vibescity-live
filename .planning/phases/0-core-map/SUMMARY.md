# Phase 0: Core Map — Executive Summary

**Status:** ✅ COMPLETE
**Date:** 2026-03-03
**Checkpoint:** Passed (BE, FE, E2E, Manual validation)

---

## Deliverables

### Wave 1: Backend Core APIs ✅
- **File:** `backend/app/api/routers/map_core.py`
  - 4 Pydantic models: VenuePin, VenuesResponse, HotRoadSegment, HotRoadsResponse
  - 2 endpoints: `GET /venues`, `GET /hot-roads`
  - Locked schemas (schema_version=1, total, snapshot_id, unchanged flag)

- **File:** `backend/app/main.py`
  - Dual-alias routing: `/api/v1/*` + `/v1/*`

- **File:** `backend/tests/test_map_core.py`
  - 8/8 pytest contract tests (monkeypatched Supabase, no network)

### Wave 2: Frontend MapLibre Swap ✅
- **File:** `package.json`
  - Removed: `mapbox-gl`
  - Added: `maplibre-gl@4.7.1`

- **Files:** `src/composables/map/useMapCore.js`, `MapboxContainer.vue`, `useMapMarkers.js`, `WeatherLayer.js`
  - Import swap: `mapbox-gl` → `maplibre-gl`
  - Removed: `mapboxgl.accessToken`, token guards
  - Added: env-driven style URL (VITE_MAP_STYLE_URL)
  - Added: `/hot-roads` polling (30s base, pause-on-hidden, backoff, diff-only)

- **File:** `src/services/shopService.js`
  - Primary: `GET /api/v1/venues`
  - Fallback: Supabase RPC `get_map_pins`

---

## Validation Results

| Component | Command | Result |
|-----------|---------|--------|
| **Backend** | `cd backend && pytest tests/test_map_core.py -v` | ✅ 8/8 PASS |
| **Frontend** | `bun run check` | ✅ 0 errors |
| **Contract** | `curl -f http://localhost:8001/api/v1/venues?bbox=...` | ✅ 200 OK, schema correct |
| **E2E Smoke** | `bun run test:e2e:smoke` | ✅ 6 passed, 15 skipped (map-dependent Phase 1) |
| **Manual** | Browser load + 3min pan/zoom/rotate | ✅ PASS (no hang/crash) |

---

## Key Decisions (Locked)

1. **Dual Alias Strategy:** Both `/api/v1` and `/v1` supported (roadmap alignment)
2. **Schema Versioning:** `schema_version: 1` in all responses (future breaking changes)
3. **Hot-roads Polling:** 30s base interval with smart backoff (offline/low-power detection)
4. **Style URL:** Environment-driven + fallback to demotiles (safe public default)
5. **Fallback Pattern:** API-first, then RPC (fail-open architecture)

---

## Commits

1. `dc8bb22` — feat(0-001): create map_core router with venues + hot-roads endpoints
2. `e6b75c0` — feat(0-001): wire map_core dual-alias in main.py
3. `91afacf` — test(0-001): add 8 contract tests for map_core endpoints
4. `19201d9` — docs(0-001): complete backend-core plan — Phase 0 COMPLETE
5. `ec6a4d3` — chore(0-002): swap mapbox-gl → maplibre-gl@4.7.1 in package.json
6. `1977dd9` — feat(0-002): swap useMapCore to maplibre-gl, env-driven style URL
7. `ca48c67` — feat(0-002): swap MapboxContainer to maplibre-gl, remove token guards
8. `1d793ba` — feat(0-002): swap useMapMarkers + WeatherLayer import to maplibre-gl
9. `eb6c861` — docs(0-002): complete fe-maplibre plan — Phase 0 COMPLETE

---

## Next Phase (Phase 1+)

- Performance tuning: WebGL async chunk loading, playwright timeout adjustment
- Hot-roads canonical road-segment feed (hotspot-derived v0 acceptable for now)
- Map animation performance (reduce-motion compliance verified)
- E2E @map-required tests (WebGL stability tuning)

---

## Notes

- **PII Audit service error:** External to Phase 0 (Supabase Edge Function connectivity)
- **VITE_MAP_STYLE_URL:** Must be set in production (not relying on demotiles)
- **WebGL warning:** Gracefully handled by E2E tests (skip @map-required, allow Phase 1 optimization)
