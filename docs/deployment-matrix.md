# Deployment Matrix (Vercel + Supabase + Fly)

## Topology (Locked)
- Frontend: Vercel
- API + WebSocket + OCR + clock: Fly
- Database/Auth/Storage/Edge Functions: Supabase

## CI/CD Flow (Main)
1. `CI` workflow runs on push to `main`.
2. `e2e-map-required` runs as a blocking gate on Desktop Chromium only.
3. `Fly Deploy` workflow triggers only when `CI` concludes `success`.
4. `Fly Deploy` waits for GitHub `production` environment approval.
5. Deploy runs: `flyctl deploy --remote-only -a vibecity-api -c fly.toml`.
6. `postdeploy-healthcheck` runs immediately after deploy.
7. `Synthetic Postdeploy Monitor` runs every 10 minutes in read-only mode.

## GitHub Actions Secrets and Variables
Required secret:
- `FLY_API_TOKEN`

Optional for postdeploy healthcheck:
- `POSTDEPLOY_SUPABASE_JWT` (secret)
- `POSTDEPLOY_CHECKOUT_VENUE_ID` (secret or variable)
- `POSTDEPLOY_ORDER_ID` (secret or variable)
- `POSTDEPLOY_EDGE_BASE_URL` (variable, defaulted in workflow)
- `MAPBOX_PUBLIC_TOKEN` (secret, required for strict/quarantine map lanes and synthetic browser smoke)
- `SYNTHETIC_MAP_BASE_URL` (variable, required. Target URL for browser synthetic map smoke)
- `SYNTHETIC_ALERT_WEBHOOK_URL` (secret, optional webhook for dedicated synthetic mismatch/infra alerts)

## Critical: SQL Editor vs Terminal
- SQL Editor runs SQL only (tables/functions/policies/migrations).
- Terminal runs CLI only (`supabase login`, `supabase db push`, `supabase secrets set`).
- If you run `supabase login` in SQL Editor, Postgres returns `ERROR 42601` (syntax error).

Quick check to ensure no CLI text is in migrations:
```bash
rg -n "supabase login|supabase secrets set" supabase/migrations
```

## Worker/Clock Runtime Status
- Vercel does not run Procfile daemon processes 24/7.
- GitHub Actions cron (`.github/workflows/osm-sync.yml`) is periodic batch mode, not daemon mode.
- Fly runs long-lived processes 24/7 (API + OCR + clock).

## 24/7 Capability
- Vercel: no (daemon workloads unsupported)
- Fly: yes (long-running service + restart policy)
- GitHub Actions schedule: periodic only

## Map Test Policy
- `@map-required`: strict, blocking gate on `main`.
- `@map-quarantine`: non-blocking lane for flaky map regressions under active stabilization.
- `e2e-full` and `e2e-map-required` exclude `@map-quarantine` tests to keep release gates deterministic.
- `e2e-map-quarantine` always uploads its own Playwright report artifact for triage.
- Quarantine governance is enforced by `map-quarantine-sla` job:
  - source of truth: `tests/e2e/quarantine-map-sla.json`
  - required metadata per test: `owner`, `ticket`, `expires_on`, `reason`
  - CI fails on missing, malformed, stale, or expired SLA entries.
- `e2e-map-required` and `e2e-map-quarantine` append pass/fail/skip totals and failures to GitHub Step Summary.

## Synthetic Monitor Matrix
- Schedule: every 10 minutes (`synthetic-postdeploy-monitor.yml`)
- Job 1: `synthetic-postdeploy` (API read-only route checks using `healthcheck:postdeploy`)
- Job 2: `browser-smoke-map-lite` (Playwright `@smoke-map-lite` on `${SYNTHETIC_MAP_BASE_URL}`)
- Both jobs write concise status to GitHub Step Summary and upload artifacts on browser failures.
- Browser synthetic job fails fast when `SYNTHETIC_MAP_BASE_URL` is missing or non-HTTPS.
- Browser synthetic runs target preflight guard before Playwright:
  - `SYNTHETIC_TARGET_MUST_CONTAIN='<div id="app"'`
  - `SYNTHETIC_TARGET_FORBID='avondale entertainment||wp-content||wordpress'`
  - any redirect/signature mismatch fails the job before browser execution.
- Preflight mismatch emits dedicated alert classification: `preflight_target_mismatch`.
- API lane runs DNS precheck (`vibecity-api.fly.dev`) before route checks:
  - DNS failure => classify as `INFRA`
  - DNS success + route failure => classify as `APP/API`
- API lane exports route-level machine-readable report when `POSTDEPLOY_REPORT_PATH` is set:
  - `reports/ci/postdeploy-route-health.json`
  - artifact: `synthetic-api-route-report`
- API lane evaluates endpoint-level SLO thresholds from `scripts/ci/route-slo-thresholds.json`:
  - required endpoint breaches fail synthetic API lane
  - optional endpoint breaches are warning-only
  - route SLO artifact: `route-slo-evaluation` (`reports/ci/route-slo-evaluation.json`)
- `@smoke-map-lite` is fail-hard in monitor context (`E2E_MAP_REQUIRED=1`), so map-not-ready regressions cannot pass via skip.
- Alert webhook delivery uses retry/backoff through `scripts/ci/send-alert-webhook.mjs`.
- Alert dedup/rate-limit controls are available:
  - `ALERT_DEDUP_WINDOW_MINUTES`
  - `ALERT_DEDUP_KEY`
- Each synthetic monitor run publishes `release-health-snapshot` artifact (`reports/ci/release-health-snapshot.json`) for dashboard ingestion.
- Synthetic monitor also appends 7-day trend table into Step Summary and uploads `synthetic-trend-7d` artifact.

## Observability Export Matrix
- Export script: `scripts/ci/publish-observability-metrics.mjs`
- Sink 1: BigQuery
  - `BIGQUERY_PROJECT_ID`
  - `BIGQUERY_DATASET`
  - `BIGQUERY_SERVICE_ACCOUNT_JSON` (secret)
  - tables:
    - `release_health_events`
    - `route_check_events`
    - `quality_trend_events`
- Sink 2: Grafana Loki
  - `GRAFANA_LOKI_URL`
  - `GRAFANA_LOKI_USER` (optional)
  - `GRAFANA_LOKI_TOKEN` (secret)
  - labels:
    - `service=vibecity-ci`
    - `workflow`, `lane`, `classification`, `status`
- Export log artifact:
  - `metrics-export-log` (`reports/ci/metrics-export-log.json`)

## Incident Policy Matrix
- Incident automation script: `scripts/ci/manage-incidents.mjs`
- Source signals:
  - route-level SLO signals (`route_check_events`)
  - weekly/monthly/synthetic trend signals (`quality_trend_events`)
- Consecutive breach policy:
  - open issue when streak >= 3
  - close issue when recovery streak >= 3
- Breach keys:
  - route: `route:<endpoint_key>:<breach_type>`
  - trend: `trend:<period>:<metric>`
- Target:
  - GitHub Issues in current repo (`issues: write` permission required)
- Labels:
  - `incident:auto`, `incident:synthetic`, `incident:route-slo` or `incident:trend`
- Incident log artifact:
  - `incident-manager-log` (`reports/ci/incident-manager-log.json`)

## Weekly Trend Summary
- Workflow: `weekly-quality-trend.yml` (schedule: Monday 00:15 UTC)
- Script: `scripts/ci/weekly-quality-trend.mjs`
- Output: GitHub Step Summary with 7-day pass rate table for:
  - strict (`e2e-map-required`)
  - quarantine (`e2e-map-quarantine`)
  - synthetic API/browser/overall
- Threshold alerts:
  - strict pass rate < 95%
  - synthetic overall pass rate < 95%
- Weekly artifact: `reports/ci/weekly-quality-trend.json`
- Weekly workflow also exports metrics and runs incident automation.

## Monthly Trend Summary
- Workflow: `monthly-quality-trend.yml` (schedule: day 1 of month, 00:20 UTC)
- Uses same trend engine with 30-day window.
- Output artifact: `reports/ci/monthly-quality-trend.json`
- Threshold alert classification: `monthly_quality_threshold_breach`
- Monthly workflow also exports metrics and runs incident automation.

## Lighthouse Drift Check (Non-Blocking)
- Workflow: `weekly-lighthouse.yml` (schedule: Monday 00:40 UTC)
- Validates `SYNTHETIC_MAP_BASE_URL` and target signature before auditing.
- Runs Lighthouse CI on production target as non-blocking signal.
- Intended for performance drift visibility without impacting release gate determinism.
- Writes artifact `weekly-lighthouse-summary` (`reports/ci/weekly-lighthouse-summary.json`) and exports lighthouse metrics.

## Required Env + Source of Value
| Variable | Where to get it | Example |
|---|---|---|
| `VITE_API_URL` | Fly API service public domain | `https://your-app.fly.dev` |
| `VITE_WS_URL` | Fly API domain + WS path | `wss://your-app.fly.dev/api/v1/vibes/vibe-stream` |
| `VITE_SUPABASE_URL` | Supabase Dashboard -> Project Settings -> API -> Project URL | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard -> API -> anon key | `eyJ...` |
| `VITE_MAPBOX_TOKEN` | Mapbox Dashboard -> Access Tokens -> public token | `pk...` |
| `SUPABASE_URL` | Supabase Project URL | `https://<ref>.supabase.co` |
| `SUPABASE_KEY` | Supabase anon key (backend config expects this name) | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | `eyJ...` |
| `REDIS_URL` | Upstash Redis or external Redis provider | `redis://...` |
| `STRIPE_SECRET_KEY` | Stripe dashboard (required in production backend startup) | `sk_...` |
| `WEBHOOK_SECRET` | generate locally | `openssl rand -hex 32` |
| `IPINFO_TOKEN` | `https://ipinfo.io` | token string |
| `DISCORD_WEBHOOK_URL` | Discord -> Channel Settings -> Integrations -> Webhooks | `https://discord.com/api/webhooks/...` |

## Current deployment targets for this repo
- Fly app: `vibecity-api`
- Supabase ref: `nluuvnttweesnkrmgzsm`
- API health URL: `https://vibecity-api.fly.dev/health`

## Local `.env` Example
```bash
VITE_API_URL="https://vibecity-api.fly.dev"
VITE_WS_URL="wss://vibecity-api.fly.dev/api/v1/vibes/vibe-stream"
VITE_SUPABASE_URL="https://nluuvnttweesnkrmgzsm.supabase.co"
VITE_SUPABASE_ANON_KEY="<your-anon-key>"
VITE_MAPBOX_TOKEN="pk.XXXXXXXXXXXXXXXX"
```

Production reminder:
- Set frontend vars in Vercel Environment Variables (not only local `.env`).
- Set backend vars in Fly app secrets.

Env readiness helper:
```bash
node scripts/check-runtime-env.mjs
```

## Fly 24/7 Service Setup
See: `docs/fly-24x7-setup.md`
SQL hardening checklist: `docs/sql-editor-hardening.md`

## Fly + Vercel Quick Summary
**Fly secrets (backend):**
- `ENV`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL` (Upstash)
- `STRIPE_SECRET_KEY`
- `BACKEND_CORS_ORIGINS`
- OCR/Slip: `GCV_SERVICE_ACCOUNT_JSON`, `SLIP_EXPECT_RECEIVER_*`, `SLIP_DISABLE_MANUAL_REVIEW`, `SLIP_DUPLICATE_WINDOW_DAYS`, `SLIP_STORE_OCR_RAW`, `IPINFO_TOKEN`, `DISCORD_WEBHOOK_URL`

**Vercel env (frontend):**
- `VITE_API_URL`, `VITE_WS_URL`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_EDGE_URL`
- `VITE_MAPBOX_TOKEN`

**Command bundle (deploy + scale):**
```bash
fly deploy --app vibecity-api
fly scale count 1 --process api --region sin --app vibecity-api
fly scale count 1 --process api --region iad --app vibecity-api
fly scale count 1 --process clock --region sin --app vibecity-api
fly scale count 1 --process ocr --region sin --app vibecity-api
fly logs --app vibecity-api

# Endpoint route checks (safe, no real payment)
POSTDEPLOY_API_BASE_URL="https://vibecity-api.fly.dev" \
POSTDEPLOY_EDGE_BASE_URL="https://nluuvnttweesnkrmgzsm.supabase.co/functions/v1" \
POSTDEPLOY_SUPABASE_JWT="<USER_OR_ANON_JWT>" \
POSTDEPLOY_CHECKOUT_VENUE_ID="<venue-uuid>" \
POSTDEPLOY_ORDER_ID="<order-uuid-optional>" \
npm run healthcheck:postdeploy

# Manual order healthcheck (creates real order intentionally)
MANUAL_ORDER_HEALTHCHECK_CONFIRM=YES \
MANUAL_ORDER_HEALTHCHECK_API_URL="https://vibecity-api.fly.dev" \
MANUAL_ORDER_HEALTHCHECK_SLIP_URL="https://<public-slip-url>" \
MANUAL_ORDER_HEALTHCHECK_AMOUNT=199 \
MANUAL_ORDER_HEALTHCHECK_SKU="verified_badge" \
npm run healthcheck
```

## E2E Profiles
- `npm run test:e2e:smoke`: smoke suite, skip-friendly for non-critical map environment variance.
- `npm run test:e2e:map-required`: strict map regression suite (`@map-required`) and fail-hard behavior.
- `npm run test:e2e:map-quarantine`: non-blocking quarantine lane (`@map-quarantine`) for flaky map paths.
- `npm run test:e2e:smoke-map-lite`: lightweight browser synthetic (`@smoke-map-lite`) for live-site map readiness.

## Supabase CLI (Terminal) - Migration
```bash
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

## Supabase Edge Secrets (Terminal)
Use the script:
```bash
supabase login
export SUPABASE_PROJECT_REF="YOUR_PROJECT_REF"
export GCV_SA_JSON_PATH="$HOME/Downloads/vibecity-gcv-service-account.json"
export SLIP_EXPECT_RECEIVER_NAME="ชื่อบัญชีผู้รับจริง"
export SLIP_EXPECT_RECEIVER_BANKS="KBANK,ธนาคารกสิกรไทย,กสิกรไทย"
export SLIP_EXPECT_RECEIVER_ACCOUNT="0113222743"
export IPINFO_TOKEN="YOUR_IPINFO_TOKEN"
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/XXXX/XXXX"
./scripts/set-supabase-secrets.sh
supabase secrets list --project-ref "$SUPABASE_PROJECT_REF"
```

## Deploy Order
1. Push git changes.
2. Deploy frontend on Vercel.
3. Deploy Fly API and verify `/health`.
4. Deploy Fly OCR/clock processes and verify logs keep running.
5. Apply Supabase migrations (`supabase db push`).
6. Set Edge secrets and deploy functions:
   ```bash
   supabase functions deploy create-manual-order --project-ref "$SUPABASE_PROJECT_REF"
   supabase functions deploy webhook-handler --project-ref "$SUPABASE_PROJECT_REF"
   # optional Stripe
   supabase functions deploy create-checkout-session --project-ref "$SUPABASE_PROJECT_REF"
   supabase functions deploy stripe-webhook --project-ref "$SUPABASE_PROJECT_REF"
   supabase functions deploy manage-subscription --project-ref "$SUPABASE_PROJECT_REF"
   ```
