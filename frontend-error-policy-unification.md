# Frontend Error Policy Unification

## Goal

Unify fetch/retry/error handling across frontend feed, events, local ads, and adjacent lightweight network helpers so expected failures are quiet, genuine failures stay actionable, and retry behavior is consistent end-to-end.

## Scope

- `src/composables/useFeedV2.js`
- `src/composables/useEventLogic.js`
- `src/composables/useLocalAds.js`
- candidate helpers discovered during implementation
- targeted unit tests

## Approach

- Reuse shared network helpers instead of ad-hoc `console.warn/error` patterns
- Normalize fallback behavior for transient/offline/schema-miss cases
- Keep UI state deterministic under retry/failure
- Add regression tests where behavior could silently drift

## Success Criteria

- Feed/events/local ads follow one error-policy shape
- Expected/transient failures do not spam console
- Retry/fallback behavior is explicit and test-covered
- `bun run lint` passes
- `bun run test:unit --run` passes
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .` passes

## Result

- Shared transient/abort detection now drives feed, events, and local ads instead of per-feature string matching
- Retry policy is centralized in `src/utils/retryPolicy.js` with explicit `feed`, `events`, and `localAds` profiles
- Feed degrades cleanly on missing RPC/schema-cache failures and retries transient failures once before falling back
- Events provider failures now retry via the shared policy and degrade quietly without noisy console output
- Local ads preserve previous state on transient failures and ignore stale async responses
- Analytics tracking now routes through the existing service instead of a separate raw fetch path
- Added regression coverage for network helpers, retry policy, feed, events, and local ads behavior
- Stabilized the previously flaky mobile modal/media spec for full-suite runs by preloading slow component imports and giving the heavy cases explicit test timeouts

## Validation

- `bun x vitest run tests/unit/networkErrorUtils.spec.js tests/unit/retryPolicy.spec.js tests/unit/useFeedV2.spec.js tests/unit/useLocalAds.spec.js tests/unit/useEventLogic.spec.js`
- `bun run lint`
- `bun run test:unit --run`
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .`
