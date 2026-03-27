# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-03-27
- Current focus: Real-shop-media is the active tranche again, with cards, drawers, and the venue modal now expected to render from `real_media` / `media_counts` instead of external Google photo or YouTube fallback sources.
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
- The map now uses `/map-styles/vibecity-neon.json` as the default fallback style in all frontend lanes, including localhost.
- Localhost Chromium now boots directly into the same WebGL renderer path as production; the temporary preview HUD, preview pins, and session renderer toggle have been removed.
- Legacy session keys such as `vibecity.dev.mapRenderer` are now ignored by the app and no longer affect renderer selection.
- Map lifecycle includes WebGL context loss detection and controlled recovery via `useMapCore` and `MapLibreContainer.vue`.
- Frontend-only local dev no longer prewarms `useSDFClusters` / `useFluidOverlay` during setup; god-tier WebGL layers only boot after idle in non-local-dev lanes.
- WebGL recovery no longer forces an immediate dev-only reinit; it now waits for a grace period and skips recovery if the map becomes healthy on its own.
- During WebGL restore, resize/source refresh/pin refresh work stays paused until the map is operational again.
- Venue media and reviews fetches are skipped or rerouted in frontend-only dev so localhost does not emit false 404, 504, or CORS noise.
- Video elements only eager-load for active cards, which removed the repeated cache/range churn from the home feed.
- Deprecated LCP entry reads were replaced with `webVitalsService.getLatestVitals()`.
- Admin fallback emails are no longer hardcoded in backend defaults, Supabase edge helpers, or admin bootstrap/grant scripts; allowlists are explicit environment configuration only.
- Audited map marker update paths now avoid `.innerHTML` for user-derived strings and use `textContent` or explicit DOM/SVG composition instead.
- `repo-deep-audit` now supports rule-level path exclusions plus SQL comment stripping, and scorecards should be regenerated only after the latest signals file has been written.

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
- `src/components/map/MapLibreContainer.vue`
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
- `src/components/ui/SwipeCard.vue`
- `src/components/modal/VibeModal.vue`
- `src/components/feed/BottomFeed.vue`
- `src/composables/engine/useChromaticGlass.js`
- `src/composables/useSmartVideo.js`
- `src/utils/debugFlags.js`
- `src/store/locationStore.js`
- `src/plugins/masterIntegration.js`
- `src/plugins/phase1Integration.js`
- `src/views/HomeView.vue`
- `scripts/performance/profile-home-runtime.mjs`
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
- The worktree is still globally dirty; do not assume unrelated modified files belong to the current task.
- The active media endpoints are:
  - `GET /api/v1/shops/media`
  - `GET /api/v1/shops/{shop_id}/media`
- Bulk shop/feed flows enrich venue rows from `/api/v1/shops/media`, while venue detail still calls the per-shop endpoint with `hydrate_missing_image=true`.
- Visible shop UI should read normalized real-media state from `resolveVenueMedia()` and `media_counts`; do not reintroduce Google Places photo or YouTube search fallback in cards or the venue modal.
- Backend test runs should use `C:\vibecity.live\backend\.venv\Scripts\python.exe`; the global Python on this machine still has the older `websockets` package mismatch.
- On Windows, run the repo checklist with `PYTHONIOENCODING=utf-8`; the default CP1252 console can still fail on emoji output before real validation begins.
- Repo-wide checklist currently stops at the global lint lane; rely on targeted changed-file validation unless that lane is repaired first.

## Current Snapshot

- Focus: Ship the real-shop-media tranche end to end so every visible shop surface reads real image/video payloads and counts from the backend media API rather than external fallback media helpers.
- Session plan artifact:
  - `.planning/20260327-real-shop-media-api.md`
- Files touched in this session:
  - `backend/app/services/venue_media_service.py`
  - `backend/app/api/routers/shops.py`
  - `backend/app/services/venue_repository.py`
  - `backend/tests/test_shop_media_api.py`
  - `src/domain/venue/viewModel.js`
  - `src/components/panel/ShopCard.vue`
  - `src/components/ui/SwipeCard.vue`
  - `src/components/modal/VibeModal.vue`
  - `src/services/shopService.js`
  - `src/store/shopStore.js`
  - `tests/unit/venueViewModel.media.spec.js`
  - `docs/runbooks/agent-operating-memory.md`
- Behavior changed in this session:
  - `backend/app/services/venue_media_service.py` now aggregates real media from venue rows, approved `venue_photos`, and direct social/video links, with optional Google Places image hydration for single-shop requests.
  - `backend/app/api/routers/shops.py` now exposes `/api/v1/shops/media` for bulk coverage and `/api/v1/shops/{shop_id}/media` for detail hydration.
  - `src/services/shopService.js` now normalizes real-media records, caches the bulk index, and merges rows so the real media payload becomes the frontend source of truth.
  - `src/domain/venue/viewModel.js` now treats explicit `real_media` / `media_counts` as authoritative, carries normalized media counts through the venue view model, and maps `social_links` into the UI-facing fields.
  - `src/components/panel/ShopCard.vue`, `src/components/ui/SwipeCard.vue`, and `src/components/modal/VibeModal.vue` now read real media directly and no longer fall back to Google Places photos or YouTube search results for this tranche.
  - `src/store/shopStore.js` now enriches feed/search/detail venue rows with real media before normalizing UI state.
  - `backend/app/services/venue_repository.py` now tolerates the broader offline/storage fallback exceptions needed by the existing drift tests.
- Validation confirmed in this session:
  - `npx biome check src/domain/venue/viewModel.js src/services/shopService.js src/store/shopStore.js src/components/panel/ShopCard.vue src/components/ui/SwipeCard.vue src/components/modal/VibeModal.vue tests/unit/venueViewModel.media.spec.js` passes.
  - `npx vitest run tests/unit/venueViewModel.media.spec.js` passes.
  - `C:\vibecity.live\backend\.venv\Scripts\python.exe -m pytest tests/test_shop_media_api.py tests/test_venues_shops_drift.py -q` passes.
- Residual note:
  - The worktree remains globally dirty; only the files listed above belong to this tranche.
  - Repo-wide `checklist.py` still stops at the global lint lane, so targeted validations are the current trusted signal for this tranche.

## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
