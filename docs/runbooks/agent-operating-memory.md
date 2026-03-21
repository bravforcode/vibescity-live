# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-03-21
- Current focus: Vercel production for `https://www.vibescity.live` now points at `origin/main@b930d36` through deployment `dpl_FyAcSWNoJDLDt8wcFGjEjNFP3dMH`; the production-safe runtime hardening is still intact and the latest local neon UI sync is live, including `VibeBanner`, neon sign markers, `YouAreHere`, and `VibeActionSheet`
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
- Treat the default localhost Chromium lane as solved: it should enter dev-safe preview mode with zero WebGL, HMR, and forced-reflow console noise.
- If raw renderer investigation resumes, do it only in the explicit WebGL opt-in lane or a minimal upstream repro; do not regress the preview-first default.
- If HMR is ever served through another origin or reverse proxy, use `RSBUILD_HMR_HOST` and `RSBUILD_HMR_PORT` as explicit overrides instead of hardcoding repo defaults.
- Keep `@rspack/binding-linux-x64-gnu` pinned at `1.7.3` while `@rspack/core` remains `1.7.3`; upgrade them together only.
- If deploying while `C:\vibecity.live` is dirty, build and deploy from a fresh tracked-only worktree of `origin/main` instead of the root workspace.
- `scripts/ci/check-source-i18n-hardcoded.mjs` now exists on `main` and merges both JSON locales plus inline locale keys from `src/i18n.js`; if it fails again, inspect missing source keys before touching locale parity logic.
- `.vercel/` is now ignored on `main`; keep Vercel metadata local-only.
- Production should be promoted only from a clean worktree linked to the real Vercel project `vibescity`; an unlinked worktree can cause Vercel to auto-create a separate project from the folder name.
- Keep checking browser-visible output after each production deploy; `HTTP 200` alone was not enough to catch stale alias drift or missing local-only UI sync.
- Keep `public/map-styles/vibecity-neon.json` and `public/map-styles/vibecity-dev.json` tracked; if either disappears, production will silently fall back to `index.html` and MapLibre will fail again.
- If `vibecity-api.fly.dev` gains real support for `visitor/bootstrap`, `proxy/mapbox-directions`, or `hot-roads`, remove the host entry from `src/lib/runtimeLaneAvailability.js` and re-verify the live browser behavior before re-enabling those lanes.
- Current non-blocking production noise to watch next:
  - headless Chromium may still emit `GL_CLOSE_PATH_NV` / `ReadPixels` warnings during automation; treat those as browser/GPU noise unless they reproduce in user-visible sessions
  - some Supabase video requests still end with `net::ERR_FAILED` or `net::ERR_ABORTED` when cards/media swap mid-load; confirm in a real user session before treating that as a production bug

## Current Snapshot

- Focus: the latest local neon UI snapshot has been integrated onto the production-safe `main` baseline and is now live. `https://www.vibescity.live` resolves to `dpl_FyAcSWNoJDLDt8wcFGjEjNFP3dMH` / `https://vibescity-3dd0vaom9-phirawits-projects.vercel.app`.
- Files touched most recently before this memory file:
  - `src/components/map/MapboxContainer.vue`
  - `src/components/ui/VibeActionSheet.vue`
  - `src/components/ui/VibeBanner.vue`
  - `src/components/ui/YouAreHere.vue`
  - `src/composables/map/useMapCore.js`
  - `src/composables/map/useMapLayers.js`
  - `src/composables/map/useMapMarkers.js`
  - `src/styles/map-atmosphere.css`
  - `src/utils/mapRenderer.js`
  - `src/views/HomeView.vue`
  - `src/i18n.js`
  - `vercel.json`
  - `docs/runbooks/agent-operating-memory.md`
- Validation already confirmed:
  - `git ls-remote origin refs/heads/main` now resolves to `b930d36f393da111cad995d44347b16a03c698eb`.
  - `npx biome check` on the 11 local UI sync files passes with one intentional warning for marker `z-index: ... !important`.
  - `bun run build` passed in `C:\vibecity.live\.vercel-main-localui-8b159cc`.
  - `git push origin HEAD:main` promoted the integrated snapshot from clean worktree branch `release/local-ui-sync-20260321` to `origin/main`.
  - `vercel deploy --prod --yes --scope phirawits-projects` from `C:\vibecity.live\.vercel-main-localui-8b159cc` completed and aliased production to `https://www.vibescity.live`.
  - `vercel inspect https://www.vibescity.live` now reports deployment `dpl_FyAcSWNoJDLDt8wcFGjEjNFP3dMH` / `https://vibescity-3dd0vaom9-phirawits-projects.vercel.app`.
  - Fresh Playwright browser verification on production shows the local neon UI sync live: marquee `VibeBanner`, neon sign map markers, `YOU ARE HERE`, popup card actions, and `VibeActionSheet` buttons (`claim_vibe`, `take_me_there`) all render on `https://www.vibescity.live/th`.
- Residual note:
  - Original workspace remains a dirty tree; deployment work this round was executed from clean worktree `C:\vibecity.live\.vercel-main-localui-8b159cc`.
  - Local `bun install --frozen-lockfile` in that worktree hit intermittent `EBUSY` cache-copy failures, but existing dependencies were sufficient for local build and Vercel’s install/build completed successfully.
  - Fresh Playwright production verification still logged two non-blocking Supabase video `net::ERR_FAILED` requests for `ff1211bab14dd7f6aff392d09a0d15cec668081b.mp4` after venue detail opened; UI remained functional.

## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
