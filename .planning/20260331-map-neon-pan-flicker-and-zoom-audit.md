## Goal
แก้อาการ neon sign/ร้านค้ากระพริบหรือมาๆหายๆ ระหว่างเลื่อนแผนที่ พร้อมตรวจให้แน่ใจว่า default zoom และ zoom-out clustering ทำงานคงที่ตามที่ต้องการ

## Scope
- in: `src/composables/map/useNeonPinsLayer.js`, `src/components/map/MapLibreContainer.vue`, browser verification, targeted tests
- out: ไม่แก้ schema, API, auth, หรือ behavior ฝั่ง payment

## Agent(s)
frontend-specialist เพราะเป็นงาน map interaction / overlay / camera behavior ฝั่ง Vue + MapLibre

## Steps
1. reproduce อาการกระพริบใน browser และเก็บ state ของ overlay ตอน pan / zoom
2. แก้ logic ที่ทำให้ neon sign ถูก mount/unmount หรือสลับ cluster ระหว่าง drag จนเกิด flicker
3. ตรวจและปรับ default selection zoom ถ้ายังไม่คงที่
4. เพิ่ม/ปรับ targeted tests และ rerun lint + browser verification

## Success criteria
- [ ] pan แผนที่แล้ว neon sign ไม่กระพริบหรือมาๆหายๆ แบบไม่จำเป็น
- [ ] sign ที่อยู่นอกกรอบไม่ค้างบนขอบจอ
- [ ] default selection zoom คงที่และใกล้ตาม baseline ล่าสุด
- [ ] zoom out แล้วยัง cluster ได้ และ zoom in แล้วแตกกลับ

## Risks
- overlay หนาแน่นเกินไปบน mobile: ต้องมี hysteresis/threshold ไม่ให้ flicker โดยไม่ทำให้ sign ค้างผิดตำแหน่ง
- camera/overlay coupling: ห้ามให้การแก้ flicker ไปทำให้ default framing เปลี่ยนโดยไม่ได้ตั้งใจ

## Rollback
revert `src/composables/map/useNeonPinsLayer.js`, `src/components/map/MapLibreContainer.vue`, test files และ plan artifact นี้
