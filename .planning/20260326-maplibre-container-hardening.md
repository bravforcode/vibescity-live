# 2026-03-26 MapLibreContainer Hardening

## Goal

Stabilize `src/components/map/MapLibreContainer.vue` around real correctness and performance issues without broad architectural churn in an already-dirty worktree.

## Confirmed Issues In Scope

- Remove real dead cluster wiring from the container path where the source is explicitly `cluster: false`.
- Fix missing `setCyberpunkAtmosphere` destructuring so style-load handling is explicit and safe.
- Remove the contradictory add/remove flow for `sentient-pulse-ring`.
- Stop calling neon sign layer registration from the hot `applyFeatures` path.
- Replace the O(n) shop refresh hash with a cheap refresh key.
- Prevent deferred watchers created after async imports from leaking past unmount.
- Separate minute-tick local pin/status refresh from RPC-driven map refreshes.
- Add explicit deferred cleanup for dynamically imported feature instances and watcher stops.

## Explicit Non-Issues / Deferred

- `vibeMarkersMap` and the other mutable variables cited as "module-level" are inside a Vue `<script setup>` SFC and are therefore instance-scoped already; no "move into setup()" change is needed.
- The two `map-atmosphere.css` imports point to different files with different selectors, so they are not a duplicate-content import pair.
- Large-scale decomposition of `refreshPins()` and full rendering-mode strategy extraction are deferred to a dedicated refactor pass to avoid high-risk churn in this tranche.

## Validation

- `npx biome check src/components/map/MapLibreContainer.vue`
- Targeted unit/build validation as allowed by current repo state
- Update `docs/runbooks/agent-operating-memory.md` with the hardening tranche and validation outcome
