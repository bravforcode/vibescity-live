# Modal Motion Polish

## Goal

- ทำให้การเปิดปิด `modal` และ `drawer` ลื่นและสม่ำเสมอขึ้น
- เพิ่ม press feedback ให้ปุ่มเปิด/ปิดหลักโดยไม่เปลี่ยน logic เดิม

## Scope

- `src/components/system/AppModals.vue`
- `src/components/modal/VibeModal.vue`
- `src/components/modal/MallDrawer.vue`
- `src/components/modal/ProfileDrawer.vue`
- `src/components/ui/SidebarDrawer.vue`
- `src/components/ui/FilterMenu.vue`
- `src/components/ui/SafetyPanel.vue`

## Non-Goals

- ไม่แตะ logic map, data flow, geolocation, หรือ store behavior
- ไม่เปลี่ยน layout หรือ visual hierarchy หลัก

## Validation

- `npx biome check <changed files>`
- `npm run build`
