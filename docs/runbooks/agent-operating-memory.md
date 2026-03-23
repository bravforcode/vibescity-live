# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-03-22
- Current focus: Vercel production for `https://www.vibescity.live` now points at `origin/main@b603937` through deployment `https://vibescity-nah74ore5-phirawits-projects.vercel.app`; latest follow-up work is cleaning Playwright/CI reporting so headless-only GPU and tile-cancel noise is suppressed from automation summaries while real console regressions remain actionable
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
  - keep `ui-console-budget` wired into every Playwright lane so step summaries keep surfacing actionable vs suppressed console signal automatically
  - keep Playwright commands routed through `scripts/run-playwright-cli.mjs` and invoked via `bun run ...` so nested worktrees do not fall back to a parent install and reintroduce the loader-context issue
  - keep `@playwright/test` and `playwright` pinned to the same exact version; do not reintroduce caret drift between them
  - app/runtime regressions must stay `reportable: true`; do not broaden suppression rules beyond clearly headless/browser-only cases
  - visual lanes now emit `reports/visual/junit.xml`; if those jobs ever change config, keep the summary path in sync instead of dropping console signal coverage

## Current Snapshot

- Focus: production runtime is stable on `main@b603937`; current repo-side follow-up aligned Playwright package versions to `1.58.2` and moved Playwright package-manager paths to Bun while keeping the local CLI wrapper in place.
- Files touched most recently before this memory file:
  - `bun.lock`
  - `scripts/run-playwright-cli.mjs`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `.github/workflows/e2e.yml`
  - `.github/workflows/playwright.yml`
  - `.github/workflows/sonarcloud.yml`
  - `.github/workflows/synthetic-postdeploy-monitor.yml`
  - `.github/workflows/dashboard-canary-gates.yml`
  - `.github/workflows/visual-regression.yml`
  - `docs/runbooks/agent-operating-memory.md`
- Validation already confirmed:
  - `bun install --frozen-lockfile` passes after aligning Playwright versions.
  - `bun run test:visual:list` now lists all 7 visual tests successfully from the clean worktree.
  - `bun run test:visual -- tests/visual/dashboard.visual.spec.ts --list` now lists the targeted dashboard visual tests successfully.
  - `bun run test:e2e -- --list` now lists the full E2E matrix successfully through the wrapper.
  - `bunx biome check package.json scripts/run-playwright-cli.mjs` passes.
  - `git diff --check` passes.
- Residual note:
  - Original workspace remains a dirty tree; deployment work this round was executed from clean worktree `C:\vibecity.live\.vercel-main-localui-8b159cc`.
  - The old failure was caused by `npx playwright` resolving a different Playwright install than the one the clean worktree test files imported. The wrapper plus Bun-based repo commands avoid that class of issue for local and CI commands that go through repo scripts/workflows.
  - The reporting cleanup is repo/CI-only; it does not require a Vercel redeploy to affect production runtime behavior.

## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
