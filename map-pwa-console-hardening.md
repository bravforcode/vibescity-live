# Map And PWA Console Hardening

## Goal

Reduce non-actionable debug console noise in the map container and PWA/map utilities without hiding real errors.

## Scope

- `src/components/map/MapboxContainer.vue`
- `src/utils/pwa/serviceWorkerManager.js`
- `src/utils/osmRoads.js`
- `src/utils/neonSignDebug.js`

## Approach

- Keep true failures as `console.error`
- Move success logs and capability/no-op warnings behind explicit debug gates
- Preserve existing debugging workflows with opt-in flags instead of broad removal
- Re-run lint, unit tests, and checklist after edits

## Success Criteria

- Normal runtime is quieter by default
- Map/PWA diagnostics remain available when explicitly enabled
- `bun run lint` passes
- `bun run test:unit --run` passes
- `python .agent/scripts/checklist.py .` passes
