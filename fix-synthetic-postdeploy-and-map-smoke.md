# Fix Synthetic Postdeploy And Map Smoke

## Scope
- Fix synthetic postdeploy failure caused by edge route `create-checkout-session` 404
- Fix production `map_smoke_lite` readiness failure so smoke monitor reflects real app readiness

## Success Criteria
- `synthetic-postdeploy` no longer fails on stale/mis-targeted edge checkout route checks
- `browser-smoke-map-lite` passes against `https://www.vibescity.live`
- No regression to BigQuery/Loki release-health snapshot path

## Workstreams
1. Trace healthcheck route expectations vs actual deployed payment surfaces
2. Update healthcheck script/config to validate the correct read-only checkout surface
3. Inspect map smoke readiness contract and production DOM/network timing
4. Relax or correct readiness heuristics without masking real map failures
5. Validate locally, then rerun GitHub workflow

## Risks
- Accidentally weakening synthetic assertions too much
- Pointing healthcheck to a legacy path that is not the canonical checkout surface
- Fixing CI only for one deployment shape

## Implementation Notes
- Added edge host mismatch protection so runtime and healthcheck derive `/functions/v1` from the configured Supabase base URL when an explicit edge URL points at a different project
- Switched read-only edge checkout probing to `OPTIONS /functions/v1/create-checkout-session` so synthetic monitoring stays non-mutating while still detecting 404 drift
- Updated synthetic and Fly postdeploy workflows to pass `POSTDEPLOY_SUPABASE_URL`
- Replaced brittle `waitForFunction` map readiness waits with polling that tolerates headless execution-context resets during hydration/style swaps
- Increased the first smoke-map test timeout in CI to match its 45s readiness budget

## Validation
- `bun run check`
- `node --check scripts/healthcheck-post-deploy.mjs`
- local postdeploy healthcheck with mismatched `POSTDEPLOY_EDGE_BASE_URL` confirmed fallback to `https://rukyitpjfmzhqjlfmbie.supabase.co/functions/v1`
- direct `OPTIONS https://rukyitpjfmzhqjlfmbie.supabase.co/functions/v1/create-checkout-session` returned `200`
- `bun run test:e2e:smoke-map-lite` against `https://www.vibescity.live` passed `2/2`
