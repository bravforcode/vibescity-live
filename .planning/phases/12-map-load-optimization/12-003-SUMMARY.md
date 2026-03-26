---
phase: 12-map-load-optimization
plan: "003"
subsystem: ui
tags: [mapbox, performance, code-splitting, dynamic-import, requestIdleCallback, Image.decode, parse-eval]

# Dependency graph
requires:
  - phase: 12-map-load-optimization
    plan: "002"
    provides: useMapIdleFeatures idle task queue (scheduleIdleTask/executeIdleTasksOnce), addCriticalLayers/addDeferredLayers split, single-fire style mutation guards

provides:
  - useDollyZoom async-loaded via idle queue (removed from main chunk parse budget)
  - useSDFClusters + useFluidOverlay pre-warmed via dynamic import (separate async chunks)
  - Consolidated idle task queue: all deferred init flows through scheduleIdleTask
  - prefetchCriticalPins() export in useMapImagePrefetch: Image.decode() pin sprite preloader
  - window.__mapMetrics: parseOverhead, setupStart, setupEnd, interactiveAt instrumentation

affects: [wave-4-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pre-warm pattern: start dynamic import promise at setup scope, call composable synchronously from onMounted once resolved
    - Idle task queue consolidation: all deferred init registered via scheduleIdleTask at setup time, flushed once via executeIdleTasksOnce on first idle
    - Image.decode() prefetch: non-blocking pin sprite pre-decode before map.init()
    - window.__mapMetrics instrumentation: parse overhead + interactive time telemetry

key-files:
  created: []
  modified:
    - src/components/map/MapboxContainer.vue
    - src/composables/map/useMapImagePrefetch.js

key-decisions:
  - "useDollyZoom async via scheduleIdleTask: no onUnmounted = safe to load from idle callback; godTierZoomTo falls back to no-op until loaded (non-critical first-tap)"
  - "useSDFClusters + useFluidOverlay: both call onUnmounted internally which requires Vue component instance context. Cannot be called after await boundary. Solution: pre-warm chunks as module promises at setup scope, resolve in .then() from onMounted context"
  - "Tasks 3.2+3.3 committed together: both use same pre-warm pattern and same init function (initGodTierLayers)"
  - "prefetchCriticalPins exported as named module export (not composable method) — stateless, no Vue deps, callable before setup completes"
  - "Idle queue consolidation: scheduleIdleTask replaces 4 direct requestIdleCallback calls in first-idle handler; executeIdleTasksOnce is now the only dispatch"

patterns-established:
  - "Pre-warm + sync-call pattern: const _chunkPromise = import('./module').catch(() => null); then onMounted callback calls composable after .then() resolves"
  - "Named module export prefetch: stateless utility functions exported at module level (not composable scope) for pre-setup invocation"
  - "window.__mapMetrics accumulator: all map timing data written to single global object for DevTools/observability inspection"

# Metrics
duration: 15min
completed: 2026-03-02
---

# Phase 12 Plan 003: Parse/Eval Optimization (Wave 3) Summary

**Removed useDollyZoom/useSDFClusters/useFluidOverlay from main chunk via dynamic import pre-warm, consolidated all idle tasks into scheduleIdleTask queue, and added Image.decode() pin prefetch + window.__mapMetrics instrumentation**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-02T10:06:14Z
- **Completed:** 2026-03-02T10:21:00Z
- **Tasks:** 5 / 6 (Tasks 3.2+3.3 committed together)
- **Files modified:** 2 (1 modified engine composable + MapboxContainer)

## Accomplishments

- `useDollyZoom`, `useSDFClusters`, `useFluidOverlay` removed from static top-level imports — now in separate async chunks, reducing main map chunk parse budget
- Idle task queue fully consolidated: `scheduleIdleTask` now holds all deferred init (sentient map, heatmap/weather/vibe, deferred layers, terrain, dolly zoom); first-idle handler calls only `executeIdleTasksOnce`
- `prefetchCriticalPins()` added to `useMapImagePrefetch.js` using `Image.decode()` API — starts in setup scope before `map.init()` to prime browser decode cache for pin sprites
- `window.__mapMetrics` instrumentation: `parseOverhead`, `setupStart`, `setupEnd`, `interactiveAt` — accessible from DevTools console for Lighthouse baseline tracking
- Build passes at 4627.4 kB total (engine composables now in async chunks visible in dist output)

## Task Commits

Each task was committed atomically:

1. **Task 3.1: Async-import useDollyZoom via idle queue** - `c314aca` (perf)
2. **Tasks 3.2+3.3: Pre-warm SDF/Fluid chunks via dynamic import** - `6541df6` (perf)
3. **Task 3.4: Consolidate all idle tasks into scheduleIdleTask queue** - `98c5754` (perf)
4. **Task 3.5: Add prefetchCriticalPins() with Image.decode() API** - `6ea0e15` (perf)
5. **Task 3.6: Add parse/eval instrumentation to window.__mapMetrics** - `50b0d6b` (perf)

## Files Created/Modified

- `src/components/map/MapboxContainer.vue` — Remove 3 static engine imports; add dynamic import pre-warm; consolidate idle task queue; call prefetchCriticalPins() early; add window.__mapMetrics write
- `src/composables/map/useMapImagePrefetch.js` — Add CRITICAL_PIN_IMAGES, _decodePinImage(), prefetchCriticalPins() as named export

## Decisions Made

- **useDollyZoom via scheduleIdleTask (safe)**: `useDollyZoom` has no internal `onUnmounted` call, making it safe to load from an idle callback (no Vue lifecycle context needed). `godTierZoomTo` uses optional chaining as a no-op fallback until the module loads.

- **useSDFClusters/useFluidOverlay via pre-warm pattern (architectural constraint)**: Both composables call `onUnmounted` internally. Vue 3 loses `getCurrentInstance()` after any `await` boundary, meaning we cannot call these composables after an async gap from a lifecycle hook. The solution: start `import()` promises at module scope (no await), then call the composables synchronously inside a `.then()` from `onMounted` context. This removes modules from the main chunk while preserving Vue lifecycle correctness.

- **Tasks 3.2+3.3 batched**: Both use the identical pre-warm pattern and share `initGodTierLayers`. Committed together for clarity.

- **prefetchCriticalPins as named module export**: Since the function is stateless and has no Vue dependencies, it's exported at module level rather than from the composable factory. This allows calling it before component setup is fully initialized.

- **Idle queue consolidation**: All 4 direct `requestIdleCallback()` calls in the first-idle handler replaced by pre-registered `scheduleIdleTask()` calls. The handler now calls only `executeIdleTasksOnce(map.value)`. This gives Wave 2's idle task infrastructure its intended purpose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useSDFClusters/useFluidOverlay cannot be called after await (Vue lifecycle constraint)**
- **Found during:** Tasks 3.2+3.3
- **Issue:** Plan's pattern `const [sdfMod, fluidMod] = await Promise.all([...])` followed by calling `sdfMod.useSDFClusters(m)` would lose Vue's component instance context after the `await`. Both composables call `onUnmounted` internally, which requires active component instance. This would cause silent cleanup failures on unmount.
- **Fix:** Pre-warm: start import promises at module scope (setup time, synchronous), then call composables in `.then()` callback from `onMounted`. This keeps the import requests parallel but calls composables synchronously once chunks resolve.
- **Files modified:** `src/components/map/MapboxContainer.vue`
- **Verification:** Build succeeds, no Vue lifecycle warnings expected
- **Committed in:** `6541df6` (Tasks 3.2+3.3 commit)

**2. [Rule 1 - Bug] scheduleIdleTask(initDollyZoom) called before initDollyZoom defined**
- **Found during:** Task 3.1 (post-check)
- **Issue:** `const` is not hoisted — placing `scheduleIdleTask(initDollyZoom)` at line 862 while `initDollyZoom` is defined at line 2655 caused a Biome error
- **Fix:** Moved `scheduleIdleTask(initDollyZoom)` to after `godTierZoomTo` definition (same block as the other `scheduleIdleTask` calls in Task 3.4)
- **Files modified:** `src/components/map/MapboxContainer.vue`
- **Verification:** Biome check passes (Checked 265 files, No fixes applied)
- **Committed in:** `98c5754` (Task 3.4 commit, consolidated)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug: Vue lifecycle context + hoisting constraint)
**Impact on plan:** Both fixes necessary for correctness. Delivered all plan objectives with equivalent or better result than plan's pseudocode.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## Self-Check

Files verified:
- `src/components/map/MapboxContainer.vue` — no static import for useDollyZoom/useSDFClusters/useFluidOverlay; contains `_sdfChunkPromise`, `_fluidChunkPromise`, `initDollyZoom`, `scheduleIdleTask(initDollyZoom)`, `void prefetchCriticalPins()`, `window.__mapMetrics.parseOverhead`, `window.__mapMetrics.interactiveAt`
- `src/composables/map/useMapImagePrefetch.js` — contains `CRITICAL_PIN_IMAGES`, `_decodePinImage`, `export const prefetchCriticalPins`

Commits verified: `c314aca`, `6541df6`, `98c5754`, `6ea0e15`, `50b0d6b` — all present in git log

Build verified: `bun run build` completes with Total 4627.4 kB, no errors.

## Self-Check: PASSED

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 3 complete: engine composables code-split, idle task queue consolidated, pin prefetch active, instrumentation in place
- Wave 4 (Verification/Guardrails) can proceed: `window.__mapMetrics` exposes parseOverhead + interactiveAt for Lighthouse comparison
- To view metrics in browser: `window.__mapMetrics` in DevTools console after page load

---
*Phase: 12-map-load-optimization*
*Completed: 2026-03-02*
