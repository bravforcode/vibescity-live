# Composable Abort Normalization

## Goal

Normalize abort and timeout handling across frontend composables so search, weather, navigation, and transport flows follow the same end-to-end policy as the service layer.

## Scope

- `src/composables/useSearchV2.js`
- `src/composables/useWeather.js`
- `src/composables/map/useMapNavigation.js`
- `src/composables/useTransportLogic.js`
- `src/components/map/MapboxContainer.vue`
- targeted unit tests

## Approach

- Reuse `src/utils/networkErrorUtils.js` instead of local abort string checks
- Suppress expected abort logs and stale fallback writes
- Keep genuine failures actionable
- Add regression tests for abort behavior in composables that own cancellation

## Success Criteria

- Composables stop duplicating abort detection logic
- Expected cancellation does not emit noisy warnings/errors
- Aborted/stale requests do not overwrite newer state
- `bun run lint` passes
- `bun run test:unit --run` passes
- `python .agent/scripts/checklist.py .` passes

## Result

- Shared abort handling now covers search, weather, ride-estimate, and map-route flows
- `MapboxContainer.vue` uses the same abort helper for route and pin fetches
- Added regression coverage for request replacement and timeout fallback behavior
- Validation passed:
  - `bun run lint`
  - `bun run test:unit --run`
  - `$env:PYTHONUTF8='1'; python .agent/scripts/checklist.py .`
