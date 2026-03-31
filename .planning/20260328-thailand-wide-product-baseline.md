# Thailand-Wide Product Baseline

## Goal

Remove Chiang Mai-only assumptions from runtime product surfaces so VibeCity behaves as a Thailand-wide product without breaking production behavior.

## In Scope

- Public SEO and PWA metadata
- Route and page titles/descriptions
- Default runtime location and map center
- Localhost/dev nationwide baseline consistency
- Runtime UI copy that explicitly says Chiang Mai when it should be Thailand-wide
- Safety/emergency fallback behavior that is currently Chiang Mai-only and misleading

## Out Of Scope

- Payment, auth, RLS, schema, or migrations
- Seed/demo SQL content unless needed for runtime behavior
- Historical planning docs, test fixtures, and audit artifacts
- Rebuilding a true nationwide roads dataset in this pass

## Planned Changes

1. Centralize default market copy and metadata into a shared config.
2. Replace Chiang Mai-only SEO/title/description defaults with Thailand-wide wording.
3. Change default map/location fallback from Chiang Mai city center to a Thailand-wide reference point.
4. Remove misleading Chiang Mai-only fallback labels in UI/runtime services.
5. Prevent SafetyPanel from showing fake “nearby” Chiang Mai emergency locations outside Chiang Mai.
6. Keep localhost/dev nationwide sample behavior aligned with the Thailand-wide baseline.

## Validation

- `npx biome check <changed files>`
- `npm run build`
- Headless Playwright verification on `http://localhost:5173/en` and `http://localhost:4174/en`
