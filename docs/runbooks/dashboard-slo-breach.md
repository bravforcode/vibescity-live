# Dashboard SLO Breach Runbook

## Scope

- Owner Dashboard
- Partner Dashboard
- Financial panels (bank save, payout request, payout status stream)

## Trigger Matrix

1. `TTKPI > 1.5s` for 3 consecutive windows
2. `TTI > 2.5s` for 3 consecutive windows
3. `Payout submit failure rate > 1%`
4. `Filter/Search P95 > 500ms`

## Response Steps

1. Check route-level SLO artifact (`reports/ci/route-slo-evaluation.json`).
2. Check dashboard client metrics (`dashboard_time_to_data`, `dashboard_tti`).
3. If DB-bound, inspect owner venue query indexes and slow query logs.
4. If client-bound, inspect recent bundle/chunk deltas for dashboard routes.
5. If payout failures spike, inspect CSRF failures and idempotency conflicts.
6. Never auto-retry payout request without explicit user confirmation.

## Escalation

- Frontend perf: `@frontend-oncall`
- Backend query/API: `@backend-oncall`
- Financial flow: `@payments-oncall`

## Mitigation Flags

- Enable stale-cache fallback for KPI cards.
- Reduce polling frequency to emergency profile.
- Temporarily disable non-critical dashboard sections via feature flags.

