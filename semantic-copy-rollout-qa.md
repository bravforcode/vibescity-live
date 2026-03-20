# Semantic Copy Rollout QA

## Goal

Finalize semantic copy consistency and translation QA for rollout-critical product surfaces before widening rollout.

## Scope

- `src/components/dashboard/BuyPinsPanel.vue`
- `src/components/dashboard/OwnerDashboard.vue`
- `src/components/ui/BottomNav.vue`
- `src/services/ownerService.js`
- `src/services/paymentService.js`
- `src/locales/en.json`
- `src/locales/th.json`

## Audit Focus

- Replace remaining hardcoded user-facing copy on rollout surfaces
- Standardize product wording between English and Thai
- Prefer semantic locale keys over opaque/generated keys for owner/promote flows
- Normalize CTA labels, statuses, field labels, notices, and validation copy

## Wording Decisions

- EN product noun: `promotion`
- TH product noun: `โปรโมต`
- EN surface noun: `map`
- TH surface noun: `แผนที่`
- EN business asset wording: `logo`, `cover image`, `branding`
- TH business asset wording: `โลโก้`, `ภาพร้าน`, `แบรนด์`
- EN payment wording: `bank transfer`, `international transfer`
- TH payment wording: `โอนเงินผ่านธนาคาร`, `โอนเงินระหว่างประเทศ`
- EN status casing: sentence/title case, not all caps unless visual emphasis is required
- TH statuses: natural Thai, avoid transliterated English where a clear Thai term exists

## Success Criteria

- Rollout-critical owner/promote UI has no hardcoded English user-facing copy
- English and Thai use the same product terms for the same concept
- Owner dashboard and promote checkout read like one product, not mixed legacy flows
- Validation passes with `bun run check`, `bun run build`, and `python .agent/scripts/checklist.py .`
