---
phase: 01-neon-map-redesign-performance
plan: "04"
subsystem: ui
tags: [vue, overlay, marquee, bottom-sheet, i18n, css, interaction]

# Dependency graph
requires:
  - "01-01"
  - "01-02"
  - "01-03"
provides:
  - VibeBanner.vue CSS-only marquee banner
  - VibeActionSheet.vue bottom action sheet overlay
  - HomeView wiring to selectedShop state and action handlers
  - i18n keys for claim/navigate CTA labels in both locales
affects:
  - Future gamification/claim flow (hook point ready via handleClaimVibe)
  - Future navigation UX tuning (hook point ready via handleNavigate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Marquee animation is pure CSS keyframes (no JS timers/RAF)"
    - "Overlay UI uses fixed/absolute layering with explicit z-index and backdrop click-to-close"
    - "CTA labels are passed via props from i18n t() calls (no hardcoded locale strings in template wiring)"

key-files:
  created:
    - src/components/ui/VibeBanner.vue
    - src/components/ui/VibeActionSheet.vue
  modified:
    - src/views/HomeView.vue
    - src/i18n.js

key-decisions:
  - "VibeBanner rendered in desktop map wrapper and portrait mobile map wrapper to keep reference chrome consistent across layouts"
  - "Action sheet visibility tied to existing selectedShop state to avoid introducing redundant UI state"
  - "Action sheet dismiss behavior supports backdrop tap and close button tap for predictable mobile UX"

patterns-established:
  - "Top chrome marquee + bottom CTA sheet are self-contained overlays and do not depend on map API calls"
  - "Interactive overlay button labels should flow from i18n keys via props"

# Metrics
duration: 12min
completed: 2026-03-21
---

# Phase 01 Plan 04: Vibe Banner + Action Sheet Summary

**Top marquee banner and bottom action sheet overlays are now wired in HomeView, with i18n-driven CTA labels and CSS-only motion.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-03-21
- **Tasks:** 2
- **Files created/modified:** 4

## Accomplishments

- Confirmed `VibeBanner.vue` exists and uses pure CSS marquee (`@keyframes vibe-marquee`, `translateX`) with `prefers-reduced-motion` guard.
- Confirmed `VibeActionSheet.vue` exists with:
  - `shop`, `visible`, `claimLabel`, `navigateLabel` props
  - `claim`, `navigate`, `close` emits
  - backdrop tap close and close-button dismiss behavior
- Confirmed `HomeView.vue` imports and mounts both overlay components:
  - `<VibeBanner :text="t('gamification.vibe_of_hour')"/>`
  - `<VibeActionSheet ... :claimLabel="t('gamification.claim_vibe')" :navigateLabel="t('gamification.take_me_there')" ... />`
- Confirmed `src/i18n.js` contains both locale keys:
  - `gamification.claim_vibe`
  - `gamification.take_me_there`
- Confirmed `handleClaimVibe` and `handleNavigate` handlers are wired from HomeView action sheet events.

## Verification

- `rg -n "vibe-marquee|translateX\\(" src/components/ui/VibeBanner.vue` -> found marquee animation
- `rg -n "setInterval|requestAnimationFrame|setTimeout" src/components/ui/VibeBanner.vue` -> no matches
- `rg -n "claimLabel|navigateLabel" src/components/ui/VibeActionSheet.vue` -> props and usage found
- `rg -n "VibeBanner|VibeActionSheet" src/views/HomeView.vue` -> wiring found
- `bun run build` -> passed

## Deviations from Plan

- No structural deviations. Plan targets were already implemented in codebase; this pass validated and finalized artifacts/documentation.

## Issues Encountered

- None blocking.

## Next Phase Readiness

- Plan 04 criteria are satisfied.
- Overlay chrome and CTA wiring are ready for follow-up polish or deeper UX instrumentation.

---
*Phase: 01-neon-map-redesign-performance*
*Completed: 2026-03-21*
