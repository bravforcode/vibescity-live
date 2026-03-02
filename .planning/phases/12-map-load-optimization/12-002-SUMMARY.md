---
phase: 12-map-load-optimization
plan: "002"
subsystem: ui
tags: [mapbox, performance, requestIdleCallback, code-splitting, layer-deferral, terrain]

# Dependency graph
requires:
  - phase: 12-map-load-optimization
    plan: "001"
    provides: deferred composable pattern, requestIdleCallback init for sentient/heatmap/weather/vibe

provides:
  - useMapIdleFeatures composable: generic idle task queue with executeIdleTasksOnce guard
  - addCriticalLayers / addDeferredLayers split in useMapLayers
  - applyTerrainAndAtmosphere in useMapAtmosphere (deferred terrain re-enable)
  - Single-fire pin image + terrain guards in useMapCore (no redundant style mutations)
  - Deferred layers (heatmap, terrain-visual, building-extrusion) queued after first map idle

affects: [wave-3-parse-eval, wave-4-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Idle task queue pattern: scheduleIdleTask() at setup time, executeIdleTasksOnce() on idle event
    - Single-fire guard pattern: boolean flags reset on style.load to prevent duplicate style mutations
    - Deferred layer split: addCriticalLayers (interaction) vs addDeferredLayers (visual polish)
    - Source-existence guard: deferred layers silently no-op when source missing

key-files:
  created:
    - src/composables/map/useMapIdleFeatures.js
  modified:
    - src/composables/map/useMapLayers.js
    - src/composables/map/useMapAtmosphere.js
    - src/composables/map/useMapCore.js
    - src/components/map/MapboxContainer.vue

key-decisions:
  - "addCriticalLayers/addDeferredLayers added as NEW exports to useMapLayers — existing API untouched to avoid breaking 10+ call sites in MapboxContainer"
  - "applyTerrainAndAtmosphere added to existing useMapAtmosphere (not a new file) since the composable already owns terrain/fog lifecycle"
  - "pinnedImagesEnsured + terrainChecked flags declared inside scheduleNonCriticalInit closure (not module-level) to scope correctly per map instance"
  - "executeIdleTasksOnce called in first-idle handler — queue is empty at Wave 2 (no pre-scheduled tasks yet), making it a future extension point for Wave 3+"

patterns-established:
  - "Idle task queue: declare useMapIdleFeatures at setup, scheduleIdleTask() at any point before idle, executeIdleTasksOnce() in idle handler"
  - "Deferred layer guard: check source existence before addLayer — silent no-op when deferred source unavailable"
  - "Style-transition reset: boolean guard flags reset on style.load to allow re-run on new styles"

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 12 Plan 002: Network Optimization (Wave 2) Summary

**Split useMapLayers into critical (pin interaction) vs deferred (heatmap/terrain/3D) layers, added single-fire style mutation guards in useMapCore, and created useMapIdleFeatures idle task queue composable**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-02T09:32:30Z
- **Completed:** 2026-03-02T09:36:48Z
- **Tasks:** 5 / 5
- **Files modified:** 5 (4 modified + 1 created)

## Accomplishments

- `useMapLayers` now exports `addCriticalLayers()` (pin-hitbox + selected-pin) and `addDeferredLayers()` (heatmap, terrain-visual, building-extrusion) with source-existence guards
- `useMapAtmosphere` now exports `applyTerrainAndAtmosphere()` which re-enables terrain after idle without spurious console warnings
- `useMapCore` now uses `pinnedImagesEnsured` + `terrainChecked` single-fire flags, eliminating redundant `styledata` → `ensureTerrainSourceConsistency` calls on every style event
- `useMapIdleFeatures.js` created: generic idle task queue with `requestIdleCallback` + `setTimeout` fallback, single-execution guard, per-task error isolation
- `MapboxContainer.vue` wired to execute deferred layers + terrain in the existing first-idle handler alongside sentient/heatmap/weather/vibe

## Task Commits

Each task was committed atomically:

1. **Task 2.1: Split useMapLayers into critical + deferred** - `b841294` (perf)
2. **Task 2.2: Defer terrain/atmosphere to idle phase** - `fa2bd3d` (perf)
3. **Task 2.3: Chain critical + deferred layer execution** - `61c22e9` (perf)
4. **Task 2.4: Single-fire guards for pin images + terrain** - `6e19bd7` (perf)
5. **Task 2.5: Add useMapIdleFeatures idle callback wrapper** - `0e827fe` (perf)

## Files Created/Modified

- `src/composables/map/useMapIdleFeatures.js` — NEW: idle task queue composable (scheduleIdleTask, executeIdleTasksOnce, requestIdleCallback with setTimeout fallback)
- `src/composables/map/useMapLayers.js` — Added addCriticalLayers() + addDeferredLayers() exports with source guards; existing API unchanged
- `src/composables/map/useMapAtmosphere.js` — Added applyTerrainAndAtmosphere() for deferred terrain re-enable with source-existence check
- `src/composables/map/useMapCore.js` — Added pinnedImagesEnsured + terrainChecked single-fire guards in scheduleNonCriticalInit; removed styledata→terrain binding
- `src/components/map/MapboxContainer.vue` — Import useMapIdleFeatures; destructure addCriticalLayers/addDeferredLayers/applyTerrainAndAtmosphere; wire deferred execution in first-idle handler

## Decisions Made

- **addCriticalLayers/addDeferredLayers as new exports**: The real `useMapLayers.js` has 20+ functions with a completely different structure from the plan's pseudocode. Adding new exports preserves all existing call sites in MapboxContainer while delivering the layer split intent.
- **applyTerrainAndAtmosphere in existing file**: The plan described it as a new composable but `useMapAtmosphere.js` already exists with full terrain/fog ownership — adding there avoids a naming collision and keeps terrain logic co-located.
- **Flags inside closure not module-level**: `pinnedImagesEnsured` and `terrainChecked` are declared inside `initMap()` so they're scoped to each map instance, which is correct for HMR and test teardown.
- **executeIdleTasksOnce queue is empty at Wave 2**: No tasks are pre-scheduled via `scheduleIdleTask()` in Wave 2; the composable is wired up as an extension point. Wave 3 can start scheduling tasks into the queue at setup time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] useMapAtmosphere already exists — plan described it as new file**
- **Found during:** Task 2.2 (Defer terrain/atmosphere)
- **Issue:** Plan's Task 2.2 describes creating `useMapAtmosphere` as a new composable, but it already exists (created in Wave 1 via MapboxContainer import chain) with a full atmosphere/fog/fireflies/weather implementation
- **Fix:** Added `applyTerrainAndAtmosphere()` as a new function to the existing composable, preserving all existing functionality and the call signature `useMapAtmosphere(map, isMapReady, options)`
- **Files modified:** `src/composables/map/useMapAtmosphere.js`
- **Verification:** Build succeeds, no duplicate exports
- **Committed in:** `fa2bd3d` (Task 2.2 commit)

**2. [Rule 1 - Bug] useMapLayers real structure differs from plan pseudocode**
- **Found during:** Task 2.1 (Split useMapLayers)
- **Issue:** Plan showed a simplified 3-layer version of useMapLayers. Real file has 1400+ lines with 20+ functions (neon roads, car animation, coin animation, traffic roads). The plan's 3-layer approach would replace a monolith with 3 layers.
- **Fix:** Added `addCriticalLayers()` and `addDeferredLayers()` as new exports without removing existing exports. Critical layers are pin-hitbox + selected-pin (using MapboxContainer's existing layer IDs as parameters). Deferred layers add heatmap/terrain/building with source-existence guards.
- **Files modified:** `src/composables/map/useMapLayers.js`
- **Verification:** Build succeeds, existing call sites in MapboxContainer unaffected
- **Committed in:** `b841294` (Task 2.1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bug: both were structural mismatches between plan pseudocode and actual file state)
**Impact on plan:** Both fixes necessary for correctness. Delivered all plan objectives without disrupting existing functionality.

## Issues Encountered

None — all structural mismatches resolved by additive changes (new exports, new functions).

## Self-Check

## Self-Check: PASSED

Files verified:
- `src/composables/map/useMapIdleFeatures.js` — created, contains `scheduleIdleTask`, `executeIdleTasksOnce`, `requestIdleCallback` fallback
- `src/composables/map/useMapLayers.js` — modified, contains `addCriticalLayers` and `addDeferredLayers` in return object
- `src/composables/map/useMapAtmosphere.js` — modified, contains `applyTerrainAndAtmosphere` in return object
- `src/composables/map/useMapCore.js` — modified, contains `pinnedImagesEnsured` and `terrainChecked` flags
- `src/components/map/MapboxContainer.vue` — modified, imports `useMapIdleFeatures`, destructures `addCriticalLayers`, `addDeferredLayers`, `applyTerrainAndAtmosphere`, calls `executeIdleTasksOnce`

Commits verified: `b841294`, `fa2bd3d`, `61c22e9`, `6e19bd7`, `0e827fe` — all present in `git log`

Build verified: `bun run build` completed with Total 4625.5 kB, no errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 complete: layer split and idle queue infrastructure established
- Wave 3 (Parse/Eval optimization) can proceed: `scheduleIdleTask()` is available as a queue for any parse-heavy module loading
- No blockers

---
*Phase: 12-map-load-optimization*
*Completed: 2026-03-02*
