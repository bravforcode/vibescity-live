# Auto Open Detail And Neon Gap

## Goal

- เปิด `VibeModal` อัตโนมัติหลัง preview popup/flight settle แล้วจริง
- จำกัดการ auto-open ให้เกิดแค่ 1 ครั้งต่อร้านต่อแท็บ
- เพิ่มระยะห่างระหว่าง `NeonPinSign` กับ `VibeModal` ใน detail state เล็กน้อย

## Scope

- `src/composables/useAppLogic.js`
- `src/components/map/MapLibreContainer.vue`
- `tests/unit/composables/useAppLogic.autoOpen.spec.js`

## Non-Goals

- ไม่เปลี่ยน data/store flow ของร้าน
- ไม่เปลี่ยน marker hierarchy หรือ animation อื่นนอก detail handoff

## Validation

- `npx biome check src/composables/useAppLogic.js src/components/map/MapLibreContainer.vue tests/unit/composables/useAppLogic.autoOpen.spec.js`
- `npx vitest run tests/unit/composables/useAppLogic.autoOpen.spec.js`
