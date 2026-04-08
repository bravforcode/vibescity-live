## Goal
ทำให้การเลื่อนการ์ดใน carousel ลื่นและนิ่งขึ้น ลดอาการกระชากจาก scroll pipeline ที่ซ้อนกัน

## Scope
- in: `src/components/feed/BottomFeed.vue`, `src/composables/useDragScroll.js`, `src/composables/useScrollSync.js`, validation, prod deploy
- out: map rendering, backend, schema, analytics

## Agent(s)
frontend-specialist

## Steps
1. ตรวจ source ของความกระชากจาก width transition, drag momentum, snap, และ programmatic smooth scroll
2. ตัด animation/layout shift ที่ไม่จำเป็นใน scroll path และให้เหลือ behavior เดียวต่อช่วง interaction
3. รัน build/checklist/verify, smoke หน้า live, แล้ว deploy prod

## Success criteria
- [x] การ์ดไม่กระชากตอนรูดซ้ายขวา
- [x] ไม่มี layout jump ตอน active card เปลี่ยน
- [x] production deploy ใหม่และ smoke ผ่าน

## Risks
- visual emphasis ของ active card อาจลดลง: คง emphasis แบบ opacity/shadow ที่ไม่เปลี่ยน layout
- desktop drag behavior อาจเปลี่ยน: จำกัด custom drag ให้ทำงานเฉพาะ pointer/mouse path ที่เหมาะสม

## Rollback
revert `src/components/feed/BottomFeed.vue`, `src/composables/useDragScroll.js`, `src/composables/useScrollSync.js`, แล้ว deploy prod ใหม่

## Outcome
- ใช้ `scroll-snap-type: x proximity` แทน `mandatory` เพื่อลดอาการดูด/ล็อกแข็งตอนรูดการ์ด
- รักษา card width คงที่และไม่มี inactive scale transform ระหว่างเปลี่ยน active card
- ลดต้นทุน render ของ `SwipeCard` บน coarse-pointer path โดยปิด perspective/media filter/backdrop blur ที่ไม่จำเป็นบางส่วน
- deploy production สำเร็จที่ `dpl_AVNQ2LtrME7zu2E4yCz2GrULyT49` alias `https://www.vibescity.live`

## Validation
- `npx biome check src/components/feed/BottomFeed.vue src/components/ui/SwipeCard.vue`
- `npm run build`
- `python .agent/skills/testing-patterns/scripts/test_runner.py .`
- `python .agent/scripts/verify_all.py . --url https://www.vibescity.live`
- mobile Playwright smoke ยืนยัน `scrollBehavior: auto`, card width `220px`, `transform: none`, และ active card เปลี่ยนโดยไม่มี layout jump
