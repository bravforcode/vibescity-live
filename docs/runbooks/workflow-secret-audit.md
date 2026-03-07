# Workflow Secret Audit

Generated from live repository settings on March 7, 2026 for `bravforcode/vibescity-live`.

## Current Status

- Repo secrets present: `16`
- Repo variables present: `27`
- Remaining repo-level external inputs still missing: `7`

## Repo-Level Missing Inputs

| Kind | Name | Workflows | Notes |
| --- | --- | --- | --- |
| secret | `ALERT_WEBHOOK_URL` | `seo-data-quality-alert.yml` | External alert destination required |
| secret | `GOOGLE_CREDENTIALS` | `visual-regression.yml` | Required only for GCS-backed visual baseline sync |
| secret | `GRAFANA_LOKI_TOKEN` | `monthly-quality-trend.yml`, `synthetic-postdeploy-monitor.yml`, `weekly-lighthouse.yml`, `weekly-quality-trend.yml` | Real observability credential required |
| secret | `PII_AUDIT_ALERT_WEBHOOK_URL` | `pii-access-anomaly-alert.yml` | External privacy alert destination required |
| secret | `SONAR_TOKEN` | `sonarcloud.yml` | Repo-level missing, but CI may still pass via org secret |
| secret | `SUPABASE_KEY` | `venue-scraper.yml` | Real scraper credential required |
| var | `GRAFANA_LOKI_URL` | `monthly-quality-trend.yml`, `synthetic-postdeploy-monitor.yml`, `weekly-lighthouse.yml`, `weekly-quality-trend.yml` | Real Loki endpoint still required |
| var | `GRAFANA_LOKI_USER` | `monthly-quality-trend.yml`, `synthetic-postdeploy-monitor.yml`, `weekly-lighthouse.yml`, `weekly-quality-trend.yml` | Optional unless Loki requires basic auth |

## Repo-Level Inputs Added During Dashboard Canary Hardening

### Secrets present

| Name | Workflows |
| --- | --- |
| `BRANCH_PROTECTION_TOKEN` | `dashboard-canary-required-checks.yml` |
| `K6_BASE_URL` | `load-test.yml` |
| `MAPBOX_PUBLIC_TOKEN` | `ci.yml`, `dashboard-canary-gates.yml`, `playwright.yml`, `sonarcloud.yml`, `synthetic-postdeploy-monitor.yml` |
| `SUPABASE_PROJECT_ID` | `supabase-db-pull.yml` |

### Variables present

| Name | Value Strategy | Workflows |
| --- | --- | --- |
| `BIGQUERY_ANALYTICS_PARTITION_RETENTION_DAYS` | `365` | `analytics-warehouse-export.yml` |
| `INCIDENT_SUPPRESS` | `false` | `synthetic-postdeploy-monitor.yml`, `weekly-quality-trend.yml` |
| `INCIDENT_SUPPRESS_UNTIL_UTC` | `1970-01-01T00:00:00Z` | `synthetic-postdeploy-monitor.yml`, `weekly-quality-trend.yml` |
| `INCIDENT_SUPPRESS_START_UTC` | `1970-01-01T00:00:00Z` | `synthetic-postdeploy-monitor.yml`, `weekly-quality-trend.yml` |
| `INCIDENT_SUPPRESS_END_UTC` | `1970-01-01T00:00:00Z` | `synthetic-postdeploy-monitor.yml`, `weekly-quality-trend.yml` |
| `INCIDENT_SUPPRESS_WINDOWS_UTC` | `[]` | `synthetic-postdeploy-monitor.yml`, `weekly-quality-trend.yml` |
| `INCIDENT_SUPPRESS_REASON` | `none` | `synthetic-postdeploy-monitor.yml`, `weekly-quality-trend.yml` |
| `OSM_SYNC_LOOP_ITERATIONS` | `3` | `osm-sync.yml` |
| `OSM_SYNC_WORKERS` | `6` | `osm-sync.yml` |
| `PII_ACCESS_ALERT_ENABLED` | `true` | `pii-access-anomaly-alert.yml` |
| `PII_ACCESS_ALERT_WINDOW_MINUTES` | `60` | `pii-access-anomaly-alert.yml` |
| `PII_ACCESS_ALERT_TOTAL_THRESHOLD` | `50` | `pii-access-anomaly-alert.yml` |
| `PII_ACCESS_ALERT_EXPORT_THRESHOLD` | `10` | `pii-access-anomaly-alert.yml` |
| `PII_ACCESS_ALERT_PER_ACTOR_THRESHOLD` | `25` | `pii-access-anomaly-alert.yml` |
| `PII_ACCESS_ALERT_MAX_ROWS` | `5000` | `pii-access-anomaly-alert.yml` |
| `PII_ACCESS_ALERT_DEDUP_WINDOW_MINUTES` | `60` | `pii-access-anomaly-alert.yml` |
| `POSTDEPLOY_EDGE_BASE_URL` | Supabase functions base URL | `fly-deploy.yml`, `synthetic-postdeploy-monitor.yml` |
| `POSTDEPLOY_CHECKOUT_VENUE_ID` | Zero UUID no-op probe default | `fly-deploy.yml` |
| `POSTDEPLOY_ORDER_ID` | Zero UUID probe default | `fly-deploy.yml`, `synthetic-postdeploy-monitor.yml` |
| `PROD_ANALYTICS_STATS_URL` | Production analytics API URL | `osm-sync.yml` |
| `SEO_CACHE_CONCURRENCY` | `8` | `seo-cache-warm.yml` |
| `SEO_CACHE_MAX_VENUES` | `10000` | `seo-cache-warm.yml` |
| `SITE_ORIGIN` | `https://vibecity.live` | `seo-cache-warm.yml` |
| `SUPABASE_PROJECT_ID` | project ref | `supabase-db-pull.yml` |
| `SUPABASE_PROJECT_REF` | project ref | `supabase-db-pull.yml` |

## Notes

- `GITHUB_TOKEN` is injected automatically by GitHub Actions and is not a repository secret.
- `SONAR_TOKEN` remains repo-level missing but SonarCloud can still pass if the token is inherited from organization-level secrets.
- `POSTDEPLOY_CHECKOUT_VENUE_ID` and `POSTDEPLOY_ORDER_ID` were intentionally set to zero-UUID probe defaults so health checks exercise route existence without requiring live financial IDs.
- `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`, and `GRAFANA_LOKI_TOKEN` were left unresolved because they require real observability infrastructure coordinates and credentials.
