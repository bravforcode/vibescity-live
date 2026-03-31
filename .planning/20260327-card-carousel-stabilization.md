## Goal

Stabilize the mobile card carousel by fixing confirmed gesture bugs, cleaning dead code and duplicate CSS, and reworking the card layout so compact widths remain usable and accessible.

## Scope

- `src/components/ui/SwipeCard.vue`
- `src/components/feed/BottomFeed.vue`
- `src/composables/useScrollSync.js`

## Implementation Plan

1. Fix `SwipeCard` gesture conflicts:
   - prevent double-tap favorite from firing after drag gestures
   - ignore interactive descendants for card-level tap logic
   - tighten pull-to-expand a11y and touch-action handling
2. Rework compact card layout:
   - simplify info density
   - convert share CTA to icon-only secondary action
   - keep Ride as the primary full-width action
3. Update carousel shell:
   - remove dead imports/code
   - dedupe scoped CSS
   - move wrapper motion to a single inline source of truth
   - switch card widths to active `220px` / inactive `176px`
4. Harden scroll sync:
   - stop assuming equal-width cards
   - compute centered card from real DOM measurements

## Success Criteria

- No accidental favorite toggles after swipe / drag end
- Release pill renders above the card and is keyboard reachable only when visible
- Carousel cards are readable and tappable at compact widths
- Scroll centering still tracks the visually centered card after variable card widths
