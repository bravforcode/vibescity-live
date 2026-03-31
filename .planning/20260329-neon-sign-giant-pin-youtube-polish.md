# Neon Sign + Giant Pin YouTube Polish

## Goal

- ยก selected `NeonPinSign` ให้สูงขึ้นบน mobile/detail sheet เพื่อไม่ทับหัวการ์ด
- ทำ giant pin surfaces ให้มีอารมณ์ YouTube มากขึ้นโดยไม่เปลี่ยน flow เดิม

## Scope

- `src/components/map/MapLibreContainer.vue`
- `src/components/ui/SwipeCard.vue`
- `src/components/feed/GiantPinDialog.vue`

## Non-Goals

- ไม่แก้ data flow, routing, หรือ selection intent
- ไม่ขยับ `NeonPinSign.vue` ตรง ๆ ถ้า spacing budget ฝั่ง map ยังแก้ปัญหาได้
- ไม่แตะ payment/auth/RLS/schema/migration

## Validation

- `npx biome check src/components/map/MapLibreContainer.vue src/components/ui/SwipeCard.vue src/components/feed/GiantPinDialog.vue docs/runbooks/agent-operating-memory.md`
- `npm run build`
- Browser verify on local mobile viewport if dev server is available
