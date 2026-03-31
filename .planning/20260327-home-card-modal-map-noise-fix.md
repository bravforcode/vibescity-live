# 2026-03-27 Home Card Modal + Map Noise Fix

## Goal

- Stop the home carousel from auto-reopening the detail modal after the user closes it.
- Preserve manual pull-up detail open on the active card.
- Remove redundant card UI noise (`Live Now` pill, inline mute toggle) and improve card text legibility.
- Reduce MapLibre console noise tied to duplicate WebGL listeners and transient missing pin-image warnings.

## Findings

1. `closeDetailSheet()` clears `activeShopId`, which makes the carousel fall back to the first card as "active" and reflows card widths.
2. The width reflow changes the centered-card calculation and can trigger the centered-card auto-open path again.
3. `SwipeCard.vue` still renders a secondary `Live Now` pill inside the dark info panel and a local video mute toggle that bypasses settings-based sound control.
4. `SwipeCard.vue` clamps the venue title to one line, which truncates long names too aggressively on narrow cards.
5. `MapLibreContainer.vue` adds a second pair of `webglcontextlost/restored` listeners on top of the ones already owned by `useMapCore.js`.
6. Map pin sprite warnings are partially benign race noise during style transitions and need tighter filtering / recovery handling.

## Planned Changes

- Keep carousel selection stable when closing the detail modal.
- Add a short close-to-reopen cooldown for centered-card auto-open only.
- Remove inline mute UI from `SwipeCard.vue`.
- Remove the dark-panel `Live Now` pill from `SwipeCard.vue`.
- Relax title truncation and small-card layout constraints for readability.
- Remove duplicate WebGL canvas listeners from `MapLibreContainer.vue`.
- Extend MapLibre warning suppression only for known transient pin-image races that recover automatically.
- Add/adjust Playwright coverage for modal close + manual reopen behavior.

## Validation

- `npx biome check src/composables/useAppLogic.js src/components/ui/SwipeCard.vue src/components/map/MapLibreContainer.vue src/composables/map/useMapCore.js tests/e2e/home_carousel_contract.spec.ts`
- `bun run build`
- Targeted Playwright run for the updated carousel contract
