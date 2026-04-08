## Goal
แก้ production console/network regressions บน `www.vibescity.live` ให้ analytics CORS ผ่าน, Clarity ไม่โดน CSP block, lane รูป Supabase ไม่ยิง ORB จาก thumbnail transform, และ browser ฝั่ง custom domain ไม่ยิง cross-origin review/density calls ที่ CORS พัง

## Scope
- in: `analytics-ingest` CORS headers, Vercel CSP headers, Supabase browser image URL generation, focused unit coverage, deploy Supabase function + Vercel production, smoke verification
- out: auth/RLS/schema changes, redesign map rendering, broad media pipeline refactors

## Agent(s)
orchestrator (frontend + deploy/runtime verification)

## Steps
1. patch `supabase/functions/analytics-ingest/index.ts` ให้ preflight อนุญาต `vibe_visitor_id` family headers
2. patch `vercel.json` ให้ `img-src` อนุญาต Clarity pixel
3. patch `src/composables/useBlurUpImage.js` และ `src/components/panel/ShopCard.vue` ให้เลิกสร้าง Supabase object-transform URLs ที่ก่อ ORB ใน Chromium
4. add focused unit tests for blur-up Supabase behavior
5. run targeted unit tests + build + checklist
6. deploy `analytics-ingest` to Supabase and redeploy production to Vercel custom domain
7. smoke test `https://www.vibescity.live` with headless browser + curl

## Success criteria
- [ ] `analytics-ingest` preflight returns `Access-Control-Allow-Headers` including `vibe_visitor_id`
- [ ] production CSP no longer blocks `https://c.clarity.ms/c.gif`
- [ ] production browser no longer emits `ERR_BLOCKED_BY_ORB` for Supabase thumbnail image transforms
- [ ] targeted tests and build pass

## Risks
- Supabase CLI auth/deploy may be unavailable: validate with curl and report blocker if deploy cannot be completed
- removing Supabase browser transforms may slightly increase initial image bytes: acceptable tradeoff for production stability

## Rollback
revert the patched frontend files, restore prior CSP string, redeploy the previous Vercel build, and redeploy the previous Supabase function bundle if needed

## Outcome
- completed: frontend now strips custom visitor headers only from Supabase Edge Function requests, so custom-domain browser traffic no longer hits the old preflight lane
- completed: browser analytics on public production were first gated behind `VITE_ANALYTICS_ENABLED` while the ingest lane was unhealthy, then re-enabled after the Supabase function patch was deployed successfully
- completed: `img-src` CSP allows both `https://*.clarity.ms` and `https://c.bing.com`, and public media requests stay on canonical object URLs instead of transformed Supabase thumbnail URLs that triggered Chromium ORB failures
- completed: `useSDFClusters` now waits for `unclustered-pins` before inserting `sdf-cluster-layer`, removing the MapLibre layer-order error seen on production
- completed: `analytics-ingest` was deployed to Supabase project `rukyitpjfmzhqjlfmbie` as version `10`, with fail-open session handling, updated CORS allow-headers, and best-effort writes into `analytics_logs`
- completed: public production now skips the cross-origin Fly `/api/v1/shops/:id/reviews` and `/density` browser lanes on public hosts, returning quiet/review-unavailable fallbacks instead of emitting CORS noise
- completed: production was redeployed twice to sibling Vercel project `vibescity`; the latest live deployment is `dpl_fsy445WDP7RC5ZVjDLmnKjNC3WDA`, aliased to `https://www.vibescity.live`
- completed: validation wrappers now call `security_scan.py --output summary`, which keeps `checklist.py` and `verify_all.py` inside timeout on this Windows host
- completed: early production analytics volume was confirmed by `analytics_logs` growth from `10` to `21` rows over the 30-minute sample window after smoke

## Validation
- `npx biome check src/lib/analyticsRuntime.js src/services/analyticsService.js src/App.vue src/main.js src/components/ui/ConsentBanner.vue src/composables/engine/useSDFClusters.js tests/unit/analyticsRuntime.spec.js`
- `npx vitest run tests/unit/analyticsRuntime.spec.js tests/unit/supabaseRequestHeaders.spec.js tests/unit/composables/useBlurUpImage.spec.js tests/unit/components/ImageLoader.spec.js`
- `npx biome check src/lib/runtimeConfig.js src/store/shopStore.js tests/unit/runtimeConfig.spec.js`
- `npx vitest run tests/unit/runtimeConfig.spec.js tests/unit/stores/shopStore.spec.js`
- `npm run build`
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/checklist.py .`
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/verify_all.py . --url https://www.vibescity.live`
- direct preflight and POST smoke against `https://rukyitpjfmzhqjlfmbie.supabase.co/functions/v1/analytics-ingest` from origin `https://www.vibescity.live` returned `200`
- headless browser smoke with `localStorage.vibe_analytics_consent='granted'` on `https://www.vibescity.live/th?smoke=20260407i` reported multiple `analytics-ingest` requests with `200` responses, `window.clarity` loaded, and no request failures or MapLibre layer-order errors
- fresh mobile browser smoke on `https://www.vibescity.live/th?smoke=20260407k&fresh=1` reported `0` console errors/warnings since navigation, only `analytics-ingest => 200` requests, and no `fly.dev` review/density requests
- headless map pan/zoom on the live TH detail flow plus EN detail smoke on `https://www.vibescity.live/en/venue/5d9a522c-92e6-4367-b92b-686de50db718?smoke=20260407k-en` both reported `0` console errors/warnings since navigation
- `Invoke-WebRequest -UseBasicParsing https://www.vibescity.live` returns a CSP header whose `img-src` includes `https://c.bing.com`
- service-role REST queries against `analytics_logs` showed the 30-minute window grow from `CONTENT_RANGE=0-9/10` before the final smoke to `CONTENT_RANGE=0-14/21` afterward

## Follow-up
- keep monitoring real production analytics volume and confirm the receiving tables on Supabase keep accepting writes without schema drift
- once Fly billing is fixed, deploy the prepared backend CORS allowlist patch so the frontend-side skip for public-host review/density browser requests can be removed
- rotate the Supabase PAT used during this session if it was pasted into the terminal in plaintext
