# 2026-03-26 Legacy Critical Visual Suite Stabilization

## Goal

Stabilize `tests/visual/critical.spec.ts` as its own legacy visual-debt lane so snapshot cleanup for the older suite never gets mixed back into the newer map/feed regression coverage in `tests/visual/map-feed.spec.ts`.

## Why This Is Separate

- `tests/visual/map-feed.spec.ts` now owns the current map/feed UI baseline.
- `tests/visual/critical.spec.ts` still carries older snapshot debt and conditional behavior.
- Mixing them hides root causes and makes snapshot reviews noisy.

## Scope

- `tests/visual/critical.spec.ts`
- `tests/visual/critical.spec.ts-snapshots/*`
- Any narrowly-scoped helper or test fixture needed only to stabilize the legacy suite
- `docs/runbooks/agent-operating-memory.md`

## Explicit Non-Goals

- Do not modify `tests/visual/map-feed.spec.ts`
- Do not update `tests/visual/map-feed.spec.ts-snapshots/*`
- Do not re-open the completed map popup alignment or map/feed card polish lane under this work item
- Do not hide product regressions behind broad screenshot masking

## Legacy Suite Inventory

1. `@visual Home: map + sheet`
2. `@visual Search: header + results`
3. `@visual Venue detail sheet`
4. `@visual Buy pin panel`

## Likely Flake Sources To Audit

### 1. Home: map + sheet

- Map renderer timing and tile settle variance
- Feed content changing underneath the screenshot
- Consent / visitor bootstrap timing

### 2. Search: header + results

- Search result timing after input
- Locale-dependent text width
- Header state changing while async results settle

### 3. Venue detail sheet

- Reliance on the first visible card and first matching detail button
- Modal media / live content variability
- Bottom-sheet animation timing

### 4. Buy pin panel

- Merchant-route gating and visitor identity dependence
- Environment-specific visibility causing conditional skip behavior
- Missing or outdated baseline ownership

## Stabilization Strategy

### Phase 1. Baseline audit

- Run `tests/visual/critical.spec.ts` alone with traces and no snapshot updates
- Record which cases are deterministic failures versus real UI changes
- Confirm whether `Buy pin panel` should remain visual coverage or move to a more focused spec

### Phase 2. Determinism hardening

- Normalize selectors to stable `data-testid` anchors where needed
- Freeze or mask only genuinely noisy dynamic regions
- Replace first-match behavior with explicit target selection where possible
- Keep state setup local to each test

### Phase 3. Snapshot ownership cleanup

- Keep each legacy baseline tied to a single test and a single intent
- If one test covers a materially different surface, split it into its own spec instead of growing `critical.spec.ts`
- Update baselines only after clean replay confirms deterministic behavior

### Phase 4. Verification

- Replay the full legacy suite at least twice without snapshot updates
- Verify `map-feed.spec.ts` still passes unchanged
- Keep the suite split visible in session memory and handoff docs

## Validation Commands

- `node scripts/run-playwright-cli.mjs test --config=playwright.visual.config.ts tests/visual/critical.spec.ts`
- `node scripts/run-playwright-cli.mjs test --config=playwright.visual.config.ts tests/visual/critical.spec.ts --trace on`
- `node scripts/run-playwright-cli.mjs test --config=playwright.visual.config.ts tests/visual/map-feed.spec.ts`
- `npx biome check tests/visual/critical.spec.ts <any helper files changed>`

## Acceptance Criteria

- `tests/visual/critical.spec.ts` has a clear ownership boundary separate from `map-feed.spec.ts`
- Legacy visual failures can be investigated without touching the map/feed baselines
- Snapshot updates in the legacy suite are intentional and reviewable
- The suite can replay cleanly without depending on unrelated map/feed changes
