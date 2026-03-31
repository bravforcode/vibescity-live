# 2026-03-28 User Location Nearby Startup

## Goal

Make the public home/map startup behave location-first:

- open centered on the user's real position instead of the Thailand-wide fallback when geolocation is available
- keep the startup map focused near the user without auto-selecting a random first venue
- show a default feed of 30 nearby venues with deterministic 30-minute rotation

## Scope

- `src/composables/useAppLogic.js`
- `src/store/shopStore.js`
- `src/components/map/MapLibreContainer.vue`
- `tests/unit/stores/shopStore.spec.js`
- `docs/runbooks/agent-operating-memory.md`

## Implementation Notes

- Prime geolocation once at startup with a short time budget so the app does not hang forever on permission/UI delays.
- Preserve existing deep-link behavior for `/venue/:id`, `/v/:slug`, and query-param venue opens.
- Keep the map centered on the user at startup; do not auto-open the first nearby venue preview.
- Default feed should stay deterministic inside a 30-minute bucket and refresh on the next bucket change.

## Validation

- `npx biome check src/composables/useAppLogic.js src/store/shopStore.js src/components/map/MapLibreContainer.vue tests/unit/stores/shopStore.spec.js`
- `npx vitest run tests/unit/stores/shopStore.spec.js`
- `npm run build`
