# Translation Review and Screenshot QA

## Objective

Close the final pre-release gap between semantic copy cleanup and wider rollout by giving product reviewers a deterministic review pack for English and Thai on staging.

This phase focuses on:

- product wording review on rollout-critical surfaces
- screenshot QA across `th` and `en`
- stable owner and partner dashboard captures with API stubs
- locale-sensitive formatting parity for money and dates

## Review Scope

The review pack covers the surfaces that still carry the most rollout risk for wording consistency:

1. Public legal pages
   - `/th/privacy`
   - `/en/privacy`
   - `/th/terms`
   - `/en/terms`
2. Owner dashboard
   - `/th/merchant`
   - `/en/merchant`
   - promote modal with `BuyPinsPanel`
   - promotion branding panel
3. Partner dashboard
   - `/th/partner`
   - `/en/partner`
   - subscription panel
   - profile and payout forms

## Non-Goals

- live payment checkout verification
- translation changes for non-critical legacy surfaces
- screenshot QA for highly dynamic map tiles as a source of truth
- production release approval

## Deterministic QA Strategy

### Public pages

- Run against staging or local preview without API stubbing.
- Capture full-page screenshots for direct copy comparison.

### Owner dashboard

- Seed a stable visitor identity in local storage.
- Stub owner dashboard API responses.
- Open the promote modal using a stable test id.
- Stub promotion status to return the same logo, cover, slot, and entitlement state in both locales.

### Partner dashboard

- Seed a stable partner auth session in local storage.
- Stub feature flags plus partner dashboard/status endpoints.
- Capture the same panels in both locales.
- Use locale-aware money and date formatting so English and Thai screenshots are semantically correct.

## Screenshot Matrix

### Desktop

- `privacy-[locale]-desktop`
- `terms-[locale]-desktop`
- `owner-hero-[locale]-desktop`
- `owner-venues-[locale]-desktop`
- `owner-promote-modal-[locale]-desktop`
- `partner-subscription-[locale]-desktop`
- `partner-forms-[locale]-desktop`

### Mobile

- `owner-promote-modal-[locale]-mobile`
- `partner-subscription-[locale]-mobile`

## Reviewer Checklist

Use this list during the product review on staging.

1. Terminology stays consistent between EN and TH for the same feature.
2. English copy does not leak Thai date, number, or money formatting.
3. Thai copy does not show raw English enum/status fallback text.
4. Buttons, badges, alerts, and form labels fit without truncation.
5. Modal headings, payment copy, and entitlement labels remain aligned in both locales.
6. No raw locale keys such as `auto.k_*` or missing-key artifacts appear in the UI.
7. Mobile layouts preserve hierarchy and do not wrap critical CTA labels awkwardly.

## Run Commands

### Local preview

```bash
npm run test:visual:i18n
```

### Staging

```bash
cross-env PW_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=<staging-base-url> npm run test:visual:i18n
```

Use the actual staging host for the current environment. The repo currently references `https://staging.vibecity.live` in utility tooling, but DNS and routing should be verified before the review session.

## Artifacts

- Playwright HTML report: `playwright-report/index.html`
- Raw screenshots and traces: `test-results/visual/`
- Baseline snapshots: `tests/visual/translation-review.visual.spec.ts-snapshots/`

## Pass Criteria

- The translation screenshot suite passes on desktop and mobile.
- Reviewer checklist has no critical wording or truncation issues.
- English and Thai screenshots show locale-correct formatting for money and dates.
- Owner promotion flow and partner dashboard remain deterministic under staging API conditions.

## Rollout Handoff

After this pack is green and reviewed:

1. Share screenshot artifacts with product reviewers.
2. Record any final wording decisions in locale files.
3. Re-run `bun run check`, `bun run build`, and `python .agent/scripts/checklist.py .`.
4. Only then move from pre-release rollout to wider rollout.
