---
phase: 12-map-load-optimization
plan: "001"
subsystem: ui
tags: [mapbox, performance, code-splitting, lazy-load, requestIdleCallback, prefetch]

# Dependency graph
requires:
  - phase: 11-production-hardening
    provides: SentientMap composable, frontendObservabilityService, map hot path

provides:
  - useSentientMap deferred to requestIdleCallback after map idle
  - useMapHeatmap, useWeather, useVibeEffects deferred to requestIdleCallback after map idle
  - Pin images deferred to idle + requestAnimationFrame (non-blocking)
  - Terrain source safety handler with deferred re-enable
  - Mapbox async chunk prefetch hint in index.html
  - Map interactive time measurement via Performance API

affects: [wave-2-network-optimization, wave-3-parse-eval, wave-4-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - requestIdleCallback with timeout for deferred composable loading
    - Nullable instance holder pattern for deferred composable APIs
    - Reactive ref proxy pattern (safe-default refs synced from deferred instances)
    - performance.mark/measure for map load baseline measurement

key-files:
  created: []
  modified:
    - src/components/map/MapboxContainer.vue
    - src/composables/map/useMapCore.js
    - public/index.html

key-decisions:
  - "Keep weatherCondition/isWeatherNight/activeVibeEffects as top-level Vue refs (null-safe defaults); sync from deferred instances via watchers — preserves useMapAtmosphere reactive bindings"
  - "Wrap heatmap/weather/vibe API functions as stub functions that null-check before delegating — zero call-site changes required"
  - "Use featureFlagStore.isEnabled() OR allowWeatherFx.value as deferred load gate — ensures weather loads when pref is on even without explicit flag"
  - "frontendObservabilityService.log() not available; use reportMapLifecycle() for map_load_performance metric instead"

patterns-established:
  - "Deferred composable pattern: remove static import → nullable instance holder → wrapper function stubs → requestIdleCallback init"
  - "Reactive ref proxy pattern: declare ref() with safe default → watch deferred instance property → update ref on change"

# Metrics
duration: 12min
completed: 2026-03-02
---

# Phase 12 Plan 001: Critical Path Only (Wave 1) Summary

**Deferred useSentientMap, useMapHeatmap, useWeather, useVibeEffects to requestIdleCallback after map idle — separating critical path (map render + pins) from non-critical features (sentient tracking, heatmap, weather, vibe effects)**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-02T09:20:00Z
- **Completed:** 2026-03-02T09:28:00Z
- **Tasks:** 6 / 6
- **Files modified:** 3

## Accomplishments

- All non-critical composables (useSentientMap, useMapHeatmap, useWeather, useVibeEffects) deferred until after first map idle event via requestIdleCallback
- Pin image loading deferred from blocking `load`/`style.load` to `idle` + `requestAnimationFrame`
- Terrain source missing warning eliminated by pre-checking on style.load and re-enabling after idle
- Mapbox async JS chunk added as low-priority prefetch hint in index.html
- Map interactive time baseline measurement added via Performance API (reported to observability service)

## Task Commits

Each task was committed atomically:

1. **Task 1.1: Defer useSentientMap** - `3509d65` (perf)
2. **Task 1.2: Defer useMapHeatmap, useWeather, useVibeEffects** - `8058b07` (perf)
3. **Task 1.3: Defer pin image loading to idle** - `aef3add` (perf)
4. **Task 1.4: Terrain source safety handler** - `12e64d3` (perf)
5. **Task 1.5: Mapbox chunk prefetch hint** - `321f2ba` (perf)
6. **Task 1.6: Map interactive time measurement** - `d6d9513` (perf)

## Files Created/Modified

- `src/components/map/MapboxContainer.vue` — Remove 3 blocking static imports; add deferred init for sentient/heatmap/weather/vibe; add terrain handler; add perf measurement
- `src/composables/map/useMapCore.js` — Move ensurePinImagesLoaded from load/style.load to idle + rAF
- `public/index.html` — Add rel=prefetch for Mapbox async chunk; add importance=low to events.mapbox.com preconnect

## Decisions Made

- Kept `weatherCondition`, `isWeatherNight`, `activeVibeEffects` as top-level Vue `ref()` with safe defaults (`null`, `false`, `[]`) so `useMapAtmosphere` and existing `watch()` calls remain unchanged. Deferred instances sync into these refs via watchers after loading.
- Wrapped `updateHeatmapData`, `addHeatmapLayer`, `removeHeatmapLayer`, `refreshWeather`, `triggerVibeEffect` as stub functions that null-check their instance before delegating — zero call-site changes across 10+ usage points.
- Used `frontendObservabilityService.reportMapLifecycle()` for performance reporting (the `.log()` method in the plan doesn't exist; `reportMapLifecycle` is the correct API).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] frontendObservabilityService.log() does not exist**
- **Found during:** Task 1.6 (map interactive time measurement)
- **Issue:** Plan references `frontendObservabilityService.log()` but service only exposes `reportMapLifecycle`, `reportServiceWorker`, `reportFrontendGuardrail`
- **Fix:** Used `reportMapLifecycle("map_load_performance", { duration })` instead
- **Files modified:** `src/components/map/MapboxContainer.vue`
- **Verification:** Build succeeds, no TypeScript errors
- **Committed in:** `d6d9513`

**2. [Rule 2 - Missing Critical] Added feature flag OR allowWeatherFx gate for weather deferred load**
- **Found during:** Task 1.2 (defer weather)
- **Issue:** Plan uses only `featureFlagStore.isEnabled("enable_map_weather")` but weather is also controlled by `allowWeatherFx` computed (based on user preferences). Without the OR gate, weather never loads for users who enabled it via prefs but have no feature flag set.
- **Fix:** Changed condition to `featureFlagStore.isEnabled("enable_map_weather") || allowWeatherFx.value`
- **Files modified:** `src/components/map/MapboxContainer.vue`
- **Committed in:** `8058b07`

---

**Total deviations:** 2 auto-fixed (1 Bug, 1 Missing Critical)
**Impact on plan:** Both auto-fixes required for correctness. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## Self-Check

## Self-Check: PASSED

Files verified:
- `src/components/map/MapboxContainer.vue` — exists, contains `initSentientMap`, `initDeferredFeatures`, `handleTerrainSourceOnStyleLoad`, `reportMapInteractiveTime` logic
- `src/composables/map/useMapCore.js` — exists, contains `scheduleNonCriticalInit` idle handler
- `public/index.html` — exists, contains `rel=prefetch` Mapbox chunk hint

Commits verified: `3509d65`, `8058b07`, `aef3add`, `12e64d3`, `321f2ba`, `d6d9513` — all present in `git log`

Build verified: `bun run build` completed with Total 4622.5 kB, no errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 1 complete: critical path separated from deferred features
- Wave 2 (network optimization) can proceed: focus on tile caching, request batching, CDN headers
- No blockers

---
*Phase: 12-map-load-optimization*
*Completed: 2026-03-02*
