## Goal
ทำให้เว็บขอและใช้ตำแหน่งจริงของผู้ใช้ตั้งแต่เปิดหน้าแรก แทนการค้างอยู่ที่ fallback location

## Scope
- in: `src/composables/useAppLogic.js`, `src/store/locationStore.js`, memory update, targeted validation
- out: map style, backend geocoding, payment/auth/schema changes

## Agent(s)
frontend runtime stabilization for startup geolocation and map/feed location usage

## Steps
1. แก้ startup prime flow ใน `src/composables/useAppLogic.js` ให้ยอม prompt geolocation ตอนเปิดเว็บ
2. แก้ `src/store/locationStore.js` ให้เมื่อได้ตำแหน่งจริงครั้งแรกแล้วเริ่ม tracking ต่อโดยไม่ต้องรอ user กดซ้ำ
3. รัน validation เฉพาะไฟล์ที่แก้ แล้วอัปเดต memory

## Success criteria
- [ ] เปิดเว็บครั้งแรกแล้ว browser ขอ permission geolocation ได้
- [ ] เมื่อผู้ใช้กดอนุญาต แอปอัปเดตตำแหน่งจริงแทน fallback location
- [ ] map/feed ใช้ตำแหน่งจริงโดยไม่ต้องกด `My Location` ซ้ำ

## Risks
- geolocation prompt อาจทำให้ startup รอช้าขึ้น: คง timeout เดิมไว้และให้ตำแหน่งจริงตามมาทีหลังได้
- อาจเกิด watch ซ้ำหลายตัว: ใช้ guard `isTracking` ใน store

## Rollback
revert `src/composables/useAppLogic.js` และ `src/store/locationStore.js`
