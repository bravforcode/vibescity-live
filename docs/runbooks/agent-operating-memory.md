# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-03-23
- Current focus: Local UI/runtime investigation is active alongside the existing map/feed hardening lane; current `main` remains the source-of-truth for the "Hardened" sidebar/filter/card UI while the deploy-facing `origin/main` line has diverged to a different sidebar/filter/card implementation
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
- If the browser appears to show reverted UI, first confirm the actual instance URL and serving folder before touching source files.
- The currently observed Brave tab at `http://127.0.0.1:5175/` belongs to `C:\gosoft demo\frontend`, not `C:\vibecity.live`.
- For this repo, use `http://localhost:5173/` when validating local UI from `C:\vibecity.live`.
- Treat current `main` as the source-of-truth for the "Hardened" UI strings/components:
  - `src/components/ui/SidebarDrawer.vue`
  - `src/components/ui/FilterMenu.vue`
  - `src/components/panel/ShopCard.vue`
- Treat `origin/main` and worktree `release/local-ui-sync-20260321` as a different UI line:
  - sidebar uses `Business`/`My Vibes` sections instead of the "Hardened" drawer
  - filter menu is the bottom-sheet redesign, not the right-side "FILTER VIBE" panel
  - shop card includes tilt/blur-up/pull-up affordances not present in local `main`
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
- Keep `@rspack/binding-linux-x64-gnu` pinned at `1.7.3` while `@rspack/core` remains `1.7.3`; upgrade them together only.
- If deploy builds start failing with "module not found" on map/runtime utilities, verify the support files are committed on the target branch (not only present in a dirty local worktree).

## Current Snapshot

- Focus: UI regression investigation determined the apparent rollback was caused by instance confusion first, and branch divergence second.
- Files touched most recently before this memory file:
  - `docs/runbooks/agent-operating-memory.md`
  - `package.json`
  - `bun.lock`
  - `src/lib/runtimeConfig.js`
  - `src/services/shopService.js`
  - `src/services/api/dashboardApiAdapter.js`
  - `src/config/mapConfig.js`
  - `src/composables/map/useNeonPinsLayer.js`
  - `src/composables/map/useNeonSignTheme.js`
  - `src/composables/map/useSmartMarkers.js`
  - `src/composables/map/prefetchCriticalPins.js`
  - `src/components/map/NeonPinSign.vue`
  - `src/components/ui/AsyncFallback.vue`
  - `src/utils/debugFlags.js`
  - `src/utils/mapDebug.js`
  - `src/utils/mapPinHierarchy.js`
  - `src/utils/mapZoomLevels.js`
  - `src/utils/neonLayoutEngine.js`
  - `src/utils/networkErrorUtils.js`
  - `src/utils/retryPolicy.js`
  - `src/utils/supabaseReadPolicy.js`
- Files touched in this session:
  - `bun.lock`
  - `docs/runbooks/agent-operating-memory.md`
  - deploy-facing worktree `C:\vibecity.live\.vercel-main-localui-8b159cc\src\components\ui\SidebarDrawer.vue`
  - deploy-facing worktree `C:\vibecity.live\.vercel-main-localui-8b159cc\src\components\ui\FilterMenu.vue`
  - deploy-facing worktree `C:\vibecity.live\.vercel-main-localui-8b159cc\src\components\panel\ShopCard.vue`
- Validation already confirmed:
  - `bun run build` passed in `C:\vibecity.live\.codex-clean-push-20260320`.
  - `staging` now contains deployment-fix commits `1bc3e2e` and `137ac3f` (after `f889752` map/feed fixes).
  - Vercel production deployment `dpl_XL9SypCCf913Tobn3Sc7DVNkmwv6` reached `Ready` with aliases attached to `https://www.vibescity.live`.
- Validation confirmed in this session:
  - `git worktree list --porcelain` confirmed the deploy-facing worktree `C:/vibecity.live/.vercel-main-localui-8b159cc` tracks branch `release/local-ui-sync-20260321`.
  - `Get-CimInstance Win32_Process` confirmed the active Brave tab was opened at `http://127.0.0.1:5175/` from a Vite process in `C:\gosoft demo\frontend`.
  - `bun install` restored missing local dependency resolution for `mapbox-gl` in this workspace and updated `bun.lock`.
  - `bun run dev` on `C:\vibecity.live` now starts `rsbuild` on `http://localhost:5173/`.
  - Comparing `main` vs `origin/main` confirmed the "Hardened" sidebar/filter/card UI lives on local `main`, while `origin/main` has a different sidebar/filter/card implementation.
  - The deploy-facing worktree now has the local `main` "Hardened" UI ported into `SidebarDrawer.vue`, `FilterMenu.vue`, and `ShopCard.vue`, with the drawer adapted to preserve the existing `open-favorites` event contract.
  - `npx biome format --write src/components/ui/SidebarDrawer.vue src/components/ui/FilterMenu.vue src/components/panel/ShopCard.vue` passed in `C:\vibecity.live\.vercel-main-localui-8b159cc`.
  - `npx biome check --write src/components/ui/SidebarDrawer.vue src/components/ui/FilterMenu.vue src/components/panel/ShopCard.vue` passed in `C:\vibecity.live\.vercel-main-localui-8b159cc`.
  - `bun run build` passed in `C:\vibecity.live\.vercel-main-localui-8b159cc` after the UI port.
  - Searching the built output confirmed the deploy worktree bundle now contains the expected Hardened UI strings such as `Vibe Explorer`, `Daily Check-in`, `Lucky Wheel`, and the right-side filter panel label `FILTER VIBE`.
- Residual note:
  - Original workspace remains a dirty tree with additional unpushed local changes; deploy-critical updates were shipped from clean clone `C:\vibecity.live\.codex-clean-push-20260320`.
  - Keep preview-first local Chromium behavior as default; only opt into raw WebGL intentionally for diagnostics.
  - `public/index.html` still references `/static/js/index.js` plus `/src/main.js`; local UI validation should be done against the served bundle and the actual running URL, not by assuming the browser is pointed at this repo's source automatically.
  - The deploy-facing worktree already had unrelated modified workflow/package files before this UI port; do not revert or bundle those blindly when preparing the UI sync commit.

## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
