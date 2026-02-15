# Map Gates

## Required lane

- Command: `npm run test:e2e:map-required`
- Enforces:
  - `PW_GREP=@map-required`
  - `E2E_MAP_REQUIRED=1`
  - Desktop Chromium only
- CI dependency:
  - `MAPBOX_PUBLIC_TOKEN` secret must be present

## Non-required lanes

- Smoke lane: `npm run test:e2e:smoke`
- Full lane: `npm run test:e2e`

Map tests can soft-skip in non-required lanes, but they must fail hard in `@map-required`.

## Quarantine policy

- `tests/e2e/quarantine-map-sla.json` is the source of truth for temporary quarantine.
- Core map flows should stay tagged `@map-required`.
- Do not move core map flows back to quarantine without an SLA entry.
