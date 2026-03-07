# Dashboard UI Unification Track (Owner + Partner)

## Objective
- Replace legacy scoped BEM classes (`.od-*`, `.pd-*`) in `OwnerDashboard.vue` and `PartnerDashboard.vue` with Tailwind inline utilities aligned to Promote Shop surfaces (`BuyPinsPanel.vue`, `MerchantRegister.vue`).
- Add deterministic visual regression and canary E2E matrix to de-risk 100% rollout.

## Scope
- `src/components/dashboard/OwnerDashboard.vue`
- `src/views/PartnerDashboard.vue`
- `tests/visual/*` (new dashboard visual spec)
- `tests/e2e/owner_partner_revamp.spec.ts` (selector migration)
- `tests/e2e/*` (new canary matrix spec)

## Implementation Phases

### Phase 1 — Owner Dashboard UI Migration
- Rewrite template using Tailwind glass surfaces:
  - container: `bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl`
  - inner cards: `bg-black/30` and `bg-white/5` variants
  - background glows: `blur-[100px]` layered absolute elements
- Preserve all existing script logic and bindings.
- Remove full `<style scoped>` block.
- Add stable test hooks:
  - `data-testid="owner-dashboard-root"`
  - `data-testid="owner-source-badge"`
  - `data-testid` on key sections used in tests/screenshots.

### Phase 2 — Partner Dashboard UI Migration
- Rewrite template to Tailwind-only, preserving script behavior.
- Apply unified segment controls, cards, and form field styles based on `MerchantRegister.vue`.
- Keep partner-specific visual accent (emerald/cyan + blue glow).
- Remove full `<style scoped>` block.
- Add stable test hooks:
  - `data-testid="partner-dashboard-root"`
  - `data-testid="partner-tab-bar"`
  - section-level `data-testid` for stats/forms/orders.

### Phase 3 — Visual Regression Coverage
- Add dedicated dashboard visual spec with deterministic API stubs:
  - Owner dashboard (desktop + mobile)
  - Partner dashboard (when route is accessible and program enabled)
- Use `toHaveScreenshot` on targeted containers, not whole page where volatile.
- Disable animations and mask non-deterministic elements where needed.

### Phase 4 — E2E Canary Matrix
- Add pre-rollout canary matrix test cases:
  - Owner fallback mode still renders and source badge is visible.
  - Owner responsive layout (mobile/tablet/desktop) remains usable.
  - Partner route unauthorized/feature-disabled path handled safely.
  - Partner active flow checks payout/profile surfaces (run when accessible, otherwise skip with explicit reason).
- Replace brittle class selectors with `data-testid`.

### Phase 5 — Validation
- Run:
  - `bun run check`
  - targeted Playwright: owner/partner revamp + canary + dashboard visual specs
- CI gates:
  - `Dashboard Canary Promotion Gates / dashboard-canary-e2e`
  - `Dashboard Canary Promotion Gates / dashboard-visual-regression`
- Record:
  - pass/fail by suite
  - skipped conditions (feature flag/auth guard)
  - rollout confidence summary for 10% → 50% → 100%.

## Success Criteria
- No `.od-*` / `.pd-*` classes remain in templates or scoped styles.
- Dashboard visual style matches Promote Shop glassmorphism system.
- Existing business actions still work (refresh, filters, promote/edit, partner profile/payout/manual payment tabs).
- Visual regression baselines produced for owner/partner surfaces.
- Canary matrix tests are green (or intentionally skipped with explicit environment reason).
