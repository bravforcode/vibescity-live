# Install Banner Removal + Neon Detail Modal Consistency

## Goal

- เอา `Install VibeCity` banner ออกจากเว็บทั้งหมด
- ทำให้ selected neon sign ตอนเปิด detail modal ไม่จมเข้าไปทับ sheet และแสดงผลสม่ำเสมอทุกร้าน

## Scope

- `src/components/system/AppModals.vue`
- `src/components/map/MapLibreContainer.vue`
- `src/composables/map/useNeonPinsLayer.js`
- `src/constants/mapSelectionLayout.js`

## Validation

- `npx biome check src/components/system/AppModals.vue src/components/map/MapLibreContainer.vue src/composables/map/useNeonPinsLayer.js src/constants/mapSelectionLayout.js docs/runbooks/agent-operating-memory.md`
- `npm run build`
