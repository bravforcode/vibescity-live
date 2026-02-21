# PII Audit (Raw IP) – Enterprise Mode

Purpose
- Track raw IP addresses for security/audit and enterprise reporting.
- Keep this **separate** from product analytics (which stores only hashed IP).

Data Model (Supabase)
- Table: `public.pii_audit_sessions`
  - One row per session window (default 30 minutes).
  - Contains `visitor_id`, optional `user_id`, `ip_raw`, `user_agent`, `country`, `city`, `started_at`, `last_seen_at`.
- Table: `public.pii_audit_access_log`
  - Records every admin dashboard view/export (who/when/filters).

Retention
- Purge jobs delete rows older than **90 days**:
  - `public.purge_pii_audit_sessions(90)`
  - `public.purge_pii_audit_access_log(90)`
- If `pg_cron` is available, migrations schedule daily jobs automatically.

Access Control
- DB: RLS enabled; only `service_role` may read/write.
- Edge functions enforce:
  - Authenticated user must have role `admin` or `pii_audit_viewer` in `app_metadata`
  - Correct shared PIN (`PII_AUDIT_ADMIN_PIN`)

Edge Functions
- Public ingest (origin allowlist required):
  - `pii-audit-ingest` (verify_jwt = false)
- Admin-only APIs:
  - `admin-pii-audit-dashboard` (verify_jwt = true)
  - `admin-pii-audit-export` (verify_jwt = true)
  - `admin-pii-audit-access-export` (verify_jwt = true)

Required Supabase Secrets (Edge)
- `PII_AUDIT_ENABLED=true`
- `PII_AUDIT_ORIGIN_ALLOWLIST=https://vibecity.live,...`
- `PII_AUDIT_ADMIN_PIN=<your-pin>`
- Optional:
  - `PII_AUDIT_SESSION_WINDOW_MINUTES=30`
  - `PII_AUDIT_DASHBOARD_MAX_ROWS=50000`
  - `PII_AUDIT_EXPORT_MAX_ROWS=5000`
  - `PII_AUDIT_ACCESS_MAX_ROWS=10000`
  - `PII_AUDIT_ACCESS_EXPORT_MAX_ROWS=5000`

Frontend
- `VITE_PII_AUDIT_ENABLED=true` enables periodic client pings (throttled, fail-open).
- Admin UI: `/admin` -> tab `PII Audit` (PIN is kept in memory only).
- Admin PII access report shows who viewed/exported PII audit data and how often.

Anomaly Alerts (CI)
- Workflow: `.github/workflows/pii-access-anomaly-alert.yml`
- Uses Supabase service role to scan `pii_audit_access_log` and triggers an alert webhook on spikes.
- Required GitHub Secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PII_AUDIT_ALERT_WEBHOOK_URL`
- Optional GitHub Vars (thresholds):
  - `PII_ACCESS_ALERT_ENABLED` (default true)
  - `PII_ACCESS_ALERT_WINDOW_MINUTES` (default 60)
  - `PII_ACCESS_ALERT_TOTAL_THRESHOLD` (default 50)
  - `PII_ACCESS_ALERT_EXPORT_THRESHOLD` (default 10)
  - `PII_ACCESS_ALERT_PER_ACTOR_THRESHOLD` (default 25)
  - `PII_ACCESS_ALERT_MAX_ROWS` (default 5000)
  - `PII_ACCESS_ALERT_DEDUP_WINDOW_MINUTES` (default 60)

Notes (Risk)
- Raw IP is PII. Ensure your legal/privacy policy is accurate for your jurisdiction and business requirements.
