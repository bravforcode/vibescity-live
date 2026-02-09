# Fly.io 24/7 Setup (API + WS + OCR + Clock)

This is the production path for this repo.
Frontend runs on Vercel. API/WS/OCR/Clock run on Fly.

## Fixed project values for this repository
- Fly app: `vibecity-api`
- Supabase project ref: `nluuvnttweesnkrmgzsm`
- Supabase URL: `https://nluuvnttweesnkrmgzsm.supabase.co`

## 1) Install and login
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

## 2) Create/confirm Fly app and regions
```bash
fly apps create vibecity-api || true
fly regions set sin iad --app vibecity-api
fly regions list --app vibecity-api
```

## 3) Create Upstash Redis
1. Create Redis DB in Upstash.
2. Prefer region close to `sin`.
3. Copy TLS URL format `rediss://default:<password>@<host>:<port>`.

## 4) Set Fly secrets
Required:
```bash
fly secrets set --app vibecity-api \
  ENV=production \
  SUPABASE_URL="https://nluuvnttweesnkrmgzsm.supabase.co" \
  SUPABASE_KEY="<SUPABASE_ANON_KEY>" \
  SUPABASE_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY>" \
  STRIPE_SECRET_KEY="<STRIPE_SECRET_KEY>" \
  REDIS_URL="rediss://default:<password>@<host>:<port>" \
  BACKEND_CORS_ORIGINS='["https://vibecity.live","https://www.vibecity.live"]'
```

OCR/Slip verification:
```bash
fly secrets set --app vibecity-api \
  GCV_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
  SLIP_EXPECT_RECEIVER_NAME="<receiver-name>" \
  SLIP_EXPECT_RECEIVER_BANKS="KBANK,ธนาคารกสิกรไทย,กสิกรไทย" \
  SLIP_EXPECT_RECEIVER_ACCOUNT="0113222743" \
  SLIP_EXPECT_RECEIVER_ACCOUNT_TAIL=2743 \
  SLIP_DISABLE_MANUAL_REVIEW=false \
  SLIP_DUPLICATE_WINDOW_DAYS=90 \
  SLIP_STORE_OCR_RAW=false \
  IPINFO_TOKEN="<IPINFO_TOKEN>" \
  DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

## 5) Deploy
```bash
fly deploy --app vibecity-api
```

## 5.1) GitHub Actions auto deploy (main)
Workflows:
- `CI` runs tests, including `@map-required` on `main`.
- `Fly Deploy` runs on `workflow_run` after `CI` success on `main`.
- `Fly Deploy` requires `production` environment approval before deploy.
- `Synthetic Postdeploy Monitor` runs every 10 minutes in read-only mode.

Required GitHub secrets:
- `FLY_API_TOKEN`
- `MAPBOX_PUBLIC_TOKEN` (required for map strict/quarantine lanes and synthetic browser smoke)
- `SYNTHETIC_ALERT_WEBHOOK_URL` (optional, used for dedicated synthetic alerts: preflight mismatch + DNS infra failure)
- `BIGQUERY_SERVICE_ACCOUNT_JSON` (required for direct metrics export to BigQuery)
- `GRAFANA_LOKI_TOKEN` (required for direct metrics export to Loki; pair with `GRAFANA_LOKI_USER` if using basic auth)

Optional GitHub secrets/vars for postdeploy checks:
- `POSTDEPLOY_SUPABASE_JWT` (secret)
- `POSTDEPLOY_CHECKOUT_VENUE_ID` (secret or repo variable)
- `POSTDEPLOY_ORDER_ID` (secret or repo variable)
- `POSTDEPLOY_EDGE_BASE_URL` (repo variable, defaults to project edge URL)
- `SYNTHETIC_MAP_BASE_URL` (repo variable, required. Must point to deployed map web app URL for browser synthetic checks)
- `BIGQUERY_PROJECT_ID` (repo variable)
- `BIGQUERY_DATASET` (repo variable)
- `GRAFANA_LOKI_URL` (repo variable, Loki push endpoint base URL)
- `GRAFANA_LOKI_USER` (repo variable, optional for basic auth)

Synthetic browser target guard (hard requirement):
- Before Playwright runs, workflow executes `scripts/ci/validate-synthetic-map-target.mjs`.
- Required page marker: `SYNTHETIC_TARGET_MUST_CONTAIN='<div id="app"'`.
- Forbidden markers: `SYNTHETIC_TARGET_FORBID='avondale entertainment||wp-content||wordpress'`.
- If redirect chain or page signature is wrong, browser synthetic fails immediately.
- If preflight fails, workflow emits a dedicated `preflight_target_mismatch` alert block and optional webhook notification.
- Alert webhook dispatch uses retry/backoff (`ALERT_MAX_RETRIES`, `ALERT_RETRY_DELAY_MS`) via `scripts/ci/send-alert-webhook.mjs`.
- Alert dispatch now supports dedup window controls to reduce alert storms:
  - `ALERT_DEDUP_WINDOW_MINUTES`
  - `ALERT_DEDUP_KEY`

Synthetic API infra guard:
- Workflow runs `scripts/ci/dns-precheck.mjs vibecity-api.fly.dev` before API route checks.
- If DNS precheck fails, workflow classifies incident as `INFRA` and stops before route checks.
- If DNS passes but API checks fail, summary classifies as `APP/API`.
- DNS failures emit a dedicated `dns_precheck_failed` alert block and optional webhook notification.
- API healthcheck writes machine-readable route results when `POSTDEPLOY_REPORT_PATH` is set:
  - output file: `reports/ci/postdeploy-route-health.json`
  - artifact name: `synthetic-api-route-report`

Route-level SLO guard (endpoint-based, not aggregate-only):
- Workflow executes `scripts/ci/evaluate-route-slo.mjs` against `scripts/ci/route-slo-thresholds.json`.
- Required endpoints are fail-hard in synthetic API lane.
- Baseline required thresholds:
  - `GET /health`: p95 <= 2000ms
  - `GET /api/v1/payments/create-checkout-session`: p95 <= 4000ms
  - `GET /api/v1/payments/manual-order`: p95 <= 4000ms
- Optional edge endpoints remain warning-only when JWT/order context is missing.
- Route SLO artifact: `route-slo-evaluation` (`reports/ci/route-slo-evaluation.json`)

Metrics export pipeline (direct push to sinks):
- Script: `scripts/ci/publish-observability-metrics.mjs`
- BigQuery tables:
  - `release_health_events`
  - `route_check_events`
  - `quality_trend_events`
- Loki push stream labels:
  - `service=vibecity-ci`
  - `workflow`, `lane`, `classification`, `status`
- Metrics export log artifact: `metrics-export-log` (`reports/ci/metrics-export-log.json`)

Incident automation (consecutive breach policy):
- Script: `scripts/ci/manage-incidents.mjs`
- Incident target: GitHub Issues (same repository)
- Consecutive breach threshold: `3` runs
- Breach key format:
  - Route SLO: `route:<endpoint_key>:<breach_type>`
  - Trend: `trend:<period>:<metric>`
- Auto actions:
  - Open issue when breach streak >= 3
  - Comment on ongoing breach
  - Comment + close when recovery streak >= 3
- Labels:
  - `incident:auto`
  - `incident:synthetic`
  - `incident:route-slo` or `incident:trend`
- Incident manager artifact: `incident-manager-log` (`reports/ci/incident-manager-log.json`)

Weekly trend report:
- Workflow `Weekly Quality Trend` runs every Monday and summarizes last 7 days pass-rates:
  - strict (`e2e-map-required`)
  - quarantine (`e2e-map-quarantine`)
  - synthetic (`synthetic-postdeploy`, `browser-smoke-map-lite`, overall)
- Threshold alerts (default):
  - strict pass rate < 95%
  - synthetic overall pass rate < 95%
- Weekly snapshot artifact: `reports/ci/weekly-quality-trend.json`
- Workflow now also publishes weekly trend metrics to BigQuery/Loki and runs incident automation.

Monthly trend report:
- Workflow `Monthly Quality Trend` runs on day 1 of each month (00:20 UTC).
- Summarizes last 30 days strict/quarantine/synthetic pass rates.
- Monthly snapshot artifact: `reports/ci/monthly-quality-trend.json`
- Workflow now also publishes monthly trend metrics to BigQuery/Loki and runs incident automation.

Weekly Lighthouse (non-blocking):
- Workflow `Weekly Lighthouse (Non-Blocking)` runs every Monday (00:40 UTC).
- Target URL is the same `SYNTHETIC_MAP_BASE_URL`.
- Runs after synthetic target preflight guard.
- Lighthouse failures are summarized but do not block deploy/release gates.
- Workflow writes `reports/ci/weekly-lighthouse-summary.json`, uploads artifact `weekly-lighthouse-summary`, and publishes lighthouse metrics to BigQuery/Loki (still non-blocking for release).

Release health snapshot:
- `Synthetic Postdeploy Monitor` emits `reports/ci/release-health-snapshot.json` artifact every run.
- Snapshot includes API result + classification, browser result, and overall red/green health for dashboard ingestion.
- Monitor also appends a live 7-day trend table (`strict/quarantine/synthetic`) in Step Summary and artifact `reports/ci/synthetic-trend-7d.json`.

Map quarantine policy:
- `@map-required` remains strict and blocking on `main`.
- `@map-quarantine` runs as a separate non-blocking lane for known flaky map paths.
- Timeboxed SLA is enforced via `tests/e2e/quarantine-map-sla.json`:
  - required fields per quarantined test: `owner`, `ticket`, `expires_on`, `reason`.
  - CI fails on missing metadata, invalid format, stale entries, or expired SLA.
- Quarantine lane artifacts and Step Summary must be reviewed each release until tests are promoted back.

## 6) Scale processes (active-active API, single-region workers)
```bash
fly scale count 1 --process api --region sin --app vibecity-api
fly scale count 1 --process api --region iad --app vibecity-api
fly scale count 1 --process clock --region sin --app vibecity-api
fly scale count 1 --process ocr --region sin --app vibecity-api
```

## 7) Verify runtime
```bash
curl -i https://vibecity-api.fly.dev/health
fly status --app vibecity-api
fly logs --app vibecity-api --process api
fly logs --app vibecity-api --process ocr
fly logs --app vibecity-api --process clock
```

## 8) Vercel environment variables (frontend)
Set these in Vercel project settings:
- `VITE_API_URL=https://vibecity-api.fly.dev`
- `VITE_WS_URL=wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream`
- `VITE_SUPABASE_URL=https://nluuvnttweesnkrmgzsm.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>`
- `VITE_SUPABASE_EDGE_URL=https://nluuvnttweesnkrmgzsm.supabase.co/functions/v1`
- `VITE_MAPBOX_TOKEN=<MAPBOX_TOKEN>`

## 9) Post-deploy endpoint checks
Route existence and health checks (API + optional Edge):
```bash
POSTDEPLOY_API_BASE_URL="https://vibecity-api.fly.dev" \
POSTDEPLOY_EDGE_BASE_URL="https://nluuvnttweesnkrmgzsm.supabase.co/functions/v1" \
POSTDEPLOY_SUPABASE_JWT="<USER_OR_ANON_JWT>" \
POSTDEPLOY_CHECKOUT_VENUE_ID="<venue-uuid>" \
POSTDEPLOY_ORDER_ID="<order-uuid-optional>" \
npm run healthcheck:postdeploy
```

Retry controls for rollout warmup:
```bash
POSTDEPLOY_MAX_RETRIES=8 \
POSTDEPLOY_RETRY_DELAY_MS=5000 \
POSTDEPLOY_FETCH_TIMEOUT_MS=10000 \
npm run healthcheck:postdeploy
```

Manual order full-flow check (creates real order):
```bash
MANUAL_ORDER_HEALTHCHECK_CONFIRM=YES \
MANUAL_ORDER_HEALTHCHECK_API_URL="https://vibecity-api.fly.dev" \
MANUAL_ORDER_HEALTHCHECK_SLIP_URL="https://<public-slip-url>" \
MANUAL_ORDER_HEALTHCHECK_AMOUNT=199 \
MANUAL_ORDER_HEALTHCHECK_SKU="verified_badge" \
MANUAL_ORDER_HEALTHCHECK_VENUE_ID="<venue-uuid>" \
npm run healthcheck
```

## 10) Common CLI mistakes
Do not use angle-bracket placeholders directly in commands.

Wrong:
```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/create-checkout-session"
```

Correct:
```bash
curl -X POST "https://nluuvnttweesnkrmgzsm.supabase.co/functions/v1/create-checkout-session" \
  -H "Authorization: Bearer <REAL_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"venue_id":"<venue-uuid>","sku":"verified","visitor_id":"<visitor-id>","returnUrl":"https://vibecity.live"}'
```

Wrong:
```bash
fly logs --app <fly-app> --process ocr
```

Correct:
```bash
fly logs --app vibecity-api --process ocr
```

## 11) Targeted reruns
Rerun postdeploy healthcheck only from CI runner context:
```bash
npm run healthcheck:postdeploy
```

Run strict map regression profile locally:
```bash
npm run test:e2e:map-required
```

Run quarantine map profile locally:
```bash
npm run test:e2e:map-quarantine
```

Run quarantine SLA validator locally:
```bash
node scripts/ci/validate-map-quarantine-sla.mjs
```

Run lightweight browser smoke against production:
```bash
PLAYWRIGHT_BASE_URL="<map-app-public-url>" \
PW_NO_WEBSERVER=1 \
npm run test:e2e:smoke-map-lite
```

Important:
- Do not point browser synthetic to marketing or redirect domains.
- Use the exact deployed frontend URL that serves the map app (must expose `[data-testid="map-shell"]` and `data-map-ready="true"`).
- `@smoke-map-lite` now runs fail-hard in monitor mode (`E2E_MAP_REQUIRED=1`), so map shell/map-ready failures are not skipped.

Run synthetic target guard locally:
```bash
SYNTHETIC_MAP_BASE_URL="<map-app-public-url>" \
SYNTHETIC_TARGET_MUST_CONTAIN='<div id="app"' \
SYNTHETIC_TARGET_FORBID='avondale entertainment||wp-content||wordpress' \
node scripts/ci/validate-synthetic-map-target.mjs
```

Run read-only synthetic mode locally:
```bash
POSTDEPLOY_READ_ONLY=1 npm run healthcheck:postdeploy
```
