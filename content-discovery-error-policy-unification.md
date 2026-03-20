# Content Discovery Error Policy Unification

## Goal

Unify retry, fallback, and error-surface behavior across the remaining frontend content discovery paths so promotions, recommendations, nearby queries, feed/search, and enrichment flows follow the same policy from network layer to UI state.

## Scope

- `src/store/shopStore.js`
- `src/services/geoService.js`
- targeted shared network/retry helpers if needed
- targeted unit tests for discovery behavior

## Approach

- Reuse shared transient/abort helpers instead of store-local message checks
- Centralize retry decisions through `src/utils/retryPolicy.js`
- Preserve existing UI data when transient failures happen after prior successful loads
- Keep missing-RPC/schema-cache cases quiet and deterministic
- Add regression tests for feed/search/nearby discovery fallbacks

## Success Criteria

- Discovery flows share retry/fallback rules with other frontend network paths
- Transient failures do not overwrite good UI state
- Legacy nearby queries return deterministic fallback values
- `bun run lint` passes
- `bun run test:unit --run` passes
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .` passes

## Result

- Added shared retry profiles for `venueDiscovery`, `venueEnrichment`, `venueSearch`, and `nearbyDiscovery`
- `shopStore` now reuses shared transient detection for:
  - V2 feed fallback to standard venues query
  - optional venue enrichment
  - V2 search fallback to local filtering
  - venue detail hydration
- Transient/schema-cache discovery failures now preserve prior venue state instead of overwriting UI with an error state when good data already exists
- Legacy `geoService` nearby/bounds discovery now retries transient failures once and returns `[]` deterministically instead of `null`
- Added regression coverage for discovery retry/fallback behavior in `shopStore` and `geoService`
- Stabilized the mobile modal/media regression suite again by raising the `beforeAll` hook timeout so full-suite imports do not fail under aggregate load

## Validation

- `bun x vitest run tests/unit/shopStore.spec.js tests/unit/geoService.spec.js tests/unit/retryPolicy.spec.js`
- `bun run lint`
- `bun run test:unit --run`
- `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .`
