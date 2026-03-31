# Sign Gap + Pull Motion Tune

## Goal

- เพิ่มระยะห่างระหว่าง selected neon sign กับ detail sheet ไม่ให้ชนกัน
- เพิ่มแรงต้านและ feedback ของ pull motion ตอนดึง card ขึ้นและดึง modal ลง

## Scope

- `src/components/map/MapLibreContainer.vue`
- `src/components/modal/VibeModal.vue`
- `src/components/ui/SwipeCard.vue`

## Non-Goals

- ไม่เปลี่ยน data flow, routing, หรือ selection intent logic
- ไม่ขยับ `NeonPinSign.vue` โดยตรง ถ้ายังแก้ได้จาก camera/spacing budget

## Validation

- `npx biome check src/components/map/MapLibreContainer.vue src/components/modal/VibeModal.vue src/components/ui/SwipeCard.vue docs/runbooks/agent-operating-memory.md`
- `npm run build`
