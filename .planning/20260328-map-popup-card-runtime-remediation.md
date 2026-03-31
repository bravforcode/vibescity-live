# 2026-03-28 Map Popup + Card Runtime Remediation

## Goal

Tighten the public map detail experience by:

- lifting the venue popup farther above the pin/sign
- ensuring popup and selected neon pin layers never cover the sidebar drawer
- making bottom-feed cards visually sharper with clearer text and cleaner media
- reducing first-load map runtime work so the home map feels faster on mobile

## Scope

- `src/components/map/MapLibreContainer.vue`
- `src/composables/map/useNeonPinsLayer.js`
- `src/constants/zIndex.js`
- `src/components/ui/SwipeCard.vue`
- `src/components/feed/BottomFeed.vue`
- `docs/runbooks/agent-operating-memory.md`

## Approved Assumptions

- The user wants the map popup preview card lifted higher without changing the modal route flow.
- Sidebar and filter/menu overlays must always stay above map-level popup and pin overlays.
- Card readability should prioritize image clarity and text contrast over glow, blur, and shadow styling.
- Performance work should stay additive and low-risk: defer non-critical visual effects instead of rewriting the map stack.

## Implementation Plan

### 1. Popup + layering

- Increase popup lift offsets for regular/live/promoted/giant pins.
- Normalize popup z-index so it stays above the map but below app drawers/sidebars.
- Lower the selected neon-pin overlay to the same rule unless the detail modal explicitly needs it above the modal.

### 2. Card clarity

- Remove card/drop shadows that muddy venue imagery.
- Reduce decorative glow/gradient layers that wash out the image.
- Add a crisper dark info surface and remove blurry text treatments.

### 3. Startup runtime

- Delay non-critical map heavy effects farther past initial ready.
- Avoid starting the heavy effects pipeline until the map is settled and/or the user has interacted.
- Keep fallback rendering intact for localhost/frontend-only map lanes.

### 4. Validation

- `npx biome check src/components/map/MapLibreContainer.vue src/composables/map/useNeonPinsLayer.js src/constants/zIndex.js src/components/ui/SwipeCard.vue src/components/feed/BottomFeed.vue docs/runbooks/agent-operating-memory.md`
- `npm run build`
- `node scripts/performance/profile-home-runtime.mjs --url http://127.0.0.1:5173/ --output-dir reports/performance/post-map-modal-card --device mobile-chrome`

## Baseline Notes

- Baseline profile: `reports/performance/baseline-map-modal-card/home-runtime-profile-20260328-131638.json`
- Observed before edits:
  - `longTaskSummary.count = 12`
  - `longTaskSummary.maxDuration = 192`
  - notable post-ready work still lands in `home_ready` and `carousel_scroll_complete`
