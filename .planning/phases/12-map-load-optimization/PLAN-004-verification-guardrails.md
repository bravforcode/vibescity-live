---
wave: 4
depends_on: [PLAN-003]
files_modified:
  - lighthouserc.json
  - package.json
  - .github/workflows/perf-gate.yml
  - .planning/phases/12-map-load-optimization/verification.md
autonomous: false
must_haves:
  - Lighthouse CI gates on FCP/LCP/TBT metrics
  - Feature parity verified (all deferred features functional)
  - Baseline + final measurements documented
  - No regressions on accessibility or UX
---

# WAVE 4: Verification & Guardrails (5s+ Load)

## Goal
Establish performance baselines, enforce post-optimization metrics with Lighthouse CI, and verify all deferred features are functionally equivalent to the original eager-loaded behavior. Target: Document 30%+ improvement in map interactive time and prevent future regressions via CI gates.

---

## Task 4.1: Create Baseline Measurement Snapshot (Before Changes)

**File:** `.planning/phases/12-map-load-optimization/baseline.json` + `scripts/capture-baseline.mjs` (NEW)

**Baseline Measurement Checklist:**
```javascript
// Document current state BEFORE executing Wave 1

{
  "timestamp": "2026-03-02T00:00:00Z",
  "environment": {
    "throttle": "Fast 3G",
    "cpu_slowdown": 4,
    "device": "Moto G4",
    "network": "4G LTE"
  },
  "lighthouse_metrics": {
    "fcp_ms": null,  // First Contentful Paint (target: < 2500ms)
    "lcp_ms": null,  // Largest Contentful Paint (target: < 4000ms)
    "tbt_ms": null,  // Total Blocking Time (target: < 300ms)
    "cls": null,     // Cumulative Layout Shift (target: < 0.1)
    "tti_ms": null   // Time to Interactive (informational)
  },
  "custom_metrics": {
    "map_interactive_ms": null,        // t from navigationStart to map.idle
    "mapbox_chunk_size_bytes": null,   // Compressed
    "main_chunk_parse_ms": null,       // MapboxContainer parse time
    "pin_images_loaded_ms": null,      // styleimagemissing fired
    "sentient_map_load_ms": null       // Time until useSentientMap ready
  },
  "observability": {
    "error_events": [],
    "console_warnings": [],
    "memory_peak_mb": null
  }
}
```

**Steps:**
1. Ensure repository is clean (no local changes)
2. Create performance monitoring snapshot with Lighthouse
3. Record all metrics in JSON file
4. Document in DEV log for before/after comparison

**Verification:**
- Baseline JSON exists at `.planning/phases/12-map-load-optimization/baseline.json`
- All nullable metrics filled with numbers
- Screenshots captured (FCP, LCP, resource waterfall)

---

## Task 4.2: Set Up Lighthouse CI with Performance Budget

**File:** `lighthouserc.json` (NEW)

**Create Lighthouse CI configuration:**
```json
{
  "ci": {
    "upload": {
      "target": "temporary-public-storage"
    }
  },
  "collect": {
    "url": [
      "http://localhost:5173/"
    ],
    "numberOfRuns": 3,
    "settings": {
      "configPath": "lighthouse-config.js",
      "output": ["json", "html"],
      "maxWaitForLoad": 45000,
      "maxWaitForFcp": 30000,
      "onlyCategories": ["performance"],
      "throttling": {
        "rttMs": 150,
        "throughputKbps": 1.6,
        "cpuSlowdownMultiplier": 4,
        "requestLatencyMs": 150,
        "downloadThroughputKbps": 1.6,
        "uploadThroughputKbps": 0.4
      }
    }
  },
  "assert": {
    "preset": "lighthouse:recommended",
    "assertions": {
      "first-contentful-paint": ["error", { "minScore": 0.80 }],
      "largest-contentful-paint": ["error", { "minScore": 0.80 }],
      "total-blocking-time": ["error", { "maxNumericValue": 300 }],
      "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
      "speed-index": ["warn", { "maxNumericValue": 5000 }]
    }
  }
}
```

**Create Lighthouse custom config:**
```javascript
// lighthouse-config.js
export default {
  extends: "lighthouse:default",
  settings: {
    emulatedFormFactor: "mobile",
    throttling: {
      rttMs: 150,
      throughputKbps: 1.6,
      cpuSlowdownMultiplier: 4,
    },
    skipAboutBlank: true,
  },
  audits: [
    {
      path: "lighthouse/audits/first-contentful-paint",
      options: {
        // Custom options if needed
      },
    },
  ],
};
```

**Steps:**
1. Install Lighthouse CI CLI: `npm install -g @lhci/cli@latest`
2. Save `lighthouserc.json` in root
3. Run locally to verify: `lhci autorun`
4. Record baseline scores before Wave 1

**Verification:**
- `lhci autorun` completes without errors
- Reports generated in `./lhci_results/`
- Baseline performance budget established
- CI ready to enforce thresholds

---

## Task 4.3: Integrate LHCI into GitHub Actions CI

**File:** `.github/workflows/perf-gate.yml` (NEW)

**Create performance gate workflow:**
```yaml
name: Performance Gate (Lighthouse CI)

on:
  pull_request:
    branches:
      - main
      - develop

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Start dev server
        run: npm run preview &
        # Preview server runs in background

      - name: Wait for server (15s)
        run: sleep 15

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          configPath: "./lighthouserc.json"
          uploadArtifacts: true
          temporaryPublicStorage: true
          runs: 3
          configPath: "./lighthouserc.json"

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: lighthouse-results
          path: ./lhci_results

      - name: Comment PR with results
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('./lhci_results/lhci-results.json', 'utf8'));
            const run = results.runs[0];
            const perf = run.scores.performance;

            const comment = `
            ## ⚡ Lighthouse Performance Report

            | Metric | Score | Target |
            |--------|-------|--------|
            | Performance | ${(perf * 100).toFixed(0)}/100 | 80+ |
            | FCP | ${run.audits['first-contentful-paint']?.numericValue.toFixed(0)}ms | <2500ms |
            | LCP | ${run.audits['largest-contentful-paint']?.numericValue.toFixed(0)}ms | <4000ms |
            | TBT | ${run.audits['total-blocking-time']?.numericValue.toFixed(0)}ms | <300ms |

            [Full Report](${results.uploadedUrl})
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment,
            });
```

**Steps:**
1. Create `.github/workflows/perf-gate.yml`
2. Configure Vercel preview deployment (or use preview server)
3. Run on all PRs before merge
4. Fail PR if metrics exceed budgets

**Verification:**
- Workflow runs on PR creation
- Lighthouse reports generated
- Performance scores visible in PR comments
- Regressions prevent merge

---

## Task 4.4: Feature Parity Verification Checklist

**File:** `.planning/phases/12-map-load-optimization/verification.md` (NEW)

**Create comprehensive verification suite:**
```markdown
# Phase 12 Feature Parity Verification

## Critical Path (Wave 1)
- [ ] Map renders without timeout errors on Fast 3G + 4x CPU
- [ ] Basic pins visible within 2 seconds
- [ ] Pin click opens drawer (same behavior as before)
- [ ] Map interactions responsive (drag, zoom, pitch)
- [ ] No "map init timeout" events in error logs

## Deferred Features (Wave 1-3)
- [ ] useSentientMap loads after idle
  - [ ] Tap pin → sentient state machine activates
  - [ ] Velocity tracking works (dwell lock, radar, auto-open)
  - [ ] No console errors or memory leaks
- [ ] useMapHeatmap loads when enabled
  - [ ] Heatmap layer appears without visual flicker
  - [ ] Heatmap colors correct
  - [ ] Toggle heatmap on/off works
- [ ] useWeather loads when enabled
  - [ ] Weather icons appear on map
  - [ ] No network errors if API unavailable
- [ ] useVibeEffects loads when enabled
  - [ ] Visual effects (glow, pulse) appear
  - [ ] Smooth animation (no jank)
- [ ] useDollyZoom loads when enabled
  - [ ] Dolly zoom interaction works
  - [ ] No parse errors in console
- [ ] useFluidOverlay loads when enabled
  - [ ] Canvas rendering smooth
  - [ ] No memory leaks during long session
- [ ] useSDFClusters loads when enabled
  - [ ] Cluster visual enhancement appears
  - [ ] Click clusters still works

## Layer Loading (Wave 2)
- [ ] Critical layers (pins, hitbox) render immediately
- [ ] Deferred layers (terrain, heatmap, 3D) load without blocking
- [ ] No visual flicker when deferred layers appear
- [ ] Terrain appears after idle (no "terrain source not found" warnings)
- [ ] Fog renders correctly if enabled

## Network Metrics (Wave 2)
- [ ] Initial network payload reduced vs. baseline
- [ ] Chunk sizes visible in DevTools
- [ ] No 404 errors on tile/style requests
- [ ] Graceful fallback if style unavailable

## Parse/Eval (Wave 3)
- [ ] MapboxContainer parse time < baseline + 10ms margin
- [ ] Async chunks load in parallel (not blocking main)
- [ ] Feature flags prevent unnecessary module loads
- [ ] Pin assets preload without flashing

## Accessibility (All)
- [ ] No visual regressions (map looks same as before)
- [ ] Color contrast maintained
- [ ] Keyboard navigation still works (if applicable)
- [ ] Screen reader announcements unchanged
- [ ] Animation respects prefers-reduced-motion

## Error Handling (All)
- [ ] Network timeout → graceful degradation (map still usable)
- [ ] Module load failure → feature gracefully skipped
- [ ] Missing image → fallback icon appears
- [ ] Missing source → deferred feature skips silently
- [ ] No console errors on throttled network

## Performance Regression Check (All)
- [ ] FCP: baseline ±5% (< 2500ms)
- [ ] LCP: baseline ±5% (< 4000ms)
- [ ] TBT: baseline ±10% (< 300ms)
- [ ] Memory peak: no increase during idle features load
- [ ] No JavaScript errors in observability logs

## E2E Flows (All)
- [ ] Venue search → flyTo → drawer open (unchanged)
- [ ] Drawer close → map interaction resumes
- [ ] Modal dismiss → map responsive
- [ ] Page refresh → map reloads without timeout
- [ ] Network switch (online ↔ offline) handled
```

**Steps:**
1. Create verification checklist in planning directory
2. Assign owner for each section
3. Use checklist as UAT gate before release
4. Document any known limitations

**Verification:**
- Checklist exists and is comprehensive
- All items pass on final build
- No flaky tests or environment-dependent issues
- UAT sign-off documented

---

## Task 4.5: Create Before/After Measurement Report

**File:** `.planning/phases/12-map-load-optimization/RESULTS.md` (NEW, populated after Wave 4)

**Report template:**
```markdown
# Phase 12: Map Load Time Optimization — Results

## Executive Summary
- **Target:** Map interactive within 5 seconds on 3G + 4x CPU slowdown
- **Baseline:** [FCP] ms, [LCP] ms, [map-interactive] ms
- **Final:** [FCP] ms, [LCP] ms, [map-interactive] ms
- **Improvement:** [%] reduction in map interactive time

## Lighthouse Metrics

### Fast 3G + 4x CPU Slowdown (Throttled)

| Metric | Baseline | Final | Target | Status |
|--------|----------|-------|--------|--------|
| FCP | ___ms | ___ms | <2500ms | ✅/❌ |
| LCP | ___ms | ___ms | <4000ms | ✅/❌ |
| TBT | ___ms | ___ms | <300ms | ✅/❌ |
| CLS | ___ms | ___ms | <0.1 | ✅/❌ |

### Network Waterfall

| Resource | Baseline | Final | Savings |
|----------|----------|-------|---------|
| Main Chunk | ___KB | ___KB | -___KB |
| Mapbox Chunk | ___KB | ___KB | 0KB (async) |
| Pin Images | ___ms load | ___ms prefetch | ___ms |

## Per-Feature Load Time

| Feature | Baseline | Final | Status |
|---------|----------|-------|--------|
| Map init | ___ms | ___ms | ✅/❌ |
| Critical layers | ___ms | ___ms | ✅/❌ |
| Sentient Map | ___ms (eager) | ___ms (idle) | ✅ Deferred |
| Heatmap | ___ms (eager) | ___ms (idle) | ✅ Deferred |
| Weather | ___ms (eager) | ___ms (idle) | ✅ Deferred |
| Vibe Effects | ___ms (eager) | ___ms (idle) | ✅ Deferred |

## Feature Parity Verification

### Critical Features (Must Work)
- [✅/❌] Pin rendering
- [✅/❌] Pin click → drawer open
- [✅/❌] Map drag/zoom/pitch
- [✅/❌] Deferred features load after idle

### Deferred Features (Graceful Degradation)
- [✅/❌] Sentient map (velocity tracking, dwell lock)
- [✅/❌] Heatmap (layer appears, toggle works)
- [✅/❌] Weather (icons load, API fallback)
- [✅/❌] Vibe Effects (smooth animation)
- [✅/❌] Dolly Zoom (interaction responsive)
- [✅/❌] Fluid Overlay (canvas smooth)
- [✅/❌] SDF Clusters (visual enhancement)

### Accessibility
- [✅/❌] No visual regressions
- [✅/❌] Color contrast maintained
- [✅/❌] Keyboard navigation unchanged
- [✅/❌] prefers-reduced-motion respected

## Known Issues / Tradeoffs
- [Document any visual changes or new limitations]

## Recommendations for Phase 13
- [Future optimization opportunities]
- [Performance plateaus identified]
- [New bottlenecks to address]

---

**Signed Off By:**
- Performance Lead: ___
- QA Lead: ___
- Date: ___
```

**Steps:**
1. Capture baseline metrics BEFORE any Wave 1 changes
2. Execute Waves 1-3 with atomic commits
3. After Wave 3, run final Lighthouse CI
4. Compare and fill in RESULTS.md
5. Document any gaps or tradeoffs

**Verification:**
- Before/after metrics captured
- Lighthouse CI passing on final build
- All deferred features functionally verified
- No accessibility regressions

---

## Task 4.6: Establish Regression Prevention & Monitoring

**File:** `scripts/perf-monitor.js` (NEW) + `package.json` scripts

**Add performance monitoring to observability:**
```javascript
// src/services/frontendObservabilityService.js (enhanced)

export const trackMapPerformance = (metrics) => {
  const payload = {
    event: "map_performance_metrics",
    fcp_ms: metrics.fcp,
    lcp_ms: metrics.lcp,
    map_interactive_ms: metrics.mapInteractive,
    sentient_load_ms: metrics.sentientLoadTime,
    heatmap_load_ms: metrics.heatmapLoadTime,
    chunk_size_bytes: metrics.chunkSizeBytes,
    parse_overhead_ms: metrics.parseOverhead,
    device: {
      cpu_cores: navigator.hardwareConcurrency,
      memory_gb: navigator.deviceMemory,
    },
    timestamp: Date.now(),
    session_id: window.__sessionId,
  };

  // Send to backend observability
  fetch("/api/observability/perf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn("Perf metric upload failed:", err);
  });
};
```

**Add to MapboxContainer.vue:**
```javascript
// After map is interactive
import { frontendObservabilityService } from "../../services/frontendObservabilityService";

const reportPerformanceMetrics = () => {
  const metrics = {
    fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
    lcp: performance.getEntriesByType("largest-contentful-paint").pop()?.renderTime,
    mapInteractive: performance.now(), // Time since navigationStart
    sentientLoadTime: window.__mapMetrics?.sentientLoadTime || null,
    heatmapLoadTime: window.__mapMetrics?.heatmapLoadTime || null,
    parseOverhead: window.__mapMetrics?.parseOverhead || null,
  };

  frontendObservabilityService.trackMapPerformance(metrics);
};

map.value.on("idle", () => {
  requestIdleCallback(reportPerformanceMetrics);
});
```

**Add monitoring script to package.json:**
```json
{
  "scripts": {
    "perf:baseline": "lighthouse http://localhost:5173 --throttling-method=simulate --cpu-slowdown-multiplier=4 --output=json --output-path=baseline-lh.json",
    "perf:compare": "node scripts/compare-perf.js",
    "perf:monitor": "node scripts/monitor-perf-db.js"
  }
}
```

**Steps:**
1. Instrument map performance in observability service
2. Track deferred feature load times per session
3. Monitor Lighthouse CI results in CI dashboard
4. Set up alerts for regressions > 10%

**Verification:**
- Metrics collected on every session
- Observability dashboard shows trends
- Alerts trigger on regressions
- Historical data available for analysis

---

## Success Criteria

- [ ] Lighthouse CI configured and passing all budget assertions
- [ ] Baseline measurements documented (before Wave 1)
- [ ] Final measurements compared vs. baseline (after Wave 4)
- [ ] FCP < 2500ms, LCP < 4000ms, TBT < 300ms (3G + 4x CPU)
- [ ] Map interactive time P75 <= 2.0s
- [ ] All deferred features verified functional
- [ ] No accessibility regressions
- [ ] Regression monitoring active in production
- [ ] Feature parity checklist 100% passing

---

## Rollback Plan (If Gate Fails)

1. **FCP/LCP Regression:**
   - Revert latest wave commit
   - Re-run Lighthouse CI to confirm metrics
   - Investigate new bottleneck (check DevTools profiler)
   - Adjust timeout or code-split strategy

2. **Feature Breaks:**
   - Review failing checklist items
   - Check console for module load errors
   - Verify feature flags are correct
   - Revert problematic commit, keep others

3. **Memory Leak Detected:**
   - Profile with DevTools Memory tab
   - Check for missing cleanups in deferred features
   - Verify onUnmounted hooks fire correctly
   - Add garbage collection instrumentation

4. **Observability Alerts:**
   - Check if regression is real or noise
   - Validate against Lighthouse CI run
   - If confirmed: follow FCP/LCP/Feature rollback plan

---

## Phase 12 Complete

When all 4 plans are executed and verified:
1. Commit final RESULTS.md with sign-off
2. Archive `.planning/phases/12-map-load-optimization/` to `.planning/archive/`
3. Create Phase 13 (if needed) for next optimization round
4. Update PROJECT.md with performance achievements

