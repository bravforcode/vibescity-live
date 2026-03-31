---
phase: 01-neon-map-redesign-performance
plan: "01"
subsystem: ui
tags: [mapbox, performance, geojson, vue3]

# Dependency graph
requires: []
provides:
  - "fadeDuration: 0 in Mapbox Map constructor (no white-flash on tile swap)"
  - "Conditional antialias based on hardwareConcurrency > 4 (GPU-safe on low-end devices)"
  - "Neon roads GeoJSON deferred to map idle event (unblocks map ready signal)"
  - "Deleted unused chiangmai-main-roads.geojson (12MB, never git-tracked)"
affects:
  - "01-02"
  - "01-03"
  - "01-04"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fadeDuration: 0 pattern for flicker-free Mapbox tile swaps"
    - "map.once('idle', ...) for deferring heavy GeoJSON layer setup"
    - "Conditional antialias: navigator.hardwareConcurrency > 4 guard"

key-files:
  created: []
  modified:
    - src/composables/map/useMapCore.js
    - src/composables/map/useMapLayers.js

key-decisions:
  - "fadeDuration: 0 eliminates white-flash; zero visual regression since tiles load same speed"
  - "antialias conditioned on hardwareConcurrency > 4 — avoids forcing GPU MSAA on phones with 4 or fewer cores"
  - "Defer neon roads to once('idle') not 'style.load' — 3.9MB GeoJSON parse should not delay map ready signal"
  - "chiangmai-main-roads.geojson was never git-tracked (untracked); deleted from disk only"

patterns-established:
  - "Deferred GeoJSON: always use map.once('idle') for non-critical overlay data"
  - "Conditional GPU features: check navigator.hardwareConcurrency before enabling GPU-intensive options"

# Metrics
duration: 8min
completed: 2026-03-21
---

# Phase 1 Plan 01: Load-Time Bottleneck Fixes Summary

**fadeDuration:0 eliminates tile-swap flicker, neon roads GeoJSON deferred to idle unblocks map ready, 12MB unused file removed from disk**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-21T08:52:01Z
- **Completed:** 2026-03-21T09:00:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `fadeDuration: 0` added to Mapbox Map constructor — prevents white-flash/flicker when tiles swap on load or style change
- `antialias` changed from `true` to `typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) > 4` — avoids forcing GPU MSAA on low-end devices (phones with 4 or fewer CPU cores)
- `addNeonRoads()` source+layer additions wrapped in `map.value.once('idle', ...)` — 3.9MB GeoJSON parse now deferred after map is ready, no longer blocking initial load
- `chiangmai-main-roads.geojson` (12MB, never git-tracked, unused) deleted from disk

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix map init options — fadeDuration and conditional antialias** - `aec8d19` (perf)
2. **Task 2: Defer neon roads GeoJSON load to map idle + delete unused 12MB file** - already in HEAD via prior session commits

## Files Created/Modified

- `src/composables/map/useMapCore.js` — Added `fadeDuration: 0` and conditional `antialias` to Map constructor
- `src/composables/map/useMapLayers.js` — Wrapped `addNeonRoads` body in `map.value.once('idle', ...)` deferred callback

## Decisions Made

- Used `fadeDuration: 0` (not a small value like 100) — complete elimination of transition delay is correct for a map that should feel instant
- Condition uses `?? 4` fallback for environments where `hardwareConcurrency` is undefined (SSR, old browsers) — defaults to disabled, which is the safer choice
- Guard checks (`getSource("neon-roads")`) kept outside the idle callback to prevent duplicate idle listener registration, with a second guard inside for the deferred double-check

## Deviations from Plan

None — plan executed exactly as written.

Note: Task 2 changes to `useMapLayers.js` were already present in HEAD from a prior session (commit `d5899db`). The edit was a no-op on the working tree. The deletion of `chiangmai-main-roads.geojson` was performed from disk (file was never git-tracked).

## Issues Encountered

- `chiangmai-main-roads.geojson` was never committed to git (untracked), so `git rm` was not applicable — the file was simply removed from disk with `rm`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Map init is now flicker-free and GPU-safe on all device tiers
- Neon roads load asynchronously after map is interactive — ready for visual styling work in plans 02-04
- All success criteria verified: fadeDuration present, hardwareConcurrency conditional in place, once('idle') deferred load active, 12MB file gone, build passes

## Self-Check: PASSED

- FOUND: src/composables/map/useMapCore.js (contains fadeDuration: 0, conditional antialias)
- FOUND: src/composables/map/useMapLayers.js (contains map.value.once('idle', ...))
- FOUND: .planning/phases/01-neon-map-redesign-performance/01-01-SUMMARY.md
- CONFIRMED: public/data/chiangmai-main-roads.geojson deleted from disk
- FOUND: public/data/chiangmai-main-roads-lanes.geojson intact
- FOUND: commit aec8d19 (Task 1 — fadeDuration + conditional antialias)

---
*Phase: 01-neon-map-redesign-performance*
*Completed: 2026-03-21*
