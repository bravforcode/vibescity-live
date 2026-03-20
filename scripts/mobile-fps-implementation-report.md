# Mobile 60FPS Autopilot - Implementation Report

## Scope Executed
This report records the implementation of:
1. CI FPS guardrail (p95 + fail gate)
2. Mobile benchmark scripts (Android/iOS profiles + scenario matrix)
3. Runtime/bootstrap wiring for systems that were previously not auto-run
4. iOS physical-device instrumentation ingestion (Xcode Instruments export)
5. Branch protection automation to require Map FPS guardrail check

## Delivery Summary
- Added automated FPS benchmark runner for Android/iOS profiles.
- Added CI guardrail evaluator with scenario/profile thresholds.
- Added GitHub Actions workflow that runs benchmark + hard fail gate.
- Added real-device benchmark helper (Android real via ADB, iOS profile lane).
- Added iOS Instruments export ingestion pipeline for physical-device metrics.
- Added branch protection automation script for required status checks.
- Wired runtime performance autopilot into app bootstrap.
- Wired neon pin atlas + cluster virtualization into active map pipeline.

## Files Added
1. `.github/workflows/map-fps-guardrail.yml`
2. `scripts/ci/map-fps-thresholds.json`
3. `scripts/ci/check-map-fps-guardrail.mjs`
4. `scripts/performance/run-mobile-fps-benchmark.mjs`
5. `scripts/performance/run-real-device-mobile-benchmark.mjs`
6. `src/composables/performance/usePerformanceAutopilot.js`
7. `scripts/performance/ingest-ios-instruments-export.mjs`
8. `scripts/ci/set-map-fps-required-check.mjs`

## Files Updated
1. `package.json`
2. `src/App.vue`
3. `src/composables/useServiceWorker.js`
4. `src/composables/map/useNeonSignSpriteCache.js`
5. `src/composables/useClusterVirtualization.js`
6. `src/components/map/MapboxContainer.vue`
7. `scripts/mobile-60fps-autopilot-catalog.md`
8. `.github/workflows/map-fps-guardrail.yml`

## Runtime Wiring (Bootstrap)
### 1) Performance optimizer + monitor auto-run
- `src/composables/performance/usePerformanceAutopilot.js`
- Mounted from `src/App.vue`
- Emits periodic runtime guardrail telemetry (`guardrail_performance_autopilot`)

### 2) Service worker composable bootstrap wiring
- `src/composables/useServiceWorker.js` now supports options:
  - `scriptURL`
  - `scope`
  - `autoRegister`
  - `autoReloadOnControllerChange`
- `src/App.vue` wires it via performance autopilot with `/sw.js` target.

### 3) Pin atlas connected to neon path
- `src/composables/map/useNeonSignSpriteCache.js` supports `onGenerated` callback.
- `src/components/map/MapboxContainer.vue` registers generated neon sprites into `usePinAtlas` and batches atlas rebuild.

### 4) Cluster virtualization connected to map feature pipeline
- `src/composables/useClusterVirtualization.js` adds:
  - `replaceClusters()`
  - `setMaxVisibleClusters()`
- `src/components/map/MapboxContainer.vue` now applies cluster virtualization budget before pushing source data.

## CI/Pipeline Wiring
### 1) Benchmark runner
- `scripts/performance/run-mobile-fps-benchmark.mjs`
- Profiles: `android`, `ios`
- Scenarios:
  - `baseline`
  - `thermal-moderate`
  - `thermal-high`
  - `battery-low`
  - `network-4g`
  - `network-3g`
  - `network-2g`

### 2) Guardrail evaluator
- `scripts/ci/check-map-fps-guardrail.mjs`
- Input: benchmark JSON report
- Threshold source: `scripts/ci/map-fps-thresholds.json`
- Fails CI if p95/avg/sample-count thresholds are not met.

### 3) GitHub Actions fail gate
- `.github/workflows/map-fps-guardrail.yml`
- Trigger: PR to `main`, push to `main`, manual dispatch
- Runs benchmark matrix + guardrail evaluator
- Uploads artifacts:
  - benchmark report
  - markdown summary
  - JSON summary

## Real-device Script
- `scripts/performance/run-real-device-mobile-benchmark.mjs`
- Android lane:
  - uses ADB + `dumpsys gfxinfo` percentile metrics (real device)
- iOS lane:
  - accepts `--ios-instruments-export` and ingests Xcode Instruments export via `scripts/performance/ingest-ios-instruments-export.mjs`
  - falls back to iOS profile lane when no export file is provided

## iOS Instruments Ingestion
- Script: `scripts/performance/ingest-ios-instruments-export.mjs`
- Supports export formats: JSON / CSV / plist-like XML / structured text
- Normalizes to guardrail-compatible metrics:
  - `metrics.fps.{avg,p50,p95,p99,min,max}`
  - `metrics.frame_ms.{avg,p50,p95,p99,min,max}`
  - `metrics.samples` and `slow_frame_ratio`

### Example (ingest only)
```bash
node scripts/performance/ingest-ios-instruments-export.mjs \
  --input reports/performance/ios-instruments-export.json \
  --output reports/performance/map-fps-ios-instruments-ingested.json \
  --profile ios \
  --scenario baseline \
  --device-name "iPhone 15 Pro"
```

### Example (real-device benchmark with ingestion)
```bash
node scripts/performance/run-real-device-mobile-benchmark.mjs \
  --platform ios \
  --scenario baseline \
  --ios-instruments-export reports/performance/ios-instruments-export.json \
  --ios-device-name "iPhone 15 Pro" \
  --output reports/performance/map-fps-real-device.json
```

## Branch Protection Required Check
- Script: `scripts/ci/set-map-fps-required-check.mjs`
- NPM command: `npm run ci:branch-protect:map-fps`
- Default target:
  - branch: `main`
  - required context: `map-fps-guardrail`
- Safety:
  - merges with existing required checks (does not drop existing contexts)
  - `--dry-run` supported
  - `--bootstrap-unprotected` supported for repos without existing branch protection

### Example
```bash
GITHUB_TOKEN=*** GITHUB_REPOSITORY=owner/repo \
node scripts/ci/set-map-fps-required-check.mjs --branch main --context map-fps-guardrail
```

## Commands
### Local benchmark
```bash
node scripts/performance/run-mobile-fps-benchmark.mjs --output reports/performance/map-fps-benchmark.json
```

### Local guardrail check
```bash
node scripts/ci/check-map-fps-guardrail.mjs --input reports/performance/map-fps-benchmark.json
```

### Local real-device helper
```bash
node scripts/performance/run-real-device-mobile-benchmark.mjs --platform both --url http://127.0.0.1:5808
```

## Notes
- Thresholds are intentionally scenario-specific and include iOS profile overrides.
- Guardrail is hard-fail by design to protect p95 FPS target in CI.
- Runtime changes are fail-open where possible to avoid blocking map rendering.
