## Goal
ทำให้หน้าแรกเริ่มที่ตำแหน่งผู้ใช้จริงโดยไม่ auto-focus ร้านแรกผิดพื้นที่ และทำให้ชื่อร้านยาวบน compact card ไม่ชน badge `LIVE`

## Scope
- in: `src/composables/useAppLogic.js`, `src/composables/useScrollSync.js`, `src/components/ui/SwipeCard.vue`, browser verification, memory update, Vercel deploy
- out: payment/auth/schema, redesign feed ทั้งระบบ, backend API changes

## Agent(s)
frontend/runtime follow-up for startup map behavior and compact mobile card layout

## Steps
1. ปิด startup auto-selection ที่เลือก venue แรกเองก่อน user interaction
2. ให้ startup ยังคงรองรับ deep link และ manual selection ได้เหมือนเดิม
3. ปรับ compact card title/badge spacing และ restore safe clamp บนการ์ดแคบ
4. รัน lint + browser verify + update memory + deploy

## Success criteria
- [ ] เปิดหน้าแรกแล้ว map อยู่ที่ user location เมื่อมี real location อยู่หรือยอมให้เข้าถึงตำแหน่ง
- [ ] หน้าแรกไม่ auto-jump ไป venue แรกของ feed เอง
- [ ] ชื่อร้านยาวไม่ชนกับ badge `LIVE` หรือปุ่ม favorite บน compact card
- [ ] local validation ผ่านและ production deploy ใช้งานได้

## Risks
- การปิด startup auto-selection อาจเปลี่ยนพฤติกรรม preview เดิม: verify ว่า manual scroll / pin tap / deep link ยังทำงาน
- การ clamp ชื่อร้านมากเกินไปอาจตัดข้อมูลบนการ์ดแคบ: ใช้ 3-line clamp พร้อม safe spacing แทนการซ่อนมากเกินไป

## Rollback
revert `useAppLogic.js`, `useScrollSync.js`, และ `SwipeCard.vue`, จากนั้น rerun validation และ redeploy build ก่อนหน้า
