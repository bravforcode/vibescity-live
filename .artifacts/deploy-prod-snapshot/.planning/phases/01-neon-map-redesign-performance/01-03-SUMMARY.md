---
phase: 01-neon-map-redesign-performance
plan: "03"
subsystem: ui
tags: [vue, mapbox, cyberpunk, animation, css, location]

# Dependency graph
requires: []
provides:
  - YouAreHere.vue pulsing blue location dot overlay component
  - setCyberpunkAtmosphere hardened to fire on every style.load event
affects:
  - Plan 04 (any plan building on user location or map atmosphere)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS-only animation with scale+opacity keyframes (no box-shadow animation) for GPU compositing"
    - "prefers-reduced-motion: reduce guard on all map overlay animations"
    - "Absolute overlay components inside map shell use pointer-events:none + z-index layering"

key-files:
  created:
    - src/components/ui/YouAreHere.vue
  modified:
    - src/components/map/MapboxContainer.vue

key-decisions:
  - "YouAreHere positioned at left:50% top:65% (sweet-spot thumb zone) without map.project() — coordinate projection deferred to Plan 02"
  - "setCyberpunkAtmosphere called at START of handleMapStyleLoad so dark atmosphere applies on theme switches, not just initial load"
  - "YouAreHere uses v-show (not v-if) internally so DOM is created once — guard lives in MapboxContainer v-if"

patterns-established:
  - "Pattern: map overlay components are sync imports (not async) — zero loading delay for UI affordances"
  - "Pattern: handleMapStyleLoad always re-applies atmosphere as first action before any layer rebuild"

# Metrics
duration: 10min
completed: 2026-03-21
---

# Phase 01 Plan 03: YouAreHere Dot + Atmosphere Hardening Summary

**CSS pulsing YOU ARE HERE dot overlay at thumb-zone position, setCyberpunkAtmosphere wired into every style.load event for reliable dark neon base**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-21T08:44:00Z
- **Completed:** 2026-03-21T08:54:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `YouAreHere.vue` with pulsing blue (#00bfff) outer ring using scale+opacity keyframes (no box-shadow animation), 14px inner dot with white center, and cyan monospace label
- Added `prefers-reduced-motion: reduce` guard that disables the outer ring animation
- Imported YouAreHere into MapboxContainer and rendered it at `left:50%; top:65%` when `userLocation` prop is set and map is ready
- Added `setCyberpunkAtmosphere()` call at start of `handleMapStyleLoad` so dark background fires reliably on both initial load and every style.load event (e.g., dark/light theme switch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create YouAreHere.vue** - `d624035` (feat)
2. **Task 2: Wire YouAreHere into MapboxContainer + harden atmosphere** - `d5899db` (feat)

## Files Created/Modified

- `src/components/ui/YouAreHere.vue` - New pulsing blue location dot component, CSS-only, pointer-events:none
- `src/components/map/MapboxContainer.vue` - Added YouAreHere import, template v-if mount, setCyberpunkAtmosphere in handleMapStyleLoad

## Decisions Made

- Positioned dot at fixed `left:50%; top:65%` viewport coordinates — avoids needing `map.project()` which requires map coordinate data (deferred to Plan 02)
- Used `v-if` guard in MapboxContainer (not just `v-show`) — component is not mounted at all unless both `userLocation` and `isMapReady` are truthy, preventing any layout cost before map is ready
- setCyberpunkAtmosphere already existed in `setupMapLayers` (initial load path); added second call in `handleMapStyleLoad` so style switch path is also covered

## Deviations from Plan

None — plan executed exactly as written. Both existing call site (line 1081) and new call site in `handleMapStyleLoad` are now present, matching the plan's specification.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- YouAreHere.vue is ready to receive dynamic positioning via `map.project(userLocation)` in a future plan
- setCyberpunkAtmosphere is now idempotent and safe to call on every style.load — no risk of double-application
- Build passes clean (`bun run build` exits 0)

---
*Phase: 01-neon-map-redesign-performance*
*Completed: 2026-03-21*
