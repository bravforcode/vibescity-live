## Goal
ทำให้ `npm run build` ผ่านบนเครื่อง Windows นี้ และปิดงาน deploy/domain follow-up ที่ยังค้างอยู่

## Scope
- in: `package.json`, validation, Vercel deploy, memory update
- out: refactor โครงสร้าง snapshot generator ขนาดใหญ่, payment/auth/schema

## Agent(s)
runtime/build follow-up for Node heap reliability and Vercel deployment

## Steps
1. เพิ่ม Node heap ให้ entrypoints ที่เรียก `scripts/generate-localhost-venue-snapshot.mjs`
2. รัน `npm run build` ยืนยันว่า build pipeline ผ่านบนเครื่องนี้
3. deploy production ขึ้น Vercel แล้วตรวจ alias/redirect ที่เกี่ยวข้อง
4. update memory และ push ขึ้น `main`

## Success criteria
- [ ] `npm run build` ผ่านบนเครื่อง Windows นี้
- [ ] production deploy ใหม่พร้อม URL ใช้งานได้
- [ ] `www.vibescity.live` ยัง redirect ไป apex ได้

## Risks
- heap ที่สูงขึ้นอาจกิน RAM มากขึ้น: จำกัดเฉพาะ script snapshot ไม่ครอบทั้ง build chain
- `vibecity.live` ยังติด third-party DNS: ทำได้แค่ยืนยัน blocker และคง Vercel-side redirect readiness

## Rollback
revert `package.json` แล้ว deploy build ก่อนหน้าใหม่
