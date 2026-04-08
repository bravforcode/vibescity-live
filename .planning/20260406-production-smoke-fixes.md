## Goal
Remove the production console/runtime regressions reported from the live Vercel deployment and verify the public app behaves cleanly.

## Scope
- in: reproduce production console errors, fix the triggering frontend/service-worker code, validate with build plus browser smoke
- out: payment/auth/schema changes, unrelated repo-wide cleanup, production platform migration

## Steps
1. Reproduce the reported production issues against `https://vibecitylive.vercel.app`
2. Trace each issue to the smallest responsible source file
3. Patch only the code/config that triggers the runtime noise or broken request
4. Run build and browser verification
5. Update operating memory with the new production-smoke baseline

## Success criteria
- [ ] no PII audit CORS noise from the public app by default
- [ ] no Workbox duplicate precache entry crash from `offline.html`
- [ ] font preload warning is removed or intentionally downgraded by aligning preload usage
- [ ] build still succeeds

## Risks
- service worker changes can affect offline behavior: keep the fix narrowly targeted
- disabling noisy telemetry must not break intentional observability in explicit debug lanes

## Rollback
Revert the touched frontend/service-worker files and redeploy the previous working build
