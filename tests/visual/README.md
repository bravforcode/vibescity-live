# Visual Lane Ownership

The visual suite is intentionally split by product surface. Keep each spec narrow so snapshot churn stays attributable to one lane.

## Active Lanes

- `tests/visual/map-feed.spec.ts`
  - Owns current map/feed UI baselines only.
  - Covers feed-card polish, popup alignment, and map/feed responsive shells.
- `tests/visual/critical.spec.ts`
  - Owns the stabilized legacy critical lane only.
  - Covers the desktop shell, search header/results, venue detail sheet, and merchant boost modal.
- `tests/visual/dashboard.visual.spec.ts`
  - Owns owner and partner dashboard visuals only.
  - Covers dashboard hero/stat/form/panel surfaces.

## Lane Rules

- Do not move `critical.spec.ts` coverage back into `map-feed.spec.ts`.
- Do not add dashboard assertions to `critical.spec.ts` or `map-feed.spec.ts`.
- If a new visual surface has a materially different product area or setup contract, create a new spec instead of growing an existing lane.
- Keep snapshot updates scoped to the lane that actually changed.

## Validation

- `node scripts/run-playwright-cli.mjs test --config=playwright.visual.config.ts tests/visual/map-feed.spec.ts`
- `node scripts/run-playwright-cli.mjs test --config=playwright.visual.config.ts tests/visual/critical.spec.ts`
- `node scripts/run-playwright-cli.mjs test --config=playwright.visual.config.ts tests/visual/dashboard.visual.spec.ts`
