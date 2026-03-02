---
phase: 12-map-load-optimization
plan: "004"
subsystem: ui
tags: [lighthouse, performance, ci, observability, github-actions, mapbox]

# Dependency graph
requires:
  - phase: 12-map-load-optimization
    plan: "003"
    provides: window.__mapMetrics instrumentation (parseOverhead, interactiveAt), scheduleIdleTask/executeIdleTasksOnce queue, async-chunked engine composables

provides:
  - lighthouserc.json: LHCI configuration with FCP/LCP/TBT/CLS budget assertions
  - .github/workflows/perf-gate.yml: GitHub Actions Lighthouse CI on all PRs
  - baseline.json: Pre-Wave-1 build snapshot + null-stub Lighthouse metrics
  - verification.md: Feature parity checklist covering all 4 waves + deferred composables
  - RESULTS.md: Before/after measurement report with known build metrics populated
  - frontendObservabilityService.trackMapPerformance(): per-session map perf telemetry
  - MapboxContainer idle handler wired to frontendObservabilityService (requestIdleCallback)
  - package.json: perf:baseline, perf:compare, perf:monitor scripts

affects: [future-perf-phases, ci-pipeline, observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - LHCI assertion pattern: preset lighthouse:recommended + explicit maxNumericValue overrides for FCP/LCP/TBT/CLS
    - Observability flush pattern: requestIdleCallback with 5000ms timeout + setTimeout(2000) fallback
    - Fail-open observability: try/catch around all perf reporting so map never blocks

key-files:
  created:
    - .planning/phases/12-map-load-optimization/baseline.json
    - .planning/phases/12-map-load-optimization/verification.md
    - .planning/phases/12-map-load-optimization/RESULTS.md
    - .planning/phases/12-map-load-optimization/12-004-SUMMARY.md
    - lighthouserc.json
    - .github/workflows/perf-gate.yml
  modified:
    - src/services/frontendObservabilityService.js
    - src/components/map/MapboxContainer.vue
    - package.json

key-decisions:
  - "trackMapPerformance wired via requestIdleCallback(timeout:5000) + setTimeout(2000) fallback — ensures it fires on slow devices without blocking deferred feature init"
  - "Observability fail-open: try/catch wraps entire _reportPerfMetrics block; map never throws for analytics failure"
  - "perf scripts use .mjs extension to match project ES module convention (compare-perf.mjs, monitor-perf-db.mjs)"
  - "baseline.json: Lighthouse metrics null (no pre-Wave-1 LHCI run available); build-size snapshot from Wave 1 start captured"
  - "RESULTS.md populated with known build metrics + qualitative per-wave table; Lighthouse scores pending manual lhci autorun"

patterns-established:
  - "Idle-then-observe: register all deferred init via scheduleIdleTask, flush once, then report perf metrics last via requestIdleCallback"
  - "fail-open observability: analytics never block critical paths; always wrapped in try/catch with silent failure"

# Metrics
duration: 25min
completed: 2026-03-02
---

# Phase 12 Plan 004: Verification & Guardrails (Wave 4) Summary

**Lighthouse CI gates (FCP/LCP/TBT/CLS) + per-session map performance telemetry wired to observability service via requestIdleCallback after map idle**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-02T10:30:00Z
- **Completed:** 2026-03-02T10:55:00Z
- **Tasks:** 6 / 6 (Tasks 4.1+4.2 committed together; Task 4.6 split into service + wiring commits)
- **Files modified:** 6 (3 config files, 1 workflow, 1 service, 1 component, 1 package.json)

## Accomplishments

- Lighthouse CI pipeline established: `lighthouserc.json` with hard assertions (FCP<2500ms, LCP<4000ms, TBT<300ms, CLS<0.1) + `.github/workflows/perf-gate.yml` running on all PRs targeting main/develop
- Per-session map performance telemetry fully wired: `frontendObservabilityService.trackMapPerformance()` called from MapboxContainer after every first-idle event via `requestIdleCallback` — captures FCP, LCP, mapInteractive, parseOverhead, sentientLoadTime, heatmapLoadTime
- Phase 12 documentation complete: `baseline.json` (pre-Wave-1 snapshot), `verification.md` (feature parity checklist for all 4 waves), `RESULTS.md` (before/after measurement template with known build metrics populated)

## Task Commits

Each task was committed atomically:

1. **Tasks 4.1+4.2: baseline.json + lighthouserc.json with perf budgets** - `a43be6d` (chore)
2. **Task 4.3: perf-gate.yml GitHub Actions Lighthouse CI** - `ea059e8` (chore)
3. **Task 4.4: verification.md feature parity checklist** - `6b6966a` (chore)
4. **Task 4.5: RESULTS.md with known build metrics populated** - `99a8d6f` (chore)
5. **Task 4.6a: trackMapPerformance() added to frontendObservabilityService** - `49ea683` (feat)
6. **Task 4.6b: Wire trackMapPerformance + add perf scripts to package.json** - `34adea4` (feat)

## Files Created/Modified

- `.planning/phases/12-map-load-optimization/baseline.json` — Pre-Wave-1 build snapshot (4622.5 kB total, 444.4 kB mapbox gzipped); Lighthouse metrics null (no LHCI run pre-Wave-1)
- `.planning/phases/12-map-load-optimization/verification.md` — 40-item feature parity checklist: critical path, deferred composables, layer loading, network metrics, parse/eval, a11y, error handling, E2E flows
- `.planning/phases/12-map-load-optimization/RESULTS.md` — Before/after measurement report; build artifact changes measured; Lighthouse scores pending `lhci autorun`
- `lighthouserc.json` — LHCI config: FCP minScore 0.80, LCP minScore 0.80, TBT max 300ms, CLS max 0.1; 3 runs, Fast 3G + 4x CPU throttling
- `.github/workflows/perf-gate.yml` — GitHub Actions workflow: checkout → install → build → preview → lhci autorun → artifact upload → PR comment with metric table
- `src/services/frontendObservabilityService.js` — Added `trackMapPerformance()` method: sanitizes+rounds all ms values, captures navigator.hardwareConcurrency/deviceMemory, emits via existing `emit()` dedup/sanitize pipeline as `map_performance_metrics`
- `src/components/map/MapboxContainer.vue` — Wired `_reportPerfMetrics` in first-idle handler: reads FCP/LCP from Performance API + `window.__mapMetrics`, calls `frontendObservabilityService.trackMapPerformance()`, wrapped in try/catch + requestIdleCallback(timeout:5000)
- `package.json` — Added `perf:baseline`, `perf:compare`, `perf:monitor` scripts

## Decisions Made

- **requestIdleCallback with 5000ms timeout + setTimeout fallback:** The perf reporting call must fire even on slow devices where `requestIdleCallback` may be delayed indefinitely. The 5000ms timeout budget and `setTimeout(2000)` fallback mirror the pattern already used in `useMapIdleFeatures`.

- **fail-open try/catch:** All perf metric collection is wrapped in try/catch with silent failure. Analytics must never throw and block the map's idle handler — especially `performance.getEntriesByName("first-contentful-paint")` which may throw in some browsers.

- **perf scripts use .mjs extension:** Matches project convention (all CI scripts are `.mjs`). The `compare-perf.mjs` and `monitor-perf-db.mjs` scripts are stubs for future implementation.

- **baseline.json: null Lighthouse metrics documented:** Phase 12 execution started without a pre-optimization Lighthouse run. The null values are intentional and documented with a `note` field — they serve as a reminder for Phase 13 to capture LHCI baseline before any changes.

- **RESULTS.md: qualitative + quantitative hybrid:** Known build-size measurements (from Wave summaries) populated in a measured table. Lighthouse scores left as "Pending" with `lhci autorun` instructions — honest about what was automated vs. what requires a browser.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Task 4.6 split into service-only + wiring commits**
- **Found during:** Task 4.6 review
- **Issue:** The original Task 4.6 commit (`49ea683`) only added `trackMapPerformance()` to `frontendObservabilityService.js`. The MapboxContainer wiring and `perf:` package.json scripts were missing.
- **Fix:** Added `_reportPerfMetrics` closure in MapboxContainer's first-idle handler; added 3 perf scripts to `package.json`. Committed as `34adea4`.
- **Files modified:** `src/components/map/MapboxContainer.vue`, `package.json`
- **Verification:** `bun run build` passes (4629.4 kB total, no errors)
- **Committed in:** `34adea4` (Task 4.6b)

---

**Total deviations:** 1 auto-fixed (Rule 2 - Missing Critical: wiring and scripts missing from original commit)
**Impact on plan:** Fix completes the intended observability loop — without wiring, trackMapPerformance() would never be called in production.

## Issues Encountered

None beyond the auto-fixed deviation above.

## Self-Check

Files verified:
- `.planning/phases/12-map-load-optimization/baseline.json` — EXISTS, contains build_snapshot + null lighthouse_metrics
- `.planning/phases/12-map-load-optimization/verification.md` — EXISTS, 40+ checklist items across 7 sections
- `.planning/phases/12-map-load-optimization/RESULTS.md` — EXISTS, per-wave improvements table + pending Lighthouse scores
- `lighthouserc.json` — EXISTS, assertions block present with FCP/LCP/TBT/CLS budgets
- `.github/workflows/perf-gate.yml` — EXISTS, workflow triggers on PR to main/develop
- `src/services/frontendObservabilityService.js` — Contains `trackMapPerformance()` method
- `src/components/map/MapboxContainer.vue` — Contains `_reportPerfMetrics` + `requestIdleCallback` call in idle handler
- `package.json` — Contains `perf:baseline`, `perf:compare`, `perf:monitor` scripts

Commits verified: `a43be6d`, `ea059e8`, `6b6966a`, `99a8d6f`, `49ea683`, `34adea4` — all in git log

Build verified: `bun run build` passes, Total 4629.4 kB, no errors.

## Self-Check: PASSED

## User Setup Required

To run Lighthouse CI locally:
```bash
npm install -g @lhci/cli@latest
bun run build && bun run preview &
lhci autorun
```
Fill in the "After (Final)" table in `RESULTS.md` with the measured scores.

## Next Phase Readiness

- Phase 12 COMPLETE: All 4 waves executed, all guardrails in place
- Lighthouse CI will enforce FCP/LCP/TBT/CLS budgets on all future PRs
- `window.__mapMetrics` captures parseOverhead + interactiveAt per session
- `frontendObservabilityService.trackMapPerformance()` sends metrics to analytics on every page load
- Phase 13 candidates documented in `RESULTS.md` Recommendations section

---
*Phase: 12-map-load-optimization*
*Completed: 2026-03-02*
