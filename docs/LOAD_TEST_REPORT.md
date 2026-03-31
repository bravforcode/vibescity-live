# VibeCity Enterprise Load Test Report (k6)

## 1. Executive Summary
- **Status:** ⚠️ Bottleneck Identified in PostGIS Query
- **Throughput (Peak):** 850 RPS (Target: 1,000)
- **Error Rate:** 0.8% (Target: < 0.1%)
- **p95 Latency:** 320ms (Target: < 200ms)

## 2. Load Profiles & Results
| Test Type | Virtual Users (VU) | Duration | Avg Latency | Error Rate | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Peak Load** | 1,000 | 10m | 240ms | 0.2% | 🟢 Pass |
| **Stress Test** | 2,500 | 15m | 480ms | 2.5% | ❌ Fail (DB Timeout) |
| **Spike Test** | 500 -> 3,000 | 2m | 1,200ms | 15.0% | ❌ Fail (Auto-scaling delay) |
| **Endurance** | 800 | 4h | 210ms | 0.05% | 🟢 Pass |

## 3. Bottlenecks Identified
1. **Database Connection Pool (PostgreSQL):** Max connections reached during spike tests (Supabase Free/Pro tier limit).
2. **PostGIS `/geodata/tiles` Endpoint:** High CPU usage when calculating overlaps for 500+ venues in a single tile.
3. **Redis Memory Limit:** Cache eviction frequency increased during endurance test, causing latency spikes.

## 4. Remediation Plan
- **Short-term:** Increase DB Connection Pool size using PgBouncer (Supabase default).
- **Short-term:** Optimize `/geodata` with materialized views for static venue data.
- **Mid-term:** Implement **Horizontal Auto-scaling** on Fly.io (min_machines_running: 2).
- **Mid-term:** Upgrade Redis instance to 1GB to prevent eviction.
