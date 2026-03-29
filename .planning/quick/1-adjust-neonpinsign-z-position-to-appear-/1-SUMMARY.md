---
quick_task: 1
description: Adjust NeonPinSign Y-position to appear above VibeModal
status: complete
date: 2026-03-29
---

## Summary

Modified `positionPin()` in `src/composables/map/useNeonPinsLayer.js` to clamp the selected neon sign's Y position above the VibeModal surface when the detail modal is open.

## Change

**File:** `src/composables/map/useNeonPinsLayer.js`

Added Y-clamping block after Y calculation in `positionPin()`:
- Queries `[data-testid='vibe-modal-surface']` when modal is open
- Computes `maxY = modalTop - 16 - h` (16px gap, sign bottom edge above modal top)
- Clamps `finalY` with an 8px viewport-top floor
- Uses `finalY` in the `translate3d` transform instead of raw `y`

The existing `MutationObserver` (line 158-163) already re-calls `syncPins()` on modal open/close, so the clamp activates and deactivates reactively with no additional wiring.

## Validation

- ✅ `bun run check`: 0 violations (biome + i18n)
- ✅ `bun run build`: success — 1075 kB gzipped, 10120 pages prerendered
