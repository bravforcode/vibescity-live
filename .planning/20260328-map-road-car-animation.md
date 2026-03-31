# 2026-03-28 Map Road Car Animation

## Goal

- add continuously moving car effects on road lanes
- keep the animation lightweight enough to avoid new UI jank or map stalls
- avoid touching unrelated map, card, modal, or feed behavior

## Scope

- `src/composables/map/useMapLayers.js`
- `docs/runbooks/agent-operating-memory.md`

## Plan

1. Reuse the existing road-flow animation system instead of creating DOM markers.
2. Add a tiny animated GeoJSON point source for car lights sampled from road geometry.
3. Throttle car source updates to a low fixed cadence and pause when the document is hidden.
4. Validate with `biome`, `build`, and a before/after home runtime profile.
