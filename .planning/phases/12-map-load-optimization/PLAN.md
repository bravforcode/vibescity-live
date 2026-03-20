---
wave: 1
depends_on: []
files_modified:
  - src/components/map/MapboxContainer.vue
  - src/composables/map/useMapCore.js
  - src/index.html
autonomous: false
must_haves:
  - Map initializes within 2 seconds
  - Basic pins render without useSentientMap
  - All features load after requestIdleCallback
---

# Phase 12: Map Load Time Optimization

## Targets
- Primary: `chunk load -> map init -> basic pins + interaction` ready in <= `5s` on DevTools Fast 3G + 4x CPU slowdown.
- Stretch: P75 “map interactive” trending to sub-`2s` (current timeout 20-40s).
- Constraint: No feature removal. Only defer non-critical systems until after map idle.

## Execution Order
- Wave 1: Critical path shrink (0-1.5s)
- Wave 2: Network/bytes (1.5-3s)
- Wave 3: Parse/eval scheduling (3-5s)
- Wave 4: Measurement + parity verification

## Atomic Tasks

### Wave 1 — Critical Path

- [ ] **T1. Baseline measurement snapshot (before changes)**  
  Owner: 1 engineer | ETA: 30m  
  Files: `scripts/`, `.planning/phases/12-map-load-optimization/`  
  Steps:
  1. Run Lighthouse in Fast 3G + 4x CPU for `HomeView` map entry route.
  2. Record `FCP`, `LCP`, `TTI`, and custom `map-interactive-ms`.
  3. Save screenshots + JSON reports in `.planning/phases/12-map-load-optimization/baseline/`.
  Done when:
  - Baseline evidence exists for before/after comparison.

- [ ] **T2. Lazy-load `useSentientMap` after first map idle**  
  Owner: 1 engineer | ETA: 50m  
  Files: [src/components/map/MapboxContainer.vue](/c:/vibecity.live/src/components/map/MapboxContainer.vue)  
  Steps:
  1. Remove eager top-level `import { useSentientMap } ...`.
  2. Create deferred initializer called inside `map.once('idle', ...)`.
  3. Guard with feature flags + null-safe fallback.
  Snippet:
  ```js
  mapInstance.once("idle", async () => {
    const { useSentientMap } = await import("@/composables/map/useSentientMap");
    sentient = useSentientMap(/* existing args */);
  });
  ```
  Done when:
  - Initial map load works with `sentient === null`.
  - Sentient behavior activates after first idle.

- [ ] **T3. Lazy-load `useMapHeatmap`, `useWeather`, `useVibeEffects`**  
  Owner: 1 engineer | ETA: 55m  
  Files: [src/components/map/MapboxContainer.vue](/c:/vibecity.live/src/components/map/MapboxContainer.vue)  
  Steps:
  1. Move those imports to dynamic imports.
  2. Run only if corresponding feature flag is enabled.
  3. Initialize via shared idle scheduler (T4).
  Snippet:
  ```js
  if (flags.enableHeatmap) {
    const { useMapHeatmap } = await import("@/composables/map/useMapHeatmap");
    heatmap = useMapHeatmap(map, options);
  }
  ```
  Done when:
  - Base map + pin click works with all three features disabled/deferred.

- [ ] **T4. Add `useMapIdleFeatures` wrapper (`requestIdleCallback` + fallback)**  
  Owner: 1 engineer | ETA: 45m  
  Files: `src/composables/map/useMapIdleFeatures.js`, [src/components/map/MapboxContainer.vue](/c:/vibecity.live/src/components/map/MapboxContainer.vue)  
  Steps:
  1. Create composable to queue deferred initializers.
  2. Use `requestIdleCallback` when available; fallback to `setTimeout`.
  3. Trigger only after `map.on('idle')`.
  Snippet:
  ```js
  const scheduleIdleTask = (fn) => {
    if ("requestIdleCallback" in window) {
      return window.requestIdleCallback(fn, { timeout: 1500 });
    }
    return window.setTimeout(fn, 120);
  };
  ```
  Done when:
  - Deferred features never block first interactive pin click.

- [ ] **T5. Trim `useMapCore` to critical-only init**  
  Owner: 1 engineer | ETA: 60m  
  Files: [src/composables/map/useMapCore.js](/c:/vibecity.live/src/composables/map/useMapCore.js)  
  Steps:
  1. Keep only map constructor, style load, minimal sources/layers for pins + interactions.
  2. Move terrain/custom style checks to deferred phase hook.
  3. Remove debug-only listeners from production branch.
  Done when:
  - `initMap()` no longer performs terrain/weather/sentient setup on first pass.

- [ ] **T6. Add Mapbox chunk prefetch/preload hint**  
  Owner: 1 engineer | ETA: 25m  
  Files: [src/index.html](/c:/vibecity.live/src/index.html), Vite entry preload helper if needed  
  Steps:
  1. Add resource hint for map vendor chunk.
  2. Verify hint appears in network waterfall before map mount.
  Snippet:
  ```html
  <link rel="prefetch" href="/static/js/async/mapbox.*.js" as="script" />
  ```
  Done when:
  - Chunk request starts earlier than map component mount.

### Wave 2 — Network Optimization

- [ ] **T7. Split `useMapLayers` into `setupCriticalLayers` + `setupDeferredLayers`**  
  Owner: 1 engineer | ETA: 60m  
  Files: [src/composables/map/useMapLayers.js](/c:/vibecity.live/src/composables/map/useMapLayers.js), [src/components/map/MapboxContainer.vue](/c:/vibecity.live/src/components/map/MapboxContainer.vue)  
  Steps:
  1. Keep pins/hitbox/select layer in critical path.
  2. Move heat/terrain/3D/visual enhancement layers to deferred function.
  3. Run deferred layer setup through idle queue.
  Done when:
  - First paint includes only interaction-critical layers.

- [ ] **T8. Defer heavy style augmentations (terrain/fog/custom atmosphere)**  
  Owner: 1 engineer | ETA: 45m  
  Files: [src/composables/map/useMapCore.js](/c:/vibecity.live/src/composables/map/useMapCore.js), `src/composables/map/useMapAtmosphere.js`  
  Steps:
  1. Remove terrain/fog from initial style mutation.
  2. Apply after `map.on("idle")` and only if feature flags enable.
  Done when:
  - No terrain/fog work occurs before first interactive frame.

### Wave 3 — Parse/Eval Optimization

- [ ] **T9. Code-split engine composables (`useDollyZoom`, `useFluidOverlay`, `useSDFClusters`)**  
  Owner: 1 engineer | ETA: 55m  
  Files: [src/components/map/MapboxContainer.vue](/c:/vibecity.live/src/components/map/MapboxContainer.vue)  
  Steps:
  1. Replace eager imports with dynamic imports.
  2. Initialize only when enhancement mode is active and map is idle.
  Done when:
  - Main map chunk parse/eval size decreases in bundle analyzer.

- [ ] **T10. Preload pin assets during chunk download**  
  Owner: 1 engineer | ETA: 40m  
  Files: `src/composables/map/useMapImagePrefetch.js`, [src/components/map/MapboxContainer.vue](/c:/vibecity.live/src/components/map/MapboxContainer.vue)  
  Steps:
  1. Trigger critical pin icon preload before map mount completion.
  2. Ensure image decode is async and non-blocking.
  Done when:
  - Pin symbols appear without late-image flash.

### Wave 4 — Verification & Guardrails

- [ ] **T11. Add Lighthouse CI perf budget for map route**  
  Owner: 1 engineer | ETA: 50m  
  Files: `package.json`, `lighthouserc.*`, CI workflow  
  Steps:
  1. Add LHCI run on PR for map route.
  2. Budget thresholds: `FCP`, `LCP`, `Total Blocking Time`, custom map interactive metric.
  Done when:
  - CI fails on perf regressions above agreed budgets.

- [ ] **T12. Feature parity verification (post-idle)**  
  Owner: 1 engineer | ETA: 45m  
  Files: QA checklist in `.planning/phases/12-map-load-optimization/verification.md`  
  Steps:
  1. Verify sentient map, heatmap, weather, 3D effects eventually load after idle.
  2. Verify no console errors on throttled network.
  3. Confirm pin selection + modal flow unchanged functionally.
  Done when:
  - All deferred features confirmed functional without blocking initial interactivity.

## Verification Criteria
- Lighthouse (Fast 3G + 4x CPU):
  - `FCP` <= 2.5s
  - `LCP` <= 4.0s
  - `TBT` <= 300ms
- Map-specific:
  - First pin clickable <= 5.0s
  - `map-interactive-ms` P75 <= 2.0s
  - No `map init timeout` events in observability for baseline scenario
- Functional:
  - Basic pins visible before deferred features
  - Deferred systems start only after `map.idle`

## Rollback Plan (If LCP/FCP or UX regresses)
1. Disable deferred-loader flag and restore eager path for latest changed module only (sentient/heatmap/weather one at a time).
2. Revert `useMapCore` critical-path split commit.
3. Keep instrumentation commits (metrics + LHCI) so regression stays measurable.
4. Validate rollback by rerunning Lighthouse profile and `/map` smoke test.
