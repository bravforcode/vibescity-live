# Runbook: API Latency Spike (Response Time > 500ms)

## 1. Initial Diagnosis
- **Check Grafana Dashboard:** "VibeCity API Overview" -> Look for p95 latency.
- **Check Metrics:** Identify if latency is specific to an endpoint (e.g., `/geodata`).
- **Check Logs:** Search for `http_request` logs with high `duration_ms`.

## 2. Common Causes & Fixes
### A. Database Bottleneck
- **Action:** Check Supabase dashboard for slow queries.
- **Fix:** Add missing indexes or optimize PostGIS queries.

### B. Redis Cache Misses
- **Action:** Verify Redis connectivity and memory usage.
- **Fix:** Restart Redis or increase memory limit.

### C. High Load
- **Action:** Check Fly.io auto-scaling status.
- **Fix:** Manually scale up if auto-scaling is delayed: `fly scale count 3`.

## 3. Escalation
- If latency persists > 10 minutes, notify Lead Developer and post in #incidents.
