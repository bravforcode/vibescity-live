---
status: testing
phase: 12-map-load-optimization
source: 12-001-SUMMARY.md, 12-002-SUMMARY.md, 12-003-SUMMARY.md, 12-004-SUMMARY.md
started: 2026-03-02T12:00:00Z
updated: 2026-03-02T12:00:00Z
---

# Phase 12: Map Load Optimization — UAT

Comprehensive testing of all 4 waves: critical path deferred, network optimization, parse/eval optimization, and verification guardrails.

## Current Test

number: 1
name: Map loads without timeout errors
expected: |
  Open the app in browser (DevTools Fast 3G + 4x CPU slowdown recommended).
  Map should render with pins visible within 5 seconds without "MapboxContainer timeout" or "async component timeout" errors in console.
  No red error toasts or unhandled exceptions.
awaiting: user response

## Tests

### 1. Map loads without timeout errors
expected: |
  Open the app in browser (DevTools Fast 3G + 4x CPU slowdown recommended).
  Map should render with pins visible within 5 seconds without "MapboxContainer timeout" or "async component timeout" errors in console.
  No red error toasts or unhandled exceptions.
result: [pending]

### 2. Basic map interaction works immediately
expected: |
  Drag the map, pinch to zoom, rotate with keyboard/right-click.
  All interactions should be responsive without lag or blocking.
  Should work before deferred features load (no waiting).
result: [pending]

### 3. Clicking a pin opens drawer (unchanged behavior)
expected: |
  Click any pin on the map.
  Drawer slides in from right with venue details, reviews, booking button, same as Phase 11 behavior.
  No delays or visual artifacts.
result: [pending]

### 4. Deferred features load silently after 2-3 seconds
expected: |
  After map idle (around 2-3 seconds), sentient map tracking activates:
  - Tapping a pin triggers velocity-based radar (small circle appears briefly)
  - Hold for 600ms → dwell lock engages (lock icon)
  - Release → drawer auto-opens without clicking
  - All without blocking initial pin click.
result: [pending]

### 5. Heatmap appears without flicker (if enabled)
expected: |
  If feature flag `enable_map_heatmap` is on, heatmap layer should appear after map idle (no flash before heatmap renders).
  Clicking heatmap toggle should smoothly enable/disable layer.
result: [pending]

### 6. Weather icons appear without flicker (if enabled)
expected: |
  If weather is enabled (via prefs or `enable_map_weather` flag), weather icons should appear on map after idle.
  No visual artifacts or late-load flash.
  Tapping a weather icon should show forecast (Phase 11 behavior unchanged).
result: [pending]

### 7. No terrain/fog visual artifacts on style transitions
expected: |
  Switching map styles (satellite, light, dark) should not trigger "terrain source not found" warnings in console.
  Terrain (if enabled) should re-enable smoothly after idle without visible pop-in.
  Fog should apply consistently if enabled.
result: [pending]

### 8. Pin assets load without flashing placeholders
expected: |
  When map first renders, pin icons should appear immediately without flash of placeholder icons.
  All venue pins, cluster pins should use correct icons.
  No "styleimagemissing" errors that cause later late-load images to appear.
result: [pending]

### 9. Deferred engine features load after idle (Dolly Zoom, SDF, Fluid Overlay)
expected: |
  If `enable_dolly_zoom` flag is on: godTierZoomTo() should work but may be no-op until dolly module loads (~2-3s), then smooth zoom happens on next attempt.
  If `enable_sdf_clusters` flag is on: cluster visual enhancement should appear after idle without flicker.
  If `enable_fluid_overlay` flag is on: fluid canvas animation should render smoothly after idle.
result: [pending]

### 10. Performance metrics visible in browser DevTools
expected: |
  Open DevTools Console, type: `window.__mapMetrics`
  Should show object with fields: `parseOverhead` (ms), `setupStart` (timestamp), `setupEnd`, `interactiveAt` (ms from navigationStart)
  Example: `{ parseOverhead: 45, setupStart: 1234567890123, setupEnd: 1234567890200, interactiveAt: 1850 }`
result: [pending]

### 11. No accessibility regressions
expected: |
  - Color contrast: all text readable (same as Phase 11)
  - Keyboard navigation: Tab through map, open drawer, close modals (unchanged)
  - Screen reader: announcements for pin clicks, drawer open/close (unchanged)
  - prefers-reduced-motion: pin/drawer animations disabled if user has enabled reduced motion (unchanged)
  No visual changes to UI layout, typography, or spacing.
result: [pending]

### 12. Feature flags control deferred feature loading
expected: |
  With `featureFlagStore.isEnabled('enable_map_heatmap')` OFF:
  - Heatmap layer should NOT load (no 404 errors, just silently skip)
  With flag ON:
  - Heatmap layer loads after idle
  Same behavior for: sentient_map, map_weather, vibe_effects, dolly_zoom, sdf_clusters, fluid_overlay
result: [pending]

### 13. No console errors on slow networks
expected: |
  DevTools Network tab throttled to "Slow 3G" or "Fast 3G"
  Close and reopen map multiple times (simulating back/forward navigation)
  Console should have ZERO red errors, warnings about missing terrain source only
  Should see "✅ Dolly Zoom initialized after idle" or similar deferred load logs if DEV mode
result: [pending]

### 14. Build compiles without errors
expected: |
  Run `bun run check && bun run build`
  Should complete successfully with zero errors
  Output should show "Total 4627+ kB" (main bundle + async chunks)
  No TypeScript errors, no Biome linting errors
result: [pending]

### 15. GitHub Actions Lighthouse CI gates work on PRs
expected: |
  Create a test PR or check recent PRs
  Should see "Performance Gate" or "Lighthouse CI" workflow running
  PR comment should show Lighthouse scores (FCP, LCP, TBT, CLS)
  If any metric exceeds budget (FCP >2500ms, LCP >4000ms, TBT >300ms, CLS >0.1), PR should fail
result: [pending]

### 16. E2E flows unchanged (search → flyTo → drawer open)
expected: |
  Use venue search → Select a venue → Map should fly to location, drawer opens
  Behavior should be identical to Phase 11
  No delays or visual artifacts between search selection and drawer open
  Closing drawer should return focus to map
result: [pending]

## Summary

total: 16
passed: 0
issues: 0
pending: 16
skipped: 0

## Gaps

[none yet]

