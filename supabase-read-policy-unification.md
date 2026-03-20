# Supabase Read Policy Unification

## Goal

Unify remaining Supabase read/fallback handling across stores and legacy services so transient/schema-cache failures follow one retry/fallback policy and do not overwrite stable UI state.

## Scope

- `src/utils/supabaseReadPolicy.js`
- `src/utils/networkReadPolicy.js`
- `src/store/featureFlagStore.js`
- `src/store/coinStore.js`
- `src/store/roomStore.js`
- `src/store/favoritesStore.js`
- `src/store/userStore.js`
- `src/services/realTimeDataService.js`
- `src/services/adminDataService.js`
- `src/services/adminRequestPolicy.js`
- `src/services/adminService.js`
- `src/services/adminAnalyticsService.js`
- `src/services/adminPiiAuditService.js`
- `src/services/shopService.js`
- related unit tests

## Approach

- Centralize retry + soft-error classification for Supabase read paths
- Preserve existing state on soft failures when safe
- Keep discovery methods deterministic on fallback (`[]` / existing state)
- Reduce console noise for expected transient/schema-cache cases

## Success Criteria

- Feature flags, coin stats, room counts, and legacy discovery share one read policy
- Soft Supabase failures do not reset healthy frontend state
- Legacy discovery methods degrade predictably without noisy console output
- `bun run lint` passes
- `bun run test:unit --run` passes
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .` passes

## Result

- Added shared helper `src/utils/supabaseReadPolicy.js` for:
  - soft-error classification (`schema cache` + transient network/read errors)
  - policy-driven retry execution
  - unexpected-error logging without transient noise
- Added shared helper `src/utils/networkReadPolicy.js` for non-Supabase read paths that still need the same retry/degrade semantics
- `featureFlagStore` now preserves already-loaded flags on soft refresh failures instead of resetting live state unnecessarily
- `coinStore` now keeps existing user stats on soft Supabase/gamification read failures and avoids noisy logging for expected transient issues
- `roomStore` now preserves current live counts when the initial count fetch soft-fails
- `favoritesStore` now preserves existing favorites on soft read failures and suppresses expected sync/clear noise for queued or aborted operations
- `userStore` now routes profile fetches through the shared read policy and suppresses expected abort noise when XP log writes are cancelled
- `realTimeDataService` now:
  - imports the canonical `src/lib/supabase.js` client instead of the stale `./supabase` path
  - retries OSM reads with stale-cache fallback
  - retries province/nearby Supabase reads through the shared read policy
  - degrades to deterministic fallback data without noisy transient logging
- Admin HTTP services (`adminService`, `adminAnalyticsService`, `adminPiiAuditService`) now share one retry/auth/error parser via `adminRequestPolicy`
- `adminDataService` now applies the same soft-failure fallback semantics for admin dashboards and paginated reads instead of mixing silent catches with raw thrown Supabase errors
- Legacy discovery methods in `shopService` now follow the same Supabase read policy for venue lists and feed cards
- Existing discovery paths continue to use the same shared policy through earlier `shopStore` / `geoService` hardening, so the read path is now materially more uniform end-to-end
- Added regression tests for feature flags, coin stats, room counts, favorites, user profile reads, real-time discovery, admin request retry/unauthorized handling, admin data pagination fallback, legacy discovery, and extended retry policy coverage

## Validation

- `bun x vitest run tests/unit/featureFlagStore.spec.js tests/unit/coinStore.spec.js tests/unit/roomStore.spec.js tests/unit/shopService.discovery.spec.js tests/unit/retryPolicy.spec.js tests/unit/shopService.abort.spec.js`
- `bun x vitest run tests/unit/favoritesStore.spec.js tests/unit/userStore.spec.js tests/unit/realTimeDataService.spec.js tests/unit/adminRequestPolicy.spec.js tests/unit/adminDataService.spec.js tests/unit/retryPolicy.spec.js`
- `bun run lint`
- `bun run test:unit --run`
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .`
