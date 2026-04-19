# Agent Operating Memory

> Read this file before every work session in `C:\vibecity.live`.

- Last updated: 2026-04-19
- Current focus: Keep `vibescity.live` stable on Vercel `frontend` production deployment `dpl_8Nkh4xP3SGFZM6wYabcXsMX36Ewt`, keep public production WebSocket auto-connect enabled only with the verified `VITE_WS_PUBLIC_AUTOCONNECT=true` + clean `VITE_WS_URL` configuration, keep the 61MB media index under Git LFS, keep `www.vibescity.live` redirected through the tiny `vercel-domain-redirect` deployment, and preserve the latest Composition API refactor, map placeholder/loading behavior, refreshed venue snapshot, browser analytics/Clarity, and public-host fallbacks.
- Canonical skill: `.agents/skills/vibecity-session-handoff/SKILL.md`

## Start Every Session

1. Read this file completely.
2. Run `git status --short` to understand the current worktree before editing anything.
3. If the task resumes previous runtime or map work, inspect the files listed under `Hot Files` first.
4. If the task is browser-facing, verify the current behavior in a real browser before claiming a fix.
5. When the task changes the stable baseline, update this file before finishing.

## Latest Session Notes (2026-04-17)

- Ran local validation and runtime smoke tests (dev `5173`, E2E preview `5417`).
- Playwright smoke passed on `Desktop Chromium` and `Mobile Safari (iOS)` after stabilizing selectors and mobile timing in [smoke.spec.ts](file:///c:/vibecity.live/tests/e2e/smoke.spec.ts).
- Mobile Chrome (Android) smoke now passes on the same preview target after startup hardening (`12 passed`, `3 skipped`), so the previous reproducible timeout is no longer observed in this local lane.
- New profiling + CI automation landed for daily performance tracking: `scripts/performance/profile-home-runtime.mjs` supports `--steps home|full`, `scripts/performance/capture-har.mjs` captures HAR, and `scripts/ci/build-daily-performance-dashboard.mjs` emits `reports/ci/daily-performance-dashboard.json` with threshold-based alerts.
- New performance gate evaluator `scripts/ci/evaluate-lighthouse-perf-gate.mjs` enforces p75-style Lighthouse thresholds and now fails explicitly when `.lighthouseci` has no usable LHR JSON.
- Added scheduled workflow `.github/workflows/daily-performance-dashboard.yml` to build preview, capture mobile profile + HAR, generate dashboard artifacts, and fail on threshold breaches.
- Lighthouse (simulated throttling) on `http://localhost:5417/en` remains poor (`LCP ~11.1s`, `TBT ~3.1s`, perf score `~0.33`), so merge-blocking perf thresholds (`LCP <= 2.5s`, `TBT <= 200ms`) are intentionally still unmet.
- Repo security scan flagged patterns (localStorage reads, unescaped map popup html); review findings before shipping any user-derived strings into DOM.
- Backend pytest needs `$env:PYTHONDONTWRITEBYTECODE="1"` in this sandbox environment to avoid blocked `.pyc` writes.

## Stable Baseline

- Default dev console should be quiet by default.
- Bundler builds still resolve `vue-i18n` through the runtime-only build, and `src/i18n.js` now precompiles merged locale leaf strings into CSP-safe formatter functions so locale JSON renders translated copy without the experimental custom message compiler warning.
- App-side verbose logs are gated behind `isAppDebugLoggingEnabled()`.
- WebSocket config chatter is gated behind `VITE_WS_CONFIG_DEBUG=true` or app debug mode.
- Frontend-only local dev avoids noisy backend proxy lanes by default:
  - `VITE_API_PROXY_DEV=false`
  - `VITE_VISITOR_BOOTSTRAP_DEV=false`
  - `VITE_DIRECTIONS_DEV=false`
- `rsbuild.config.ts` keeps HMR on `/rsbuild-hmr`, uses `logLevel: "warn"`, and now follows the current page host/port by default.
- Only set `RSBUILD_HMR_HOST` or `RSBUILD_HMR_PORT` when a proxy or alternate origin truly requires an override.
- Public lanes keep `/map-styles/vibecity-neon.json`, and localhost dev/preview now default to the same production neon style; use `VITE_LOCALHOST_MAP_STYLE_MODE=quiet` to opt into `/map-styles/vibecity-localhost.json` for intentional blank/dev-safe preview runs.
- Map readiness is now split between shell readiness and content readiness; strict map/E2E lanes do not report ready until real basemap resource activity is present in `prod` mode.
- Startup centered-card behavior on `/en` now stays in preview mode (`card + popup + pin`) and no longer auto-opens the venue detail modal or mutates the route until an explicit detail action occurs.
- `public/index.html` now relies on the local/system font stack on every host; the old async Google Fonts injection path was removed after production COEP/CSP smoke errors.
- `scripts/sync-public-nationwide-data.mjs` now regenerates `public/data/buildings.json`, `public/data/events.json`, and `public/data/emergency-locations.json` before `npm run dev` and `npm run build`.
- `package.json` now runs `scripts/generate-localhost-venue-snapshot.mjs` with `node --max-old-space-size=4096` for `dev`, `build`, `build:e2e`, and `snapshot:localhost`, which keeps the Windows local build lane from crashing while fetching the full venue/media snapshot.
- `npm run dev` / `bun run dev` now reuse the existing authoritative localhost snapshot/media index artifacts when present; run `node scripts/generate-localhost-venue-snapshot.mjs` manually when you intentionally need a fresh Supabase pull before local dev.
- `public/data/buildings-curated.json` is the hand-maintained overlay for rich floor-plan / indoor-nav building metadata; generated nationwide building coverage is merged into `public/data/buildings.json`.
- `SafetyPanel.vue` now loads nearby hospitals and police from the same-origin `public/data/emergency-locations.json` dataset, while `backend/app/services/emergency_service.py` reads the seeded `emergency_locations` table instead of Overpass.
- `rsbuild.config.ts` now applies history API fallback rewrites for `/en`, `/th`, and public deep links, and `vercel.json` now makes locale rewrites explicit before the catch-all SPA rewrite.
- `rsbuild.config.ts` now excludes `offline.html` from the injected Workbox manifest because `public/sw.js` precaches that file explicitly; this prevents duplicate precache-entry crashes in production service workers.
- Vercel preview deploys from the current repo state should use `vercel deploy --archive=tgz -y`; plain file-upload deploys can hit the free-tier `api-upload-free` limit before the archive upload finishes.
- Localhost venue data now comes from `public/data/venues-localhost-snapshot.json`, generated by `scripts/generate-localhost-venue-snapshot.mjs` before builds as a Thailand-wide grid-round-robin sample ordered from a neutral dev reference point instead of bundling the full stale venue dataset into an async JS chunk.
- `src/lib/localVenueSnapshot.js` now fetches the localhost snapshot with `cache: "no-store"` so `5173` and `4174` cannot get stuck on stale zero-row browser cache entries.
- Browser-side PII audit pings and browser-side venue-view increment RPCs are now opt-in only; production no longer auto-fires those Supabase cross-origin analytics calls by default.
- `src/lib/supabase.js` now applies an 8s client timeout to read-only Supabase requests and returns a fail-open 503 payload instead of letting the browser hang indefinitely on timed-out upstream lanes.
- `src/store/shopStore.js` now falls back to the generated `public/data/venues-localhost-snapshot.json` snapshot when the V2 feed lane times out before any live venue rows are available, so public production can still render a degraded but usable venue surface.
- Public production now skips the cross-origin Fly `/api/v1/shops/:id/reviews` and `/density` browser lanes on public hosts, falling back to existing quiet/review-unavailable behavior until the backend CORS patch can be deployed.
- Frontend-only localhost now pins `locationStore` to a neutral Thailand-wide mock reference point by default so `5173` and `4174` render the same nationwide ordering/distances; opt into real browser geolocation with `VITE_LOCAL_DEV_REAL_GEO=true` when needed.
- Strict authoritative media filtering is bypassed only for the localhost snapshot lane so frontend-only dev/preview samples still render; public/prod venue lanes remain strict-real-only.
- Localhost Chromium now boots directly into the same WebGL renderer path as production; the temporary preview HUD, preview pins, and session renderer toggle have been removed.
- Legacy session keys such as `vibecity.dev.mapRenderer` are now ignored by the app and no longer affect renderer selection.
- Map lifecycle includes WebGL context loss detection and controlled recovery via `useMapCore` and `MapLibreContainer.vue`.
- Frontend-only local dev no longer prewarms `useSDFClusters` / `useFluidOverlay` during setup; god-tier WebGL layers only boot after idle in non-local-dev lanes.
- WebGL recovery no longer forces an immediate dev-only reinit; it now waits for a grace period and skips recovery if the map becomes healthy on its own.
- During WebGL restore, resize/source refresh/pin refresh work stays paused until the map is operational again.
- Venue media and reviews fetches are skipped or rerouted in frontend-only dev so localhost does not emit false 404, 504, or CORS noise.
- Public venue lists and detail hydration now fail closed to authoritative shop media data; shops without connected `real_media/media_counts` no longer render in the public venue store, and shop media endpoints no longer hydrate Google Places fallback photos.
- Public/prod venue lanes now require both authoritative real images and authoritative real videos before a venue can surface; incomplete venues stay hidden until proof-backed media exists.
- Frontend real-media fetches now fall back to `public/data/venues-real-media-index.json` when the active backend `/api/v1/shops/media` route returns stale-contract errors such as `404`, `405`, or `422`.
- `scripts/generate-localhost-venue-snapshot.mjs` now builds both `public/data/venues-real-media-index.json` and `public/data/venues-localhost-snapshot.json` directly from authoritative Supabase media sources, and the localhost snapshot contains only venues with complete real media.
- Public production runtime now prefers the same-origin `public/data/venues-real-media-index.json` cache before attempting the broken cross-origin Fly media index route, and venue rows that already carry both direct image and direct video metadata can satisfy the strict complete-media gate without waiting for a separate merge pass.
- Production MapLibre now fulfills known missing third-party basemap sprite IDs such as `office` with a transparent placeholder so the public MapTiler streets-v2 lane stays quiet.
- Video elements only eager-load for active cards, which removed the repeated cache/range churn from the home feed.
- `SwipeCard.vue` only calls `preventDefault()` on cancelable vertical drag events, which avoids Chrome's `touchmove cancelable=false` intervention noise during feed gestures.
- Startup now primes `locationStore.getCurrentPosition()` in parallel with the initial venue fetch; when a real location fix exists, the public map boots at the user's coordinates around zoom `16.2` instead of starting from the Thailand-wide overview.
- The default unfiltered venue carousel/feed now selects up to 30 nearby venues from the user's closest pool and rotates that nearby slice every 30 minutes; the first real location fix bypasses the usual 400 ms debounce so distance-based ordering updates immediately on startup.
- Mock/default fallback coordinates no longer trigger the neighborhood startup zoom path, so denied geolocation still falls back to the wider default map shell instead of zooming into the Thailand midpoint.
- The public map now exposes a floating `My Location` control; when only mock/fallback coordinates are available, that control re-requests a real browser geolocation fix before refocusing the camera.
- Deprecated LCP entry reads were replaced with `webVitalsService.getLatestVitals()`.
- Admin fallback emails are no longer hardcoded in backend defaults, Supabase edge helpers, or admin bootstrap/grant scripts; allowlists are explicit environment configuration only.
- Audited map marker update paths now avoid `.innerHTML` for user-derived strings and use `textContent` or explicit DOM/SVG composition instead.
- Giant event pins now render as neon pin-only SVG markers; they no longer embed the oversized map/image preview bubble or floating text label.
- The selected neon pin sign now renders in a fixed app-level overlay, drops back below app overlays when the detail modal closes, and lifts above the modal only while `[data-testid="vibe-modal"]` is present.
- The public app no longer mounts `InstallBanner`, so the `Install VibeCity` PWA banner should stay absent unless that component is intentionally reintroduced.
- `MallDrawer` still uses the CSS glass fallback instead of copying the live MapLibre canvas into the `ChromaticGlass` WebGL pipeline, while `VibeModal` now stays on an opaque black backdrop/surface so the detail sheet does not render transparently over the map.
- Detail-sheet map focus no longer keeps a MapLibre popup mounted under the venue modal; the neon sign remains the primary on-map anchor while the modal is open.
- Detail-sheet spacing helpers now live in `src/constants/mapSelectionLayout.js`; keep `MapLibreContainer.vue` and `useNeonPinsLayer.js` on the same shared clearance helpers before changing sign/modal spacing again.
- Map preview popups now lift higher above regular/live/promoted/giant pins while staying under sidebar/drawer layers during normal preview flow.
- Neon sign overlays now keep up to 30 nearby venues rendered during preview/detail selection, freeze regular sign set churn during pan gestures to avoid flicker, hide regular signs that would render clipped against the viewport edge, keep the default preview/detail camera framing tight, and cluster nearby neon signs only when the user zooms out below the clustering threshold.
- Localhost/coarse-pointer startup now defers the heavy heatmap/atmosphere/traffic effect pass until interaction or later idle, and style load no longer triggers a duplicate early traffic refresh.
- `SwipeCard` now keeps the info layer transparent with dark copy plus a light image-friendly bottom wash, so venue imagery stays visible without the old dark-glass blur or large matte panel.
- `BottomFeed` now keeps compact mobile/public carousel cards at `198x272`, and `SwipeCard` compact typography now uses larger near-black title/meta/time copy plus left-aligned live-card titles while still reserving only the right gutter for the favorite button.
- Startup geolocation now requests a real fix only when no persisted real location exists; once a real fix is captured, `locationStore` persists it, reuses it on revisit without calling the native geolocation APIs again, and silently continues tracking after the first granted fix.
- `VibeModal` touch listeners now mount as passive listeners, removing the noisy Chrome scroll-blocking touch listener violations from the detail-sheet flow.
- `MapLibreContainer` now mirrors user position with a DOM-based blue location marker overlay during locate flows, so `My Location` still shows an obvious self-position marker even when style-layer setup is interrupted by unrelated MapLibre layer errors.
- Sentient auto-detect detail handoff now waits for `selection-flight-complete` from the map preview flow; carousel/startup preview auto-open still stays once-per-shop-per-tab via session memory.
- `usePrefetchEngine` now skips speculative venue prefetch entirely in frontend-only dev and while the browser is offline, and transient network failures trigger a short backoff instead of hammering the low-priority Supabase lane.
- `locationStore` now short-circuits repeat Geolocation calls when browser permission is already `denied`, which reduces the repeated Chrome blocked-permission warning spam.
- `useMapPadding` now skips active-pin feature-state writes until `pins_source` exists, which avoids the old modal-open `MapLibre Error: The source 'pins_source' does not exist` spam.
- `repo-deep-audit` now supports rule-level path exclusions plus SQL comment stripping, and scorecards should be regenerated only after the latest signals file has been written.

## Hot Files

- `rsbuild.config.ts`
- `public/map-styles/vibecity-dev.json`
- `src/lib/runtimeConfig.js`
- `src/lib/localVenueSnapshot.js`
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
- `backend/app/services/venue_media_service.py`
- `backend/app/api/routers/shops.py`
- `backend/tests/test_shop_media_api.py`
- `src/components/feed/BottomFeed.vue`
- `src/composables/engine/useChromaticGlass.js`
- `src/composables/useSmartVideo.js`
- `src/utils/debugFlags.js`
- `src/store/locationStore.js`
- `src/plugins/masterIntegration.js`
- `src/plugins/phase1Integration.js`
- `src/views/HomeView.vue`
- `src/components/ui/SafetyPanel.vue`
- `src/services/emergencyService.js`
- `backend/app/services/emergency_service.py`
- `backend/app/api/routers/emergency.py`
- `scripts/sync-public-nationwide-data.mjs`
- `public/data/buildings-curated.json`
- `scripts/generate-localhost-venue-snapshot.mjs`
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

## Current Focus

- Keep the repo and the live public domains aligned to the single Supabase project `rukyitpjfmzhqjlfmbie`.
- Keep `vibescity.live` stable with the latest runtime fixes: active card videos call `load()`/`play()` at the right lifecycle point, the map user-location marker retries after slow style loads, map interactions are idempotent per style epoch, drag-scroll listeners are idempotent per composable lifecycle, and the refreshed public venue media snapshot remains available.
- Keep `www.vibescity.live` on a dedicated redirect deployment that returns `301` to `https://vibescity.live/`.
- Preserve the current deploy split between the linked `vibecity.live` Vercel project, the public `frontend` Vercel project that serves `vibescity.live`, and the tiny `vercel-domain-redirect` project used for `www.vibescity.live`.

## Current Resume Items

- The latest deployed app/data commit is `3f2a456e012bb52cf0635ccc338178fa009575b6` (`fix: inline production realtime websocket env`) on branch `perf/stabilize-e2e-smoke`.
- `public/data/venues-real-media-index.json` is now tracked through Git LFS. Future pushes avoid the 61MB GitHub warning, but old Git history still contains the original large blob until an explicit history cleanup is approved.
- Plain `vercel deploy -y` can hit the free-tier upload limit; use `vercel deploy --prod --archive=tgz --force --skip-domain -y --scope phirawits-projects` from a clean worktree linked to Vercel project `frontend`.
- The workspace root `.vercel/project.json` still links to the Vercel-side `vibecity.live` project, not the live public app. Do not deploy production from the workspace root.
- The current live `frontend` production deployment is `dpl_8Nkh4xP3SGFZM6wYabcXsMX36Ewt` at `https://frontend-8rvf5891m-phirawits-projects.vercel.app`, serving `https://vibescity.live`.
- The current live redirect deployment remains `dpl_DUPtU8mUvZsi7F4YfTXLD9ixumW7` at `https://vercel-domain-redirect-i9ywt93sl-phirawits-projects.vercel.app`, aliased to `https://www.vibescity.live`.
- `frontend` production env includes `VITE_WS_URL=wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream` and `VITE_WS_PUBLIC_AUTOCONNECT=true`; keep both clean of literal `\n`.
- Backend WebSocket handshake was verified from origin `https://vibescity.live`; the public browser now opens the Fly realtime socket without console errors.
- Direct browser-side Supabase reads, cross-origin Fly reviews, and density requests remain guarded/fallback-based on public production hosts.
- Local `bun run build` without `VIBECITY_REUSE_EXISTING_LOCALHOST_SNAPSHOT=1` can still die with exit code `9` while regenerating the 161k-row snapshot. Use the reuse flag for deployment verification unless intentionally refreshing Supabase artifacts.
- Antigravity validation requires `PYTHONIOENCODING=utf-8` on this Windows host. `security_scan.py` skips generated/tool/vendor folders and the LFS media index; `lint_runner.py` avoids Windows `shell=True` list invocation.
- `vibescity.live` remains the app custom domain. `www.vibescity.live` must stay on the standalone redirect deployment, not the app deployment.
- `vibecity.live` is still a separate Vercel-side/legacy domain path; public DNS for that domain remains outside the live `vibescity.live` app path.

## Current Snapshot

- Last modified: 2026-04-19
- Focus of this session: enable verified public production realtime, keep the media index under Git LFS, and redeploy only the Vercel `frontend` production app behind `https://vibescity.live`.
- Files touched:
  - `.gitattributes` — Tracks `public/data/venues-real-media-index.json` with Git LFS.
  - `scripts/ci/check-vite-public-secrets.mjs` — Allows public realtime env names.
  - `rsbuild.config.ts` — Injects realtime public env values from process env during production builds.
  - `src/lib/runtimeConfig.js` — Uses direct `import.meta.env` reads for WebSocket env values so Rsbuild inlines the production opt-in.
  - `.agent/skills/vulnerability-scanner/scripts/security_scan.py` — Skips generated/tool/vendor folders and oversized generated data.
  - `.agent/skills/lint-and-validate/scripts/lint_runner.py` — Avoids Windows `shell=True` list invocation.
  - `public/data/venues-localhost-snapshot.json` — Regenerated metadata for the current snapshot.
  - `public/data/venues-real-media-index.json` — Updated LFS object.
  - `docs/runbooks/agent-operating-memory.md` — Recorded the production deployment/env handoff.
- Behavior changed:
  - Public production now opens the verified Fly WebSocket lane only when `VITE_WS_PUBLIC_AUTOCONNECT=true`.
  - The deployed bundle contains `wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream`, has no literal `\n` near the API/WS env values, and inlines the public autoconnect default as `true`.
  - `vibescity.live` now points at Vercel `frontend` production deployment `dpl_8Nkh4xP3SGFZM6wYabcXsMX36Ewt`.
  - `www.vibescity.live` remains aliased to the standalone redirect deployment, not the app deployment.
- Validation:
  - `npx biome check --write src/lib/runtimeConfig.js tests/unit/runtimeConfig.spec.js rsbuild.config.ts scripts/ci/check-vite-public-secrets.mjs`: passed.
  - `node scripts/ci/check-vite-public-secrets.mjs`: passed.
  - `npx vitest run tests/unit/runtimeConfig.spec.js tests/unit/socketService.spec.js`: 2 files / 8 tests passed.
  - `bun run build` with `VIBECITY_REUSE_EXISTING_LOCALHOST_SNAPSHOT=1`, clean realtime env, and production API URL: passed; 10,124 prerendered pages.
  - Initial `bun run build` without reuse failed with exit code `9` during the 161,712-row snapshot generation step; use reuse unless intentionally refreshing artifacts.
  - `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/checklist.py .`: passed 6/6 checks, 0 failed.
  - `git push origin HEAD:perf/stabilize-e2e-smoke`: pushed through `3f2a456`.
  - Vercel `frontend` production deploy: `dpl_8Nkh4xP3SGFZM6wYabcXsMX36Ewt`, `https://frontend-8rvf5891m-phirawits-projects.vercel.app`, aliased to `https://vibescity.live`.
  - `curl -I https://vibescity.live/manifest.json`: `200`.
  - `curl -I https://www.vibescity.live/`: `301` to `https://vibescity.live/`.
  - Browser smoke on `https://vibescity.live/en?deploy=8rvf5891m`: title loaded, `h1=VIBESCITY`, console has 0 errors and 0 warnings, page errors 0, WebSocket opened to `wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream` and stayed open.
  - Live bundle check: `/manifest.json` `200`, index script `https://vibescity.live/static/js/index.ea3d217f.js`, API/WS host present, public autoconnect true, no literal `\n` near API host.
  - Backend WebSocket smoke: connected to `wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream` with origin `https://vibescity.live`.
  - Commit shipped: `3f2a456`
## Update Protocol

Replace the `Current focus`, `Current Resume Items`, and `Current Snapshot` sections instead of appending endless history. Keep updates factual and short.
