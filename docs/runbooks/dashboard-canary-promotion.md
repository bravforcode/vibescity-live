# Dashboard Canary Promotion Criteria

## Rollout Stages

1. `10%` canary for 48 hours
2. `50%` canary for 24 hours
3. `100%` full rollout after approval

## Required CI Gates (must be green before promotion)

- `Dashboard Canary Promotion Gates / dashboard-canary-e2e`
- `Dashboard Canary Promotion Gates / dashboard-visual-regression`

Both checks are required for `10% -> 50%` and `50% -> 100%` promotion decisions.

## Required Check Binding

Use repo-admin token once to bind required checks on `main`:

```bash
npm run ci:branch-protect:dashboard-canary
```

Or run GitHub workflow `Dashboard Canary Required Checks` (manual dispatch) with `BRANCH_PROTECTION_TOKEN`.

## 10% -> 50% (all required)

- Error rate delta < `0.1%` vs control
- Auth redirect rate not increased
- Owner KPI time-to-visible not degraded by > `20%`
- Partner payout submit failure rate <= `0.5%`
- No P0/P1 incidents attributed to canary

## 50% -> 100% (all required)

- All prior checks remain green
- Payout duplicate request rate = `0`
- SSE payout status stream reconnect rate within baseline
- Frontend and backend on-call explicit approval

## Immediate Rollback Conditions

- Any payout duplication confirmed
- Auth leakage (unauthorized access) confirmed
- 5xx spike > `1%` sustained for 10 minutes
- KPI panel blank state > `2%` sessions

## Rollback Steps

1. Disable `ff_owner_dashboard_v2` and/or `ff_partner_dashboard_v2`
2. Verify traffic returns to control variant
3. Post incident update in release channel
4. Open postmortem action items
