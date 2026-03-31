# 2026-03-31 Nationwide Road Flow And Performance

## Goal

- make the road-car effect visible across Thailand instead of only on selected road classes / areas
- bind nationwide road-flow to the live user location / current province instead of waiting for timer-only refresh
- keep the effect performant on mobile and coarse-pointer lanes
- avoid regressing the existing neon road-flow animation or reduced-motion guardrails

## Scope

- `src/composables/map/useMapLayers.js`
- `src/components/map/MapLibreContainer.vue`
- `tests/e2e/map_traffic_effect.spec.ts`
- `docs/runbooks/agent-operating-memory.md`

## Plan

1. Expand the eligible nationwide road classes so dense urban/local streets can spawn traffic cars too.
2. Make the moving vehicles visually explicit with a lightweight map symbol layered over the existing glow/core treatment.
3. Rebind the traffic pipeline immediately when `userLocation` or province changes so cars follow the current live location lane.
4. Keep the animation loop capped and viewport-driven so the fix stays smooth on mobile.
5. Validate with `biome`, `build`, and browser verification against the preview server at both the default map and a Bangkok viewport.
