# Giant Pin UX Polish

## Goal

ยกระดับ `MallDrawerGiantContent.vue` ให้ giant pin ดูพรีเมียมขึ้นและใช้งานทางเดียวชัดขึ้น โดยไม่เปลี่ยน contract/state flow ที่เพิ่งล็อกไว้

## Scope

- ปรับ visual hierarchy ของ hero
- ทำ rail ให้เข้าใจง่ายว่า click แล้วเป็น preview ไม่ใช่เปิด detail
- ปรับ CTA, spacing, active state, empty state
- คง responsive split เดิม แต่ polish interaction และ accessibility

## Guardrails

- ไม่แตะ logic เปิด detail / preview intent
- ไม่เอา branch giant เพิ่มกระจายไปนอก `MallDrawerGiantContent.vue`
- คง touch target 44px+, reduced motion, และ shell behavior ของ `MallDrawer.vue`
