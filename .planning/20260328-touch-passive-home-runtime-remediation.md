# 2026-03-28 Touch Passive + Home Runtime Remediation

## Goal

- remove avoidable non-passive touch warnings in the home UI
- reduce first-load home runtime work that still lands in the initial mount window
- keep map/feed interactions intact on mobile

## Scope

- `src/components/`
- `src/composables/`
- `src/views/HomeView.vue`
- `tests/unit/composables/useMapInteractions.spec.js`
- `docs/runbooks/agent-operating-memory.md`

## Plan

1. Find `touchstart`/`touchmove` listeners that do not need `preventDefault()` and convert them to passive-safe Vue modifiers or pointer alternatives.
2. Measure current home runtime baseline before edits, then trim obvious first-load work instead of broad refactors.
3. Validate with targeted unit checks plus build, then update memory.
