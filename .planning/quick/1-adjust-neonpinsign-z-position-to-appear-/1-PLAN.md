---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/map/useNeonPinsLayer.js
autonomous: true
must_haves:
  truths:
    - "When VibeModal is open, the selected neon pin sign appears visually above the modal, not overlapping it"
    - "When VibeModal is closed, neon pin positioning is unchanged from current behavior"
  artifacts:
    - path: "src/composables/map/useNeonPinsLayer.js"
      provides: "Y-clamped positionPin for selected overlay when modal is open"
      contains: "vibe-modal-surface"
  key_links:
    - from: "src/composables/map/useNeonPinsLayer.js"
      to: "VibeModal [data-testid='vibe-modal-surface']"
      via: "getBoundingClientRect in positionPin"
      pattern: "vibe-modal-surface.*getBoundingClientRect"
---

<objective>
Clamp the Y position of the selected NeonPinSign so it always appears above the VibeModal when the modal is open, preventing visual overlap.

Purpose: The selected venue's neon sign currently renders at the map pin's projected screen position, which can fall behind or overlap the bottom-sheet modal. Clamping the Y coordinate keeps the sign visible and contextually connected to the modal content.
Output: Modified `positionPin` function in useNeonPinsLayer.js
</objective>

<execution_context>
@C:/Users/menum/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/menum/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/composables/map/useNeonPinsLayer.js
@src/components/modal/VibeModal.vue (for modal testid reference only)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clamp selected neon pin Y above VibeModal surface</name>
  <files>src/composables/map/useNeonPinsLayer.js</files>
  <action>
In the `positionPin(id, shop)` function (around line 218), add Y-clamping logic for the selected overlay when the detail modal is open.

Current code (lines 218-236):
```js
const positionPin = (id, shop) => {
    const entry = pinInstances.get(id);
    if (!entry) return;
    const pt = project(shop);
    if (!pt) return;
    const isSelectedOverlay = entry.overlayType === "selected";
    const containerRect = containerRef.value?.getBoundingClientRect?.();
    const el = entry.el;
    const w = el.offsetWidth || 0;
    const h = el.offsetHeight || 0;
    const x = (isSelectedOverlay ? (containerRect?.left ?? 0) : 0) + pt.x - w / 2;
    const y = (isSelectedOverlay ? (containerRect?.top ?? 0) : 0) + pt.y - h;
    const focusId = resolveFocusedId();
    el.style.zIndex = String(id) === focusId ? "30" : "1";
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
};
```

After computing `y` on line 232, add a clamping block:

```js
let finalY = y;
if (isSelectedOverlay && hasDetailModalOpen()) {
    const modalSurface = document.querySelector("[data-testid='vibe-modal-surface']");
    if (modalSurface) {
        const modalTop = modalSurface.getBoundingClientRect().top;
        const GAP = 16; // px gap between sign bottom and modal top
        const maxY = modalTop - GAP - h; // sign is anchored at top-left after -h offset, so bottom = y + h
        // Actually, y already has -h applied (line 232: pt.y - h), so the sign renders from y to y+h.
        // We need y + h <= modalTop - GAP, i.e. y <= modalTop - GAP - h... but h is already subtracted.
        // Wait — re-read: y = containerRect.top + pt.y - h. The sign's TOP edge is at y, bottom edge at y + h.
        // Clamp so sign bottom (y + h) is above modal top with gap: y + h <= modalTop - GAP → y <= modalTop - GAP - h
        // But we also want a minimum y so the sign doesn't go off-screen top: clamp y >= 8
        const clampedY = Math.max(8, modalTop - GAP - h);
        if (finalY > clampedY) {
            finalY = clampedY;
        }
    }
}
```

Then update the transform line to use `finalY`:
```js
el.style.transform = `translate3d(${x}px, ${finalY}px, 0)`;
```

IMPORTANT CLARIFICATION on the math:
- `y` is computed as `(containerRect?.top ?? 0) + pt.y - h` — this is the TOP edge of the sign element.
- The sign's BOTTOM edge is at `y + h`.
- We need: `y + h <= modalTop - GAP`, so `y <= modalTop - GAP - h`.
- But since `y` already has `-h` baked in from the original line, the sign visually spans from `y` (top) to `y + h` (bottom).
- So the clamp is: `finalY = Math.min(finalY, modalTop - GAP - h)` with a floor of 8px from viewport top.

Simplified final implementation to insert after line 232 (`const y = ...`):

```js
let finalY = y;
if (isSelectedOverlay && hasDetailModalOpen()) {
    const modalSurface = document.querySelector("[data-testid='vibe-modal-surface']");
    if (modalSurface) {
        const modalTop = modalSurface.getBoundingClientRect().top;
        const gap = 16;
        // Sign top edge = finalY, bottom edge = finalY + h
        // Ensure bottom edge is above modal: finalY + h <= modalTop - gap
        const maxY = modalTop - gap - h;
        if (finalY > maxY) finalY = Math.max(8, maxY);
    }
}
```

Then change the final transform line from:
```js
el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
```
to:
```js
el.style.transform = `translate3d(${x}px, ${finalY}px, 0)`;
```

No other files need changes. The `hasDetailModalOpen()` helper already exists at line 41. The `syncPins()` is already re-called when the modal opens/closes via the MutationObserver (line 158-163), so the clamping will activate/deactivate reactively.
  </action>
  <verify>
1. `bun run check` passes (no lint/i18n violations introduced)
2. `bun run build` succeeds
3. Manual verification: Open the app, tap a venue pin to open VibeModal. The selected neon sign should appear above the modal with a visible gap, never overlapping the modal surface.
4. Close the modal — the neon sign should return to its natural map-projected position.
  </verify>
  <done>
When VibeModal is open, the selected venue's NeonPinSign is clamped so its bottom edge sits at least 16px above the modal surface's top edge. When the modal is closed, positioning behaves identically to before this change.
  </done>
</task>

</tasks>

<verification>
- `bun run check` — no new lint or i18n violations
- `bun run build` — successful production build
- Visual: open VibeModal for a venue whose pin is in the lower half of the screen; neon sign should float above the modal, not behind it
- Visual: close modal; neon sign should be at its normal map position
- Visual: open modal for a venue whose pin is already in the upper half; sign should remain at its natural position (clamp is a no-op)
</verification>

<success_criteria>
- Selected neon pin sign never overlaps the VibeModal surface
- 16px visual gap maintained between sign bottom and modal top
- Sign does not go above viewport top (8px floor)
- No behavior change when modal is closed
- Build and lint pass cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/1-adjust-neonpinsign-z-position-to-appear-/1-SUMMARY.md`
</output>
