---
phase: 0
phase_name: Core Map
current_plan: 2
total_plans: 2
status: COMPLETE
execution_started: 2026-03-02T22:06:54Z
execution_completed: 2026-03-03T08:40:00Z
executor_model: sonnet
---

# Execution State - Phase 0: Core Map

## Phase Status: COMPLETE

## Plans
- PLAN-001-backend-core.md (COMPLETE) — Summary: 0-001-SUMMARY.md
- PLAN-002-fe-maplibre.md (COMPLETE) — Summary: 0-002-SUMMARY.md

## Key Decisions

- VenuesResponse.total = total venues in bbox before limit clamp (NOT returned count)
- HotRoadSegment.path: min_length=2 enforced via Pydantic Field
- HotRoadSegment.intensity: Field(..., ge=0.0, le=1.0)
- HotRoadsResponse.unchanged=True when since= matches current snapshot_id
- Both /api/v1/* and /v1/* aliases wired in main.py
- snapshot_id: sha1[:16] of sorted segment IDs (deterministic, stateless)
- Supabase import via app.core.supabase (not app.core.database which does not exist)
- maplibre-gl is API-compatible drop-in for mapbox-gl (Marker/Popup/LngLatBounds/MercatorCoordinate identical)
- VITE_MAPBOX_TOKEN is now unused — remove from .env files; map works without token
- Map style URL driven by VITE_MAP_STYLE_URL env var; falls back to demotiles.maplibre.org
- shopService.getMapPins already implements API-first + RPC fallback + circuit breaker — no spec change needed
- Hot-roads polling fully implemented with all guardrails — 30s base, pause-hidden, 2x backoff to 120s

## Progress

[####################] 2/2 plans complete (100%)

## Performance Metrics

| Phase/Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|
| 0-001 Backend Core | ~6min | 3/3 | 3 |
| 0-002 FE MapLibre Swap | ~30min | 4/5 (T5 pre-impl) | 5 |

## Phase 0 Complete

Phase 0 deliverables:
1. GET /api/v1/venues — bbox-filtered venue pins with VenuesResponse schema
2. GET /api/v1/hot-roads — hotspot segments with snapshot dedup (unchanged=True shortcircuit)
3. Dual-alias routing: /api/v1/* and /v1/* both active
4. 8/8 pytest contract tests passing (monkeypatched Supabase, no network dependency)
5. maplibre-gl@4.7.1 replaces mapbox-gl — no access token, env-driven style URL
6. All map composables (useMapCore, MapboxContainer, useMapMarkers, WeatherLayer) use maplibre-gl
7. shopService.getMapPins: API-first /api/v1/venues with circuit-breaker + RPC fallback
8. Hot-roads polling: 30s base, pause-on-hidden, 2x backoff to 120s, diff-only via since=

Last session: 2026-03-03 — Stopped at: Completed Phase-0-PLAN-002 (PHASE COMPLETE)
