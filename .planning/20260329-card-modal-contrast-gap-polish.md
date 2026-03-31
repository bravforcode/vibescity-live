# Card Contrast, Modal Backdrop, And Pin Gap Polish

## Goal

- เอา dark glass ออกจาก card carousel และทำตัวหนังสือบนการ์ดให้เป็นโทนดำอ่านง่าย
- คืนพื้นหลังดำให้ `VibeModal` ทั้ง backdrop และ surface เพื่อไม่ให้ดูโปร่งใส
- เพิ่มระยะห่างระหว่างหมุดร้านค้ากับ detail modal บน mobile โดยไม่กระทบ preview popup

## Scope

- `src/components/ui/SwipeCard.vue`
- `src/components/modal/VibeModal.vue`
- `src/components/map/MapLibreContainer.vue`

## Validation

- `npx biome check src/components/ui/SwipeCard.vue src/components/modal/VibeModal.vue src/components/map/MapLibreContainer.vue`
- `npm run build`
- Browser verification of mobile detail modal spacing if local dev server is available
