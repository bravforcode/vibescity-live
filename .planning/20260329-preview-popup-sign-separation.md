# Preview Popup Sign Separation

## Goal

- แยกระยะของ `preview popup` ออกจาก `detail modal` ให้ชัดเจน
- ยก `preview popup` ให้สูงขึ้นจาก `NeonPinSign` โดยไม่ทำให้ spacing ของ `VibeModal` regress

## Scope

- `src/components/map/MapLibreContainer.vue`

## Non-Goals

- ไม่เปลี่ยน layout ของ `VibeModal`
- ไม่แตะ flow เปิด detail หรือ store/data

## Validation

- `npx biome check src/components/map/MapLibreContainer.vue`
- `npm run build`
- Browser verification ของ preview popup + neon sign บน mobile viewport
