# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-03-20
- Current focus: Map/feed stability hardening remains active, and production Thailand venue data now has a completed curation + admin injection baseline with full code coverage (`77/77` provinces, `928/928` districts, `7425/7425` subdistricts) while default localhost Chromium stays preview-first
- Canonical skill: `.agents/skills/vibecity-session-handoff/SKILL.md`

## Start Every Session

1. Read this file completely.
2. Run `git status --short` to understand the current worktree before editing anything.
3. If the task resumes previous runtime or map work, inspect the files listed under `Hot Files` first.
4. If the task is browser-facing, verify the current behavior in a real browser before claiming a fix.
5. When the task changes the stable baseline, update this file before finishing.

## Stable Baseline

- Default dev console should be quiet by default.
- App-side verbose logs are gated behind `isAppDebugLoggingEnabled()`.
- WebSocket config chatter is gated behind `VITE_WS_CONFIG_DEBUG=true` or app debug mode.
- Frontend-only local dev avoids noisy backend proxy lanes by default:
  - `VITE_API_PROXY_DEV=false`
  - `VITE_VISITOR_BOOTSTRAP_DEV=false`
  - `VITE_DIRECTIONS_DEV=false`
- `rsbuild.config.ts` keeps HMR on `/rsbuild-hmr`, uses `logLevel: "warn"`, and now follows the current page host/port by default.
- Only set `RSBUILD_HMR_HOST` or `RSBUILD_HMR_PORT` when a proxy or alternate origin truly requires an override.
- Frontend-only local dev now uses `/map-styles/vibecity-dev.json` as the default local fallback style instead of the full neon style.
- Frontend-only local dev on Chromium now defaults to `preview` renderer mode via `getLocalDevMapRendererMode()`; use `VITE_LOCAL_DEV_MAP_RENDERER=webgl` or the in-app "Open full WebGL map" session opt-in only when intentionally testing the raw renderer.
- Map lifecycle includes WebGL context loss detection and controlled recovery via `useMapCore` and `MapboxContainer.vue`.
- Frontend-only local dev no longer prewarms `useSDFClusters` / `useFluidOverlay` during setup; god-tier WebGL layers only boot after idle in non-local-dev lanes.
- WebGL recovery no longer forces an immediate dev-only reinit; it now waits for a grace period and skips recovery if the map becomes healthy on its own.
- During WebGL restore, resize/source refresh/pin refresh work stays paused until the map is operational again.
- Venue media and reviews fetches are skipped or rerouted in frontend-only dev so localhost does not emit false 404, 504, or CORS noise.
- Video elements only eager-load for active cards, which removed the repeated cache/range churn from the home feed.
- Deprecated LCP entry reads were replaced with `webVitalsService.getLatestVitals()`.

## Hot Files

- `rsbuild.config.ts`
- `public/map-styles/vibecity-dev.json`
- `src/lib/runtimeConfig.js`
- `src/main.js`
- `src/services/visitorIdentity.js`
- `src/services/socketService.js`
- `src/services/shopService.js`
- `src/services/apiClient.js`
- `src/services/partnerService.js`
- `src/services/ownerService.js`
- `src/store/shopStore.js`
- `src/services/webVitalsService.js`
- `src/components/map/MapboxContainer.vue`
- `src/components/ui/FilterMenu.vue`
- `src/composables/useScrollSync.js`
- `src/composables/useAppLogic.js`
- `src/components/dashboard/OwnerDashboard.vue`
- `src/locales/en.json`
- `src/locales/th.json`
- `src/composables/map/useMapCore.js`
- `src/composables/map/useMapAtmosphere.js`
- `src/components/map/layers/WeatherLayer.js`
- `src/components/panel/ShopCard.vue`
- `src/composables/useSmartVideo.js`
- `src/utils/debugFlags.js`
- `src/store/locationStore.js`
- `src/plugins/masterIntegration.js`
- `src/plugins/phase1Integration.js`
- `src/views/HomeView.vue`
- `tests/e2e/helpers/mapProfile.ts`
- `tests/unit/socketService.spec.js`
- `tests/unit/visitorIdentity.spec.js`
- `tests/unit/apiClient.spec.js`
- `tests/unit/shopService.abort.spec.js`

## Validation Commands

- `npx biome check <changed files>`
- `npx vitest run tests/unit/socketService.spec.js tests/unit/apiClient.spec.js tests/unit/shopService.abort.spec.js tests/unit/visitorIdentity.spec.js`
- Browser verification with Playwright against the active local dev server

## Debug Flags And Expected Defaults

- App debug logging:
  - localStorage key `vibecity.debug.app`
  - window flag `__VIBECITY_APP_DEBUG`
- WebSocket debug logging:
  - `VITE_WS_CONFIG_DEBUG=true`
- Local API proxy:
  - `VITE_API_PROXY_DEV=true` only when a backend/proxy is actually serving `/api`
- Visitor bootstrap in dev:
  - `VITE_VISITOR_BOOTSTRAP_DEV=true` only when intentionally validating visitor bootstrap against a live backend
- Directions proxy in dev:
  - `VITE_DIRECTIONS_DEV=true` only when `/proxy/mapbox-directions` is available

## Current Resume Items

- Preserve the "quiet by default" logging policy unless the user explicitly asks for diagnostic verbosity.
- Keep weather/custom-map FX gated behind capability checks; do not reintroduce eager WebGL shader setup on every map boot.
- Keep owner/partner fallback semantics split by mode:
  - frontend-only localhost: return `local_fallback` payloads directly to avoid 504/CORS/401 noise
  - real API lanes: prefer API, then Supabase fallback only when eligible
- Maintain centered-card behavior:
  - first settle on a not-yet-opened venue may open detail once
  - repeated settles on the same venue should not reopen automatically
- Keep giant-pin aggregation tied to `MAP_CONFIG.zoom.giantPin.aggregate.max`; avoid hardcoded zoom caps in map container logic.
- Thailand data baseline for production now includes:
  - foreign-row quarantine via polygon curation: `91,062` rows soft-deleted (`deleted_at` + `is_deleted`)
  - coverage-seed injection: `2,657` active anchors (`38` district + `2,619` subdistrict)
  - post-injection active rows: `96,643`
- Use the curation/injection scripts for future reruns and rollback:
  - `scripts/curate-thailand-production-dataset.mjs`
  - `scripts/inject-thailand-admin-coverage.mjs`
  - `scripts/report-thailand-admin-gaps.mjs`
  - `scripts/reports/thailand-admin-injection.json`
  - `scripts/reports/thailand-admin-gaps-after-injection.json`
- Treat the default localhost Chromium lane as solved: it should enter dev-safe preview mode with zero WebGL, HMR, and forced-reflow console noise.
- If raw renderer investigation resumes, do it only in the explicit WebGL opt-in lane or a minimal upstream repro; do not regress the preview-first default.
- If HMR is ever served through another origin or reverse proxy, use `RSBUILD_HMR_HOST` and `RSBUILD_HMR_PORT` as explicit overrides instead of hardcoding repo defaults.

## Current Snapshot

- Focus: `/th`, `/th/partner`, and `/th/merchant` now run in a quieter localhost lane with explicit local fallback labeling, and map/feed behavior aligns with centered-card auto-open + giant-pin aggregate config.
- Files touched most recently before this memory file:
  - `docs/runbooks/agent-operating-memory.md`
  - `src/services/apiClient.js`
  - `src/services/partnerService.js`
  - `src/services/ownerService.js`
  - `src/components/dashboard/OwnerDashboard.vue`
  - `src/components/ui/FilterMenu.vue`
  - `src/composables/useScrollSync.js`
  - `src/composables/useAppLogic.js`
  - `src/components/map/MapboxContainer.vue`
  - `src/locales/en.json`
  - `src/locales/th.json`
  - `tests/unit/apiClient.spec.js`
- Validation already confirmed:
  - `npx biome check` on changed frontend/service/locale/test files passed (11 files).
  - `npx vitest run tests/unit/socketService.spec.js tests/unit/apiClient.spec.js tests/unit/shopService.abort.spec.js tests/unit/visitorIdentity.spec.js` passed (`14/14` tests).
  - `bun run build` passed.
  - Playwright verification against `http://127.0.0.1:5173` confirmed:
    - `/th/partner` and `/th/merchant` load with no console warnings/errors and show explicit fallback states.
    - mobile carousel settle can push venue route and open detail flow, then does not reopen on repeated no-op settle for the same venue.
    - filter menu interaction no longer reproduces the prior `aria-hidden` focus warning or non-cancelable `touchmove` prevent warning.
  - Data curation + injection verification confirmed:
    - applied migration `fix_venue_location_triggers_postgis_qualification` (qualifies PostGIS type/function references in venue location triggers under `search_path=''`)
    - `node scripts/curate-thailand-production-dataset.mjs --mode=apply` quarantined `91,062` foreign/out-of-country rows
    - `node scripts/inject-thailand-admin-coverage.mjs --mode=apply --level=both` inserted `2,657` coverage anchors
    - `node scripts/report-thailand-admin-gaps.mjs --out=scripts/reports/thailand-admin-gaps-after-injection.json` reports `0` missing provinces/districts/subdistricts
    - `node scripts/test_map_pins.mjs` passed, `node scripts/test_count_null_location.mjs` passed
    - `node scripts/smoke-db-compat.mjs` still reports pre-existing missing RPCs: `get_venue_stats`, `get_partner_dashboard_metrics`
- Residual note:
  - The default localhost Chromium lane should stay on preview mode unless a developer explicitly opts into full WebGL for diagnostics.
  - If raw WebGL/neon aggregation checks resume, first opt in intentionally (`sessionStorage['vibecity.dev.mapRenderer']='webgl'` or `VITE_LOCAL_DEV_MAP_RENDERER=webgl`) before concluding map-layer regressions.
  - `tests/e2e/map-comprehensive.spec.ts` currently fails in default Chromium lane because it assumes raw MapLibre DOM selectors (`.maplibregl-map`) instead of preview-mode behavior.

## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
