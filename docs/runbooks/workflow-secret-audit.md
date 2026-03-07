# Workflow Secret Audit

Generated from current repository workflow references against live GitHub repo secrets/variables for `bravforcode/vibescity-live`.

## Secret Status

| Kind | Name | Status | Workflows |
| --- | --- | --- | --- |
| secret | ALERT_WEBHOOK_URL | missing | seo-data-quality-alert.yml |
| secret | BIGQUERY_SERVICE_ACCOUNT_JSON | present | analytics-warehouse-export.yml, monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml, weekly-quality-trend.yml |
| secret | BRANCH_PROTECTION_TOKEN | present | dashboard-canary-required-checks.yml |
| secret | FLY_API_TOKEN | present | fly-deploy.yml |
| secret | GOOGLE_CREDENTIALS | missing | visual-regression.yml |
| secret | GRAFANA_LOKI_TOKEN | missing | monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml, weekly-quality-trend.yml |
| secret | K6_BASE_URL | missing | load-test.yml |
| secret | MAPBOX_PUBLIC_TOKEN | present | ci.yml, dashboard-canary-gates.yml, playwright.yml, sonarcloud.yml, synthetic-postdeploy-monitor.yml |
| secret | PII_AUDIT_ALERT_WEBHOOK_URL | missing | pii-access-anomaly-alert.yml |
| secret | POSTDEPLOY_CHECKOUT_VENUE_ID | missing | fly-deploy.yml |
| secret | POSTDEPLOY_ORDER_ID | missing | fly-deploy.yml, synthetic-postdeploy-monitor.yml |
| secret | POSTDEPLOY_SUPABASE_JWT | present | fly-deploy.yml, synthetic-postdeploy-monitor.yml |
| secret | PROD_ADMIN_BEARER_TOKEN | present | osm-sync.yml |
| secret | REDIS_URL | present | osm-sync.yml |
| secret | SONAR_TOKEN | missing | sonarcloud.yml |
| secret | SUPABASE_ACCESS_TOKEN | present | supabase-db-pull.yml |
| secret | SUPABASE_ANON_KEY | present | dashboard-canary-gates.yml, venue-media-populate.yml |
| secret | SUPABASE_DB_PASSWORD | present | supabase-db-pull.yml |
| secret | SUPABASE_DIRECT_URL | present | osm-sync.yml |
| secret | SUPABASE_KEY | missing | venue-scraper.yml |
| secret | SUPABASE_PROJECT_ID | missing | supabase-db-pull.yml |
| secret | SUPABASE_SERVICE_ROLE_KEY | present | analytics-warehouse-export.yml, osm-sync.yml, pii-access-anomaly-alert.yml, seo-cache-warm.yml, seo-data-quality-alert.yml |
| secret | SUPABASE_URL | present | analytics-warehouse-export.yml, dashboard-canary-gates.yml, osm-sync.yml, pii-access-anomaly-alert.yml, seo-cache-warm.yml, seo-data-quality-alert.yml, supabase-db-pull.yml, venue-scraper.yml |
| secret | SYNTHETIC_ALERT_WEBHOOK_URL | present | monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |

## Variable Status

| Kind | Name | Status | Workflows |
| --- | --- | --- | --- |
| var | BIGQUERY_ANALYTICS_DATASET | present | analytics-warehouse-export.yml |
| var | BIGQUERY_ANALYTICS_PARTITION_RETENTION_DAYS | missing | analytics-warehouse-export.yml |
| var | BIGQUERY_DATASET | present | analytics-warehouse-export.yml, monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml, weekly-quality-trend.yml |
| var | BIGQUERY_PROJECT_ID | present | analytics-warehouse-export.yml, monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml, weekly-quality-trend.yml |
| var | GRAFANA_LOKI_URL | missing | monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml, weekly-quality-trend.yml |
| var | GRAFANA_LOKI_USER | missing | monthly-quality-trend.yml, synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml, weekly-quality-trend.yml |
| var | INCIDENT_SUPPRESS | missing | synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |
| var | INCIDENT_SUPPRESS_END_UTC | missing | synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |
| var | INCIDENT_SUPPRESS_REASON | missing | synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |
| var | INCIDENT_SUPPRESS_START_UTC | missing | synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |
| var | INCIDENT_SUPPRESS_UNTIL_UTC | missing | synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |
| var | INCIDENT_SUPPRESS_WINDOWS_UTC | missing | synthetic-postdeploy-monitor.yml, weekly-quality-trend.yml |
| var | OSM_SYNC_LOOP_ITERATIONS | missing | osm-sync.yml |
| var | OSM_SYNC_WORKERS | missing | osm-sync.yml |
| var | PII_ACCESS_ALERT_DEDUP_WINDOW_MINUTES | missing | pii-access-anomaly-alert.yml |
| var | PII_ACCESS_ALERT_ENABLED | missing | pii-access-anomaly-alert.yml |
| var | PII_ACCESS_ALERT_EXPORT_THRESHOLD | missing | pii-access-anomaly-alert.yml |
| var | PII_ACCESS_ALERT_MAX_ROWS | missing | pii-access-anomaly-alert.yml |
| var | PII_ACCESS_ALERT_PER_ACTOR_THRESHOLD | missing | pii-access-anomaly-alert.yml |
| var | PII_ACCESS_ALERT_TOTAL_THRESHOLD | missing | pii-access-anomaly-alert.yml |
| var | PII_ACCESS_ALERT_WINDOW_MINUTES | missing | pii-access-anomaly-alert.yml |
| var | POSTDEPLOY_CHECKOUT_VENUE_ID | missing | fly-deploy.yml |
| var | POSTDEPLOY_EDGE_BASE_URL | missing | fly-deploy.yml, synthetic-postdeploy-monitor.yml |
| var | POSTDEPLOY_ORDER_ID | missing | fly-deploy.yml, synthetic-postdeploy-monitor.yml |
| var | PROD_ANALYTICS_STATS_URL | missing | osm-sync.yml |
| var | SEO_CACHE_CONCURRENCY | missing | seo-cache-warm.yml |
| var | SEO_CACHE_MAX_VENUES | missing | seo-cache-warm.yml |
| var | SITE_ORIGIN | missing | seo-cache-warm.yml |
| var | SUPABASE_PROJECT_ID | missing | supabase-db-pull.yml |
| var | SUPABASE_PROJECT_REF | missing | supabase-db-pull.yml |
| var | SYNTHETIC_MAP_BASE_URL | present | synthetic-postdeploy-monitor.yml, weekly-lighthouse.yml |

## Notes

- `GITHUB_TOKEN` is intentionally not listed as missing here. It is injected automatically by GitHub Actions and does not need to be created as a repository secret.
- `POSTDEPLOY_CHECKOUT_VENUE_ID` and `POSTDEPLOY_ORDER_ID` are currently missing from both repo variables and repo secrets. Workflows that use `vars.NAME || secrets.NAME` will still fail until one source is populated.
- `PROD_ANALYTICS_STATS_URL` exists today as a repo secret, but `osm-sync.yml` reads `vars.PROD_ANALYTICS_STATS_URL`. That workflow will still see it as missing until the value is added as a repository variable or the workflow is changed to read the secret.
