---
phase: 0-core-map
plan: "001"
subsystem: api
tags: [fastapi, pydantic, supabase, pytest, map, venues, hot-roads]

# Dependency graph
requires: []
provides:
  - GET /api/v1/venues with bbox/zoom/limit params and VenuesResponse schema
  - GET /api/v1/hot-roads with bbox/since params and HotRoadsResponse schema
  - Dual-alias routing: /api/v1/* and /v1/* both active
  - 8 monkeypatched pytest contract tests (no network dependency)
affects: [frontend-map-integration, phase-1-map-features, future-map-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - bbox validation via _parse_bbox helper (HTTPException 400 on invalid)
    - snapshot_id as sha1[:16] of sorted segment IDs (deterministic, stateless)
    - unchanged=True shortcircuit when since= matches snapshot_id
    - Supabase accessor via lazy import _get_supabase() (testable via monkeypatch)
    - total = count before limit clamp (VenuesResponse contract)

key-files:
  created:
    - backend/app/api/routers/map_core.py
    - backend/tests/test_map_core.py
  modified:
    - backend/app/main.py

key-decisions:
  - "VenuesResponse.total = total venues in bbox before limit clamp (NOT returned count)"
  - "HotRoadSegment.path: min_length=2 enforced via Pydantic Field"
  - "HotRoadSegment.intensity: Field(..., ge=0.0, le=1.0)"
  - "HotRoadsResponse.unchanged=True when since= matches current snapshot_id"
  - "Both /api/v1/* and /v1/* aliases wired in main.py"
  - "snapshot_id: sha1[:16] of sorted segment IDs (deterministic, stateless)"
  - "Supabase import via app.core.supabase (not app.core.database which does not exist)"

patterns-established:
  - "bbox-parse pattern: _parse_bbox() returns (mn_lng, mn_lat, mx_lng, mx_lat) or raises HTTPException(400)"
  - "snapshot dedup: sha1[:16] of JSON-sorted IDs, since= comparison for unchanged shortcircuit"
  - "test isolation: monkeypatch _get_supabase module-level function, FakeSupabase._FakeRPC chain"

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 0 Plan 001: Backend Core APIs Summary

**FastAPI map_core router with /venues + /hot-roads endpoints, locked Pydantic schemas, dual-alias routing (/api/v1 + /v1), and 8 monkeypatched pytest contract tests (8/8 passing)**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-02T22:06:54Z
- **Completed:** 2026-03-02T22:12:54Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments
- Created `map_core.py` with all 4 locked Pydantic models (VenuePin, VenuesResponse, HotRoadSegment, HotRoadsResponse) and 2 endpoints
- Wired dual-alias routing in `main.py`: `/api/v1/venues`, `/api/v1/hot-roads`, `/v1/venues`, `/v1/hot-roads` all active
- 8/8 contract tests passing with full Supabase monkeypatching (no external network)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create map_core router** - `dc8bb22` (feat)
2. **Task 2: Wire dual-alias in main.py** - `e6b75c0` (feat)
3. **Task 3: Contract tests (8/8 passing)** - `91afacf` (test)

## Files Created/Modified
- `backend/app/api/routers/map_core.py` - 4 Pydantic models + 2 endpoints + bbox parser + snapshot_id logic
- `backend/app/main.py` - Added map_core import + 2 include_router calls (dual-alias)
- `backend/tests/test_map_core.py` - 8 contract tests with FakeSupabase monkeypatching

## Decisions Made
- Supabase import uses `app.core.supabase` (existing module) — plan referenced `app.core.database` which does not exist
- All 6 locked schema decisions honored exactly as specified in locked_decisions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected Supabase import path**
- **Found during:** Task 1 (creating map_core.py)
- **Issue:** Plan specified `from app.core.database import get_supabase_client` but `app.core.database` does not exist. Actual client is `supabase` in `app.core.supabase`.
- **Fix:** `_get_supabase()` uses `from app.core.supabase import supabase`
- **Files modified:** `backend/app/api/routers/map_core.py`
- **Verification:** Tests pass with monkeypatched module
- **Committed in:** `dc8bb22` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed FastAPI deprecated `example` parameter**
- **Found during:** Task 3 verification (test run warning)
- **Issue:** `Query(..., example=...)` is deprecated in FastAPI; should use `examples=[...]`
- **Fix:** Changed to `examples=["100.5,13.5,101.0,14.0"]`
- **Files modified:** `backend/app/api/routers/map_core.py`
- **Verification:** Warning gone, 8/8 tests still pass
- **Committed in:** `91afacf` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking import, 1 deprecation bug)
**Impact on plan:** Both required for correct operation. No scope creep.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/api/v1/venues` and `/api/v1/hot-roads` are contract-stable and ready for frontend integration
- Both aliases (`/api/v1/*` and `/v1/*`) active
- Tests provide regression coverage for schema changes
- Supabase RPCs (`get_map_pins`, `get_hotspot_segments`) still need to be created in the DB schema

---
*Phase: 0-core-map*
*Completed: 2026-03-02*

## Self-Check: PASSED

- backend/app/api/routers/map_core.py — FOUND
- backend/tests/test_map_core.py — FOUND
- .planning/phases/0-core-map/0-001-SUMMARY.md — FOUND
- commit dc8bb22 — FOUND
- commit e6b75c0 — FOUND
- commit 91afacf — FOUND
