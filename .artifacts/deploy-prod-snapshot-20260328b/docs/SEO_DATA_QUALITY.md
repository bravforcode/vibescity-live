# SEO Data Quality

Purpose
- Guardrail for slug/short_code quality before SEO issues land in production.
- Detects missing slugs, missing/invalid short codes, and duplicates.

Manual run (GitHub Actions)
- Actions tab -> workflow: "SEO Data Quality Alert" -> Run workflow.

Local run
```bash
node scripts/ci/check-seo-data-quality.mjs
```

Required secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional environment variables
- `SEO_QUALITY_OUTPUT_PATH` (default: `reports/ci/seo-data-quality.json`)
- `SEO_QUALITY_PAGE_SIZE` (default: 1000)
- `SEO_QUALITY_MAX_ROWS` (default: 20000)
- `SEO_QUALITY_MAX_MISSING_SLUGS` (default: 0)
- `SEO_QUALITY_MAX_MISSING_SHORT_CODES` (default: 0)
- `SEO_QUALITY_MAX_DUPLICATE_SLUGS` (default: 0)
- `SEO_QUALITY_MAX_DUPLICATE_SHORT_CODES` (default: 0)
- `SEO_QUALITY_MAX_INVALID_SHORT_CODES` (default: 0)
- `SEO_QUALITY_FAIL_ON_ALERT` (default: true)

Short code format
- Base32 7 chars: `A-Z` and `2-7` only (example: `ABC1234`).

Alerting
- Workflow posts to `ALERT_WEBHOOK_URL` when an alert triggers.
- Outputs `reports/ci/seo-data-quality.json` as an artifact.
