# Home Map Smoothness + Popup/Card Remediation

## Goal

- Remove scroll jank from the home carousel path.
- Make venue cards use venue imagery as the primary surface.
- Keep map popups above the venue pin/sign instead of covering it.
- Silence optional realtime/performance warnings in normal local flows.

## Workstreams

1. Runtime noise hardening in `socketService`, `usePerformance`, and bottom-feed debug logging.
2. Cached-metrics scroll sync refactor in `useScrollSync`.
3. Unified detail-open flow in `useAppLogic` to reduce duplicate work.
4. Full-bleed image card treatment in `SwipeCard`.
5. Popup lift + autopan alignment in `MapLibreContainer`.
6. Regression coverage in unit + Playwright suites.

## Validation

- `bun run check`
- `bun run build`
- `bun run test:unit`
- `bun run test:e2e:smoke-map-lite`
- `bun run test:e2e:map-preflight`
