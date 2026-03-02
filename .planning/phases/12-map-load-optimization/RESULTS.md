# Phase 12: Map Load Time Optimization — Results

**Status:** Wave 4 complete. Lighthouse metrics pending manual run (no browser CI available during Wave 4 execution).
**Date completed:** 2026-03-02

---

## Executive Summary

- **Target:** Map interactive within 5 seconds on Fast 3G + 4x CPU slowdown
- **Strategy:** Deferred 7 composables to `requestIdleCallback`, split layers into critical/deferred, moved engine modules to async chunks, added Image.decode() pin prefetch
- **Baseline build size:** 4622.5 kB total (Wave 1 start)
- **Final build size:** 4627.4 kB total (Wave 3 complete)
- **Note:** Build size slightly increased due to instrumentation added (window.__mapMetrics, useMapIdleFeatures composable). Async chunk split means the main parse-time budget is reduced — Mapbox and engine composables are no longer blocking main thread parse.

---

## Build Artifact Changes (Measured)

| Artifact | Baseline (Wave 0) | Final (Wave 3) | Change |
|----------|-------------------|----------------|--------|
| Total dist size | 4622.5 kB | 4627.4 kB | +4.9 kB (instrumentation) |
| Mapbox chunk | async (pre-existing) | async (unchanged) | — |
| Engine chunks (SDF/Fluid/Dolly) | in main bundle | separate async chunks | moved out |
| useMapIdleFeatures | did not exist | 1 new composable | +1 file |
| prefetchCriticalPins | did not exist | named module export | +1 export |
| window.__mapMetrics | did not exist | added in Wave 3 | instrumentation active |

---

## Lighthouse Metrics (Throttled: Fast 3G + 4x CPU)

> Lighthouse not run in headless CI during Phase 12 execution (no browser available). Run `lhci autorun` against `bun run preview` locally after pulling this branch.

### Before (Baseline — estimated pre-Wave-1 behavior)

| Metric | Estimated Baseline | Target | Notes |
|--------|--------------------|--------|-------|
| FCP | unknown | < 2500ms | No Lighthouse run captured |
| LCP | unknown | < 4000ms | No Lighthouse run captured |
| TBT | unknown | < 300ms | No Lighthouse run captured |
| CLS | unknown | < 0.1 | No Lighthouse run captured |
| Map interactive | unknown | < 5000ms | No `window.__mapMetrics` pre-Wave-1 |

### After (Final — to be measured on this branch)

| Metric | Measured | Target | Status |
|--------|----------|--------|--------|
| FCP | ___ ms | < 2500ms | Pending |
| LCP | ___ ms | < 4000ms | Pending |
| TBT | ___ ms | < 300ms | Pending |
| CLS | ___ | < 0.1 | Pending |
| `window.__mapMetrics.interactiveAt` | ___ ms | < 5000ms | Pending |

**To fill in:** Run `bun run build && bun run preview` then `lhci autorun` and update the table above.

---

## Per-Wave Improvements (Qualitative)

| Wave | Change | Expected Impact |
|------|--------|-----------------|
| Wave 1 | Deferred useSentientMap + heatmap/weather/vibe to idle | Reduces main-thread work before map interactive |
| Wave 1 | Pin images deferred to idle + rAF | Eliminates blocking image fetch at startup |
| Wave 1 | Terrain source safety handler | Eliminates console warning, no terrain thrashing |
| Wave 1 | Map interactive time measurement via Performance API | Baseline telemetry established |
| Wave 2 | Split addCriticalLayers / addDeferredLayers | Pin-hitbox rendered first; visual polish deferred |
| Wave 2 | applyTerrainAndAtmosphere deferred to idle | Terrain no longer blocking interactive time |
| Wave 2 | Single-fire pin image + terrain guards | Eliminates redundant style mutations |
| Wave 2 | useMapIdleFeatures idle task queue | Generic infrastructure for all deferred work |
| Wave 3 | useDollyZoom via async idle queue | Removes 1 engine module from main chunk parse |
| Wave 3 | useSDFClusters + useFluidOverlay pre-warm | Removes 2 engine modules from main chunk parse |
| Wave 3 | Idle task queue consolidation | All deferred tasks via single `executeIdleTasksOnce` |
| Wave 3 | prefetchCriticalPins with Image.decode() | Pin sprites decoded before map init |
| Wave 3 | window.__mapMetrics instrumentation | parseOverhead + interactiveAt telemetry active |

---

## Feature Parity Verification (from verification.md)

### Critical Features

| Feature | Status | Notes |
|---------|--------|-------|
| Pin rendering | Pending verification | Critical layers kept synchronous |
| Pin click → drawer open | Pending verification | useMapInteractions unchanged |
| Map drag/zoom/pitch | Pending verification | Core controls unchanged |
| Deferred features load after idle | Pending verification | Via scheduleIdleTask queue |

### Deferred Composables

| Composable | Load Method | Status |
|------------|-------------|--------|
| useSentientMap | requestIdleCallback after idle | Pending verification |
| useMapHeatmap | requestIdleCallback after idle | Pending verification |
| useWeather | requestIdleCallback (gated by flag/pref) | Pending verification |
| useVibeEffects | requestIdleCallback after idle | Pending verification |
| useDollyZoom | scheduleIdleTask async import | Pending verification |
| useSDFClusters | pre-warm + onMounted .then() | Pending verification |
| useFluidOverlay | pre-warm + onMounted .then() | Pending verification |

### Accessibility

| Check | Status |
|-------|--------|
| No visual regressions | Pending verification |
| Color contrast maintained | Pending verification |
| Keyboard navigation unchanged | Pending verification |
| prefers-reduced-motion respected | Pending verification |

---

## Known Issues / Tradeoffs

1. **Build size slightly increased (+4.9 kB):** The `useMapIdleFeatures.js` composable and `window.__mapMetrics` instrumentation add ~5 kB. This is offset by async chunk splitting of engine composables (smaller main thread parse budget).

2. **Lighthouse baseline not captured pre-Wave-1:** Phase 12 execution started without a pre-optimization Lighthouse run. The `baseline.json` contains build-size snapshots and metric targets but not measured Lighthouse scores. Future phases should capture LHCI baseline before any changes.

3. **useSDFClusters/useFluidOverlay: first-interaction no-op window:** There is a brief window after page load (until the async chunks resolve) where SDF cluster enhancement and fluid overlay are not active. This is intentional — these are visual polish features, not critical functionality.

4. **useDollyZoom: first-tap no-op:** `godTierZoomTo` no-ops gracefully until the dolly module loads from the idle queue. The first zoom interaction may use standard Mapbox zoom. This is acceptable for the use case.

5. **requestIdleCallback timing:** On very slow devices, the idle callback may be delayed beyond 5 seconds. The `setTimeout(fn, 2000)` fallback in `useMapIdleFeatures` ensures deferred tasks fire even without a true idle period.

---

## Recommendations for Phase 13

1. **Capture Lighthouse baseline before any changes** — set up LHCI run in a separate commit/branch before starting optimizations.
2. **Service Worker tile caching** — Mapbox tile requests are not cached by the SW. Adding a tile cache strategy could reduce map load time on repeat visits by 30-60%.
3. **Initial camera position from localStorage** — Skip the flyTo animation on repeat visits by restoring last camera position. Saves ~500ms of animation time.
4. **Cluster count virtualization** — The `cluster-count` layer renders DOM elements for all visible clusters simultaneously. Virtualizing beyond 20 visible clusters could reduce TBT.
5. **Pin image atlas** — Spritesheet for all pin variants would reduce from N image requests to 1, saving ~300-800ms on throttled connections.
6. **Prefetch venue drawer data** — The sentient map's zero-latency prefetch (already in Wave 1) could be extended to pre-warm Supabase venue queries based on viewport center.

---

**Signed Off By:**
- Performance Lead: ___
- QA Lead: ___
- Date: ___
