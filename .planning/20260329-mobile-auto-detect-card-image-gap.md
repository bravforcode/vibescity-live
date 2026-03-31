# Mobile Auto Detect, Card Image, And Detail Gap

## Goal

- ให้ auto-detect บนมือถือเปิด `VibeModal` ได้อีกครั้งหลัง preview popup settle
- เอา white surface ใหญ่ใน `SwipeCard` ออกเพื่อเห็นรูปในการ์ดเต็มขึ้น พร้อมคงข้อความเป็นโทนดำ
- เพิ่มระยะห่างระหว่าง detail modal กับ pin บน mobile มากกว่าค่า polish รอบก่อน

## Scope

- `src/composables/useAppLogic.js`
- `tests/unit/composables/useAppLogic.autoOpen.spec.js`
- `src/components/ui/SwipeCard.vue`
- `src/components/map/MapLibreContainer.vue`

## Validation

- `npx biome check src/composables/useAppLogic.js tests/unit/composables/useAppLogic.autoOpen.spec.js src/components/ui/SwipeCard.vue src/components/map/MapLibreContainer.vue`
- `npx vitest run tests/unit/composables/useAppLogic.autoOpen.spec.js`
- `npm run build`
- Browser verification on mobile viewport against the local dev server
