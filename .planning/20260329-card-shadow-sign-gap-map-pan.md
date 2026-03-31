# Card Shadow, Sign Gap, And Modal Map Pan

## Goal

- ลดเงา/overlay ของการ์ดให้ไม่กินรายละเอียดรูป และคงความอ่านง่ายของข้อความ
- เพิ่มระยะห่างระหว่าง `NeonPinSign` กับ `VibeModal` ตอนเปิด detail
- เพิ่มความสูง/การยกตัวของ selected neon pin ให้ชัดขึ้น
- เปิดให้ผู้ใช้ลากดูแมพบริเวณที่ยังมองเห็นได้แม้ `VibeModal` เปิดอยู่

## Scope

- `src/components/ui/SwipeCard.vue`
- `src/components/modal/VibeModal.vue`
- `src/components/map/NeonPinSign.vue`
- `src/composables/map/useNeonPinsLayer.js`
- `src/components/map/MapLibreContainer.vue`

## Non-Goals

- ไม่แตะ data/store/backend
- ไม่เปลี่ยน flow เปิด/ปิด modal หลัก นอกจาก pointer behavior ที่บังแมพ

## Validation

- `npx biome check <changed files>`
- `npm run build`
- Browser verification on mobile viewport with Playwright
