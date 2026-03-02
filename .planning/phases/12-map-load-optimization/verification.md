# Phase 12: Feature Parity Verification Checklist

**Version:** Wave 4 (final)
**Scope:** All deferred features from Waves 1-3 must be functionally equivalent to pre-optimization eager-loaded behavior.
**How to use:** Check each item on a throttled device (Fast 3G + 4x CPU) before signing off Phase 12.

---

## Critical Path (Wave 1) — Map renders and is interactive

- [ ] Map renders without timeout errors on Fast 3G + 4x CPU slowdown
- [ ] Basic pins (venue markers) visible within 5 seconds
- [ ] Pin click opens venue drawer (same behavior as before Wave 1)
- [ ] Map interactions responsive: drag, zoom, pitch, rotate
- [ ] No "map init timeout" events in browser console or observability logs
- [ ] `window.__mapMetrics.interactiveAt` is set (confirms idle event fired)
- [ ] No `Couldn't find terrain source` warnings in console

---

## Deferred Composables (Wave 1) — Load after first map idle

### useSentientMap

- [ ] Deferred: does NOT load synchronously at startup
- [ ] Loads via `requestIdleCallback` after map `idle` event fires
- [ ] Tap pin → sentient state machine activates (dwell lock, radar, auto-open)
- [ ] Velocity tracking works (fast pan does not trigger auto-open)
- [ ] Micro-gravity snap to pin (50px threshold)
- [ ] No console errors after deferred load
- [ ] No memory leaks after long idle session (use DevTools Memory profiler)

### useMapHeatmap

- [ ] Deferred: does NOT load synchronously at startup
- [ ] Heatmap layer appears after enabling heatmap toggle (loads on demand)
- [ ] Heatmap colors correct (warm = high density)
- [ ] Toggle heatmap on/off works without map refresh
- [ ] No visual flicker when heatmap layer appears

### useWeather

- [ ] Deferred: loads when `featureFlagStore.isEnabled("enable_map_weather") || allowWeatherFx.value`
- [ ] Weather icons appear on map (if API available)
- [ ] Graceful fallback if weather API is unavailable or times out
- [ ] No network errors leak to console on throttled connection

### useVibeEffects

- [ ] Deferred: does NOT load synchronously at startup
- [ ] Visual effects (glow, pulse, particle) appear after idle
- [ ] Smooth animation (no jank on first render)
- [ ] Effects respect `prefers-reduced-motion` media query

---

## Layer Loading (Wave 2) — Critical vs. deferred split

- [ ] Critical layers render before map idle: pin-hitbox layer, selected-pin-marker layer
- [ ] Pins are clickable/interactive before deferred layers appear
- [ ] Deferred layers (heatmap, terrain-visual, building-extrusion) load after first idle
- [ ] No visual flicker when deferred layers appear
- [ ] Terrain appears after idle (no "terrain source not found" console warnings)
- [ ] Fog/atmosphere renders correctly when enabled
- [ ] `addCriticalLayers()` and `addDeferredLayers()` each run once per style load (single-fire guard)

---

## Parse/Eval Optimizations (Wave 3) — Engine composables in async chunks

### useDollyZoom (async via idle queue)

- [ ] NOT included in main JS bundle (confirm in DevTools Network tab: no `dolly` in main chunk)
- [ ] `godTierZoomTo` no-ops gracefully on first interaction before chunk loads
- [ ] Dolly zoom interaction works after map has been idle
- [ ] No parse errors in console

### useSDFClusters (pre-warmed async chunk)

- [ ] NOT included in main JS bundle (separate async chunk in dist)
- [ ] Cluster visual enhancement appears (SDF rendering)
- [ ] Clicking cluster still triggers expected behavior
- [ ] No Vue lifecycle warnings (onUnmounted fires correctly)

### useFluidOverlay (pre-warmed async chunk)

- [ ] NOT included in main JS bundle (separate async chunk in dist)
- [ ] Canvas overlay renders smoothly on visible map area
- [ ] No memory leaks during long session (canvas not retained after unmount)
- [ ] No Vue lifecycle warnings

### Pin Image Prefetch

- [ ] `prefetchCriticalPins()` called before map.init() (check `window.__mapMetrics.setupStart`)
- [ ] Pin sprites decode before first render (no placeholder flash)
- [ ] `Image.decode()` errors gracefully handled (no console errors)

### Idle Task Queue Consolidation

- [ ] All deferred composables fire via `executeIdleTasksOnce` on first idle (single dispatch)
- [ ] `scheduleIdleTask` queue empties completely on first idle (no tasks left over)
- [ ] Second idle event does NOT re-run deferred tasks (single-fire guard confirmed)

### Parse/Eval Instrumentation

- [ ] `window.__mapMetrics.parseOverhead` is a positive number (ms) after page load
- [ ] `window.__mapMetrics.setupStart` and `setupEnd` are populated
- [ ] `window.__mapMetrics.interactiveAt` is set to the map idle timestamp

---

## Idle Task Queue (Wave 2+3 shared infrastructure)

- [ ] `useMapIdleFeatures` composable wired in `MapboxContainer.vue`
- [ ] `requestIdleCallback` with `setTimeout` fallback fires correctly in all browsers
- [ ] Tasks isolated: one failing task does not block others in queue
- [ ] Queue does not leak between HMR reloads (flags reset on style.load)

---

## Network Metrics

- [ ] Initial page load payload reduced vs. baseline (check Network tab total size)
- [ ] Mapbox chunk is async (not in main bundle — appears as separate async chunk in dist)
- [ ] No 404 errors on tile or style requests
- [ ] Graceful fallback if Mapbox style URL is temporarily unavailable
- [ ] Chunk sizes visible in `dist/` after `bun run build`

---

## Accessibility

- [ ] No visual regressions vs. pre-Phase-12 UI (map looks identical at rest)
- [ ] Color contrast maintained on venue pins and UI overlays
- [ ] Keyboard navigation unchanged (map focus, drawer open/close)
- [ ] Screen reader announcements unchanged (no new aria changes)
- [ ] Animations respect `prefers-reduced-motion: reduce` (use OS setting to verify)

---

## Error Handling

- [ ] Network timeout on 3G → map still usable (pins visible, drawer openable)
- [ ] Module load failure → deferred feature skips silently (no crash)
- [ ] Missing pin image → fallback icon appears (no broken image placeholder)
- [ ] Missing terrain source → deferred terrain silently no-ops (no error thrown)
- [ ] No unhandled promise rejections in console on throttled network
- [ ] `frontendObservabilityService.reportMapLifecycle("map_load_performance")` fires after idle

---

## E2E Regression Flows

These flows must be identical before and after Phase 12:

- [ ] Venue search → map flyTo → drawer opens with venue details
- [ ] Drawer close → map interaction resumes (drag, zoom work)
- [ ] Modal dismiss → map is responsive (no stuck state)
- [ ] Page hard refresh → map reloads without timeout (within 5s on Fast 3G)
- [ ] Network switch (offline → online) → map recovers without full reload
- [ ] Tab switch away and return → map still interactive (no stale state)

---

## Performance Regression Check

Run Lighthouse with Fast 3G + 4x CPU throttle after all deferred features load:

| Metric | Target | Measured | Status |
|--------|--------|----------|--------|
| FCP | < 2500ms | ___ ms | [ ] |
| LCP | < 4000ms | ___ ms | [ ] |
| TBT | < 300ms | ___ ms | [ ] |
| CLS | < 0.1 | ___ | [ ] |
| Map Interactive (`interactiveAt`) | < 5000ms | ___ ms | [ ] |

- [ ] Memory peak does not increase vs. baseline after all idle features load
- [ ] No JavaScript errors reported in observability logs
- [ ] `bun run check && bun run build` passes on CI

---

## Sign-Off

| Section | Owner | Status | Date |
|---------|-------|--------|------|
| Critical Path | | | |
| Deferred Composables | | | |
| Layer Loading | | | |
| Parse/Eval | | | |
| Accessibility | | | |
| Error Handling | | | |
| E2E Flows | | | |
| Performance Regression | | | |

**UAT Sign-Off:** ___
**Date:** ___
**Phase 12 Status:** PENDING
