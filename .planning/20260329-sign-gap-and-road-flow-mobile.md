# 2026-03-29 Sign Gap And Road Flow Mobile

## Goal

- push the selected neon sign farther above the `VibeModal` on narrow mobile viewports
- restore visible road-flow / moving-car effects on mobile balanced-motion lanes without re-enabling all heavy map effects
- keep reduced-motion and low-power guardrails intact

## Scope

- `src/components/map/MapLibreContainer.vue`
- `src/composables/map/useMapLayers.js`
- `tests/unit/*` if targeted coverage is needed
- `docs/runbooks/agent-operating-memory.md`

## Plan

1. Separate road-flow eligibility from the broader mobile animation guard.
2. Keep traffic/car animation enabled for balanced/full motion budgets, but still disable it for low-power or reduced-motion lanes.
3. Increase detail-selection clearance on mobile by pushing the sign anchor higher above the modal.
4. Validate with lint, focused tests, build, and browser verification on the local dev host.
