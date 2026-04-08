## Goal
แก้อาการการ์ดใน carousel หลอน/ซ้อนตอนเลื่อน และปล่อย production ใหม่

## Scope
- in: `src/components/feed/BottomFeed.vue`, `src/components/ui/SwipeCard.vue`, validation, prod deploy
- out: map rendering, backend, schema, analytics pipeline

## Agent(s)
frontend-specialist

## Steps
1. ตรวจเส้นทาง render ของ carousel/card เพื่อหาชั้น compositing หรือภาพซ้อนที่ทำให้เกิด ghosting
2. แก้ CSS/runtime ของ card และ carousel ให้ลด layer ซ้อนและหยุด transition หนักระหว่าง scroll
3. รัน build/checklist/verify แล้ว deploy Vercel production พร้อม smoke check

## Success criteria
- [x] เลื่อนการ์ดแล้วไม่เห็นภาพซ้อน/เงาซ้อนจาก active card styling
- [x] production build ผ่านและ deploy สำเร็จ
- [x] smoke check หน้า live ไม่เจอ console errors ใหม่

## Risks
- card styling อาจดูนิ่งขึ้นระหว่าง scroll: จำกัดผลเฉพาะช่วง interaction แล้วคืน state หลัง settle
- fallback media อาจว่างชั่วคราวถ้าตัด background ผิด: คง placeholder gradient ไว้เมื่อไม่มีภาพจริง

## Rollback
revert `src/components/feed/BottomFeed.vue`, `src/components/ui/SwipeCard.vue`, แล้ว deploy prod ใหม่

## Validation
- `npx biome check src/components/feed/BottomFeed.vue src/components/ui/SwipeCard.vue`
- `npm run build`
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/checklist.py .`
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/verify_all.py . --url https://www.vibescity.live`
- `vercel deploy --prod --archive=tgz -y --force` → `dpl_FcjG8sruYW57X5j8Xt2uvvEEDqrf`
- Mobile Playwright smoke scrolled `[data-testid="vibe-carousel"]` on `https://www.vibescity.live/th?ghostfix=20260407` and finished with `data-scrolling="false"` plus no new page errors
