# 2026-03-26 Map UI & Popup Refinement

## Goal

Refine the bottom map cards so they read clearly over the map and fix popup alignment so the popup tail sits on the true top-center of the venue pin.

## Approved Assumptions

- Primary bottom-feed card is `src/components/ui/SwipeCard.vue`.
- `src/components/panel/ShopCard.vue` should be kept visually aligned with the new solid-card language where practical.
- Popup alignment target is the true pin tip, not the optical center of the neon sign board.
- Worktree is dirty; edits must be narrow and avoid unrelated changes.

## Scope

- `src/components/ui/SwipeCard.vue`
- `src/components/panel/ShopCard.vue`
- `src/components/map/MapLibreContainer.vue`
- `src/composables/map/useNeonPinsLayer.js`
- `src/components/map/NeonPinSign.vue`
- `src/assets/css/map-markers.css`
- `docs/runbooks/agent-operating-memory.md`

## Implementation Plan

### 1. Card readability pass

- Remove glassy/translucent info surfaces from map-overlay cards.
- Use solid dark surfaces with stronger separation from map imagery.
- Tighten padding, vertical rhythm, chip density, and CTA sizing.
- Preserve minimum 44x44 hit targets and reduced-motion safety.

### 2. Card hierarchy pass

- Make title, category, distance, and timing fit in predictable rows.
- Reduce noisy blur/glow treatments that lower text contrast.
- Keep emphasis on venue title, then category/distance, then actions.

### 3. Popup contract cleanup

- Replace current popup lift heuristic, which targets label height, with pin-tip geometry.
- Keep a single source of truth for popup tip styling.
- Verify selected/live marker scaling does not shift the popup anchor visually.

### 4. Marker alignment audit

- Check the DOM neon pin overlay for bottom-center anchoring.
- Adjust popup lift first; only adjust pin transforms if the visual tip itself is off-axis.

### 5. Validation

- `npx biome check` on changed frontend files
- `bun run build`
- Browser verification on local app with full WebGL map

## Acceptance Criteria

- Bottom-feed cards are fully readable over bright and busy map tiles.
- Popup tip visually lands at the pin tip within a small tolerance on mobile and desktop.
- No duplicate/conflicting popup-tip CSS remains.
- No regression to feed gestures, marker clicks, or popup actions.
