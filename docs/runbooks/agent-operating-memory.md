# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-03-25
- Current focus: Home / map / dashboard recovery remains the functional baseline, and phase 2 repository stabilization has now cleared the repo's merge-blocker state. The latest tranche resolved all previously unmerged files, kept the MapLibre migration baseline, tightened Vercel CSP, and aligned Supabase Edge `verify_jwt` policy for admin-only functions while backend-side `get_map_pins` 500 investigation remains a separate follow-up.
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
- Map lifecycle includes WebGL context loss detection and controlled recovery via `useMapCore` and `MapLibreContainer.vue`.
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
- The worktree is still globally dirty, but the repo is no longer blocked by unmerged files.
- Imported external skills still live under `skills/` and `.agents/skills/`; re-run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/import_external_skills.ps1` if the source `.skill` archives change.
- Use these session artifacts first when resuming this lane:
  - `.planning/20260325-skill-import-and-project-audit.md`
  - `.planning/20260325-phase2-repo-stabilization.md`
  - `.planning/20260325-conflict-resolution-batch.md`
  - `docs/skills/imported-external-skills.md`
  - `docs/audits/20260325-ultrathink-project-audit.md`
- `.agents/skills/vibecity-session-handoff/SKILL.md` remains the canonical resume skill for this repo.
- CI now has a dedicated `repo-hygiene` lane, and it currently passes after the conflict-resolution batch.
- `api/index.py` remains the Vercel Python entrypoint shim that imports `backend/app/main.py`.
- Keep `en` as the default for first-visit and invalid-locale normalization, but preserve `/th/...` links and explicit stored locale choices.
- `PartnerDashboard.vue` should stay page-gated; do not reintroduce `useDashboardGuard("partner")` on that route.
- Map safe mode is session-latched via `ff_map_shader_safe_mode_v1` + `vibecity.map.safe-mode-latched`; do not re-enable advanced layers automatically after a shader/runtime attach failure in the same session.
- Popup/modal media verification still relies on:
  - `popup-live-bar`
  - `popup-media`
  - `vibe-modal-media`
  - `vibe-modal-fallback`
- Remaining hardening follow-ups are now narrower:
  - if anonymous checkout is ever removed, re-evaluate `verify_jwt` for `create-checkout-session` and `create-manual-order`
  - if we want to remove CSP `unsafe-inline`, first externalize inline JSON-LD/style blocks from `public/index.html`
  - continue separate backend follow-up for persistent `get_map_pins` 500s via `docs/followups/get-map-pins-500.md`

## Current Snapshot

- Focus: repository stabilization is now past the merge-conflict phase and into targeted hardening / cleanup.
- Files touched in this session:
  - `.planning/20260325-conflict-resolution-batch.md`
  - `.planning/STATE.md`
  - `docs/runbooks/agent-operating-memory.md`
  - `src/i18n.js`
  - `backend/app/main.py`
  - `bun.lock`
  - `src/components/dashboard/OwnerDashboard.vue`
  - `src/components/feed/BottomFeed.vue`
  - `src/components/map/MapLibreContainer.vue`
  - `src/components/panel/MerchantRegister.vue`
  - `src/components/ui/ConsentBanner.vue`
  - `src/components/ui/FilterMenu.vue`
  - `src/components/ui/VibeActionSheet.vue`
  - `src/components/ui/VibeBanner.vue`
  - `src/composables/map/useMapCore.js`
  - `src/composables/map/useMapLayers.js`
  - `src/composables/map/useMapMarkers.js`
  - `src/composables/useAppLogic.js`
  - `src/locales/en.json`
  - `src/locales/th.json`
  - `src/styles/map-atmosphere.css`
  - `src/utils/mapRenderer.js`
  - `src/views/HomeView.vue`
  - `vercel.json`
  - `supabase/config.toml`
  - `scripts/release/config/function-allowlist.json`
- Validation confirmed in this session:
  - `git diff --name-only --diff-filter=U` is now empty; all previously unmerged files were resolved.
  - `node scripts/ci/check-repo-hygiene.mjs` passes.
  - `npx vue-tsc --noEmit --pretty false` passes.
  - `bun run build` passes.
  - `python -m py_compile backend/app/main.py api/index.py` passes.
  - `vercel.json` parses successfully and its CSP no longer contains `unsafe-eval`.
  - `supabase/config.toml` and `scripts/release/config/function-allowlist.json` are in sync for shared function `verify_jwt` policy.
- Residual note:
  - The worktree is still globally dirty; do not assume unrelated modified files belong to this stabilization tranche.
  - `create-checkout-session` and `create-manual-order` intentionally remain `verify_jwt = false` because anonymous payment entry is still supported.
  - CSP is tighter, but `script-src 'unsafe-inline'` still remains because `public/index.html` currently embeds inline JSON-LD, inline styles, and a stylesheet `onload` attribute.
  - Persistent `get_map_pins` 500s and backend-side map pin contract issues remain separate follow-up work.

## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
