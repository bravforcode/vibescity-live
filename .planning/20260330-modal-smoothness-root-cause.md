# Modal Smoothness + Neon Sign Root Cause

## Goal

- หา root cause เชิงลึกของ modal/detail motion ที่เด้งและไม่ต่อเนื่อง
- ทำให้ selected neon sign อยู่ตำแหน่งต่ำลงและเสถียรใกล้เคียงภาพเป้าหมาย
- จูน mobile detail UI ให้ใกล้ภาพ reference แบบ screenshot-to-screenshot มากที่สุด
- แก้ `Ignored attempt to cancel a touchmove event with cancelable=false` โดยไม่ทำให้ gesture หลักพัง

## Scope

- `src/components/modal/VibeModal.vue`
- `src/components/ui/SwipeCard.vue`
- `src/components/map/MapLibreContainer.vue`
- `src/composables/map/useNeonPinsLayer.js`
- `src/composables/map/useMapPadding.js`
- `src/composables/map/useMapCore.js`
- `src/constants/mapSelectionLayout.js`
- `docs/runbooks/agent-operating-memory.md`

## Root-Cause Hypotheses

1. Detail camera target on mobile is pushed too high by `DETAIL_SELECTION_*` geometry.
2. Modal open/drag currently drives more than one motion system at once: modal spring, map padding ease, and neon sign sync loop.
3. `useMapPadding` is re-centering the map repeatedly while the modal height is still changing, which makes the sign and map feel jumpy.
4. MapLibre keeps receiving touch gestures while the detail modal is open, producing the `touchmove cancelable=false` intervention warnings.

## Validation

- `npx biome check <changed files>`
- `npm run build`
- Browser verification on mobile-sized routes for `Good day@bann silom`, `Shell Cafe`, `Sen Xing Fa Tea`, `Big C`, and `Dragon`
- Screenshot comparison on `Big C` and `7-Eleven` against the current mobile reference framing
