---
phase: 02-anonymous-identity-claim-flow
plan: "01"
subsystem: consent-gate
tags: [pdpa, gdpr, consent, anonymous-identity, gamification]
dependency_graph:
  requires: []
  provides: [pdpa_consent_ts, vibecity:consent-event, ConsentBanner-component, hasConsent-ref]
  affects: [src/views/HomeView.vue, src/components/ui/ConsentBanner.vue]
tech_stack:
  added: []
  patterns: [localStorage-consent-gate, CustomEvent-signal, vue-i18n-t()]
key_files:
  created:
    - src/components/ui/ConsentBanner.vue
  modified:
    - src/views/HomeView.vue
    - src/locales/en.json
    - src/locales/th.json
decisions:
  - "Sync import for ConsentBanner (not async) — must render before any claim interaction, no lazy-load delay acceptable"
  - "hasConsent initialized from localStorage at component mount — returning visitors never see banner"
  - "No Supabase anonymous auth — codebase uses plain localStorage UUID via gamificationService (Plan 03)"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-22"
  tasks_completed: 2
  files_created: 1
  files_modified: 3
---

# Phase 2 Plan 01: PDPA Consent Banner + Claim Gate Summary

**One-liner:** PDPA consent banner with localStorage gate (pdpa_consent_ts) wiring vibecity:consent event, blocking claim flow until consent granted.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create ConsentBanner.vue component (COMP-01) | a93f5a2 | ConsentBanner.vue, en.json, th.json |
| 2 | Wire consent gate into HomeView (IDENT-01, IDENT-02) | 714cdea | HomeView.vue |

## What Was Built

### ConsentBanner.vue (152 lines)

- Fixed-bottom overlay at z-index 950 (above VibeActionSheet at 900)
- Dark glass-morphism: `rgba(10,10,20,0.95)` + `backdrop-filter: blur(12px)`
- On accept: writes `pdpa_consent_ts` ISO timestamp to localStorage, dispatches `vibecity:consent` CustomEvent (hooks into main.js line 74 Clarity gate), emits `accepted` to parent
- Self-hiding: `showBanner` ref initialized from `!localStorage.getItem("pdpa_consent_ts")`
- Slide-up transition disabled under `@media (prefers-reduced-motion: reduce)`
- Accept button: `min-height: 44px`, full-width, `#00c853` green (touch target compliant)
- All strings via `t()` from vue-i18n

### HomeView.vue (consent gate)

- Sync import of `ConsentBanner` (not async — must render without delay)
- `hasConsent` ref initialized from `!!localStorage.getItem("pdpa_consent_ts")` — returning visitors skip banner
- `onConsentGranted()` handler sets `hasConsent.value = true`
- `<ConsentBanner v-if="!hasConsent" @accepted="onConsentGranted" />` mounted after VibeActionSheet
- `handleClaimVibe` now early-returns if `!hasConsent.value` — no session data written before consent

### i18n Keys Added

Both `en.json` and `th.json` received `"consent"` namespace:
- `consent.message` — privacy notice
- `consent.accept` — button label
- `consent.learn_more` — privacy policy link

## Verification Results

- `bun run check`: 1 warning (pre-existing, unrelated)
- `bun run build`: SUCCESS — 3065.5 kB total, no errors
- `localStorage.setItem("pdpa_consent_ts"`: present in ConsentBanner.vue line 16
- `vibecity:consent` dispatch: present in ConsentBanner.vue line 20
- `ConsentBanner` import: present in HomeView.vue line 18 (sync)
- `hasConsent` ref: present in HomeView.vue line 321
- `pdpa_consent_ts`: present in HomeView.vue line 321
- No `gamificationService` or `signInAnonymously` calls before consent: confirmed (0 matches)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/components/ui/ConsentBanner.vue` — FOUND (152 lines, > 40 line minimum)
- [x] `src/views/HomeView.vue` contains `pdpa_consent_ts` — FOUND
- [x] `src/views/HomeView.vue` contains `ConsentBanner` import — FOUND
- [x] `src/views/HomeView.vue` contains `hasConsent` — FOUND
- [x] Commit a93f5a2 — FOUND
- [x] Commit 714cdea — FOUND
- [x] en.json `consent` namespace — FOUND
- [x] th.json `consent` namespace — FOUND

## Self-Check: PASSED
