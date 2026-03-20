# Map Bundle Lazy-Load Pass

## Goal

- Reduce home-route initial JS cost.
- Make map code-splitting real, not nominal.
- Remove production-dead imports from the map path.
- Keep smoke/build/checklist green.

## Targeted Changes

1. Remove static `HomeView` imports that defeat lazy loading for:
   - `MapboxContainer.vue`
   - `FilterMenu.vue`
2. Remove production-dead DOM neon overlay import path from `MapboxContainer.vue`.
3. Remove global `vue3-lottie` bootstrap from `main.js` and scope it to the local component that needs it.
4. Rebuild and compare chunk sizes.
5. Re-run smoke and checklist.

## Success Criteria

- Smaller home entry chunk or less eager map-related code in the initial path.
- No regression in map rendering or filter modal behavior.
- Smoke suite remains green.
