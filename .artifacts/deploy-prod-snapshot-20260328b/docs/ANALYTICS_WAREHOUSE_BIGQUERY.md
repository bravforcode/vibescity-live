# Analytics Warehouse (BigQuery)

Purpose
- Export **daily aggregated** product analytics (`public.analytics_events_archive_daily`) from Supabase into BigQuery for enterprise reporting / BI.
- This export is designed to be **warehouse-ready** (partitioned by day, clusterable, idempotent daily loads).

What Data Is Exported
- Source table: `public.analytics_events_archive_daily`
  - `day` (DATE)
  - `venue_ref` (TEXT -> BigQuery STRING)
  - `event_type` (TEXT -> BigQuery STRING)
  - `events_count` (BIGINT -> BigQuery INT64)
  - `unique_visitors` (BIGINT -> BigQuery INT64)
  - `created_at` (TIMESTAMPTZ -> BigQuery TIMESTAMP)
- BigQuery adds:
  - `source_env` (STRING) for distinguishing `production` vs `staging`
  - `exported_at` (TIMESTAMP)

Notes (Privacy)
- This export is **aggregate-only** and does **not** export raw IP addresses or raw event metadata.
- `venue_ref` may contain either:
  - a venue identifier (UUID/string), or
  - a page path for `page_view` events (ex: `/v/some-slug`).

CI Workflow
- Workflow: `.github/workflows/analytics-warehouse-export.yml`
  - Schedule: daily (UTC)
  - Manual: supports `workflow_dispatch` inputs (`start_day`, `end_day`, `source_env`) for backfills.

Manual Run (GitHub Actions)
1. Go to the repo on GitHub → `Actions`.
2. Select workflow **Analytics Warehouse Export (BigQuery)**.
3. Click **Run workflow** (top right).
4. Choose the branch, set `start_day`/`end_day` (optional), and `source_env`.
5. Run and then check the artifact `analytics-warehouse-export-log`.

Provisioning + Export Scripts
- Provision BigQuery table (idempotent):
  - `scripts/ci/provision-bigquery-analytics.mjs`
- Export daily archive rows (idempotent by day):
  - `scripts/ci/export-analytics-archive-daily-to-bigquery.mjs`

Required GitHub Secrets / Vars
Secrets (Repository -> Settings -> Secrets and variables -> Actions -> Secrets)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BIGQUERY_SERVICE_ACCOUNT_JSON`
  - JSON string for a Google service account.

Vars (Repository -> Settings -> Secrets and variables -> Actions -> Variables)
- `BIGQUERY_PROJECT_ID`
- `BIGQUERY_DATASET`
- Optional: `BIGQUERY_ANALYTICS_DATASET` (defaults to `BIGQUERY_DATASET`)
- Optional: `BIGQUERY_ANALYTICS_PARTITION_RETENTION_DAYS` (defaults to `365`)

Service Account Permissions (Recommended Minimum)
- BigQuery permissions to:
  - create tables (optional; provisioning step runs best-effort)
  - run queries (DELETE statements for idempotency)
  - insert rows (streaming inserts)

Troubleshooting
- If the workflow fails on schedule:
  - Check the artifact `analytics-warehouse-export-log` for per-day errors.
  - Common causes: missing secrets/vars, dataset/table permissions, or table not provisioned/partitioned.
- If the workflow does not appear in GitHub Actions:
  - Ensure `.github/workflows/analytics-warehouse-export.yml` is committed to the default branch.
