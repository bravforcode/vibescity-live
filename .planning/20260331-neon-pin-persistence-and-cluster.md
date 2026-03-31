## Goal
ทำให้ neon pin sign บนแผนที่คงแสดงร้านในชุด map สูงสุด 30 ร้านแม้มีร้านถูกเลือกอยู่ และรวมป้ายเป็น cluster เดียวเมื่อซูมออก

## Scope
- in: `src/composables/map/useNeonPinsLayer.js`, `src/components/map/MapLibreContainer.vue`, test coverage สำหรับ clustering/visibility, memory update
- out: ไม่เปลี่ยน schema, API, auth, หรือพฤติกรรม data fetch ของร้าน

## Agent(s)
frontend-specialist เพราะเป็นงาน map overlay / interaction ฝั่ง Vue + MapLibre อย่างเดียว

## Steps
1. แยก logic คัดเลือก/cluster neon pin เป็น pure helpers ใน `src/composables/map/useNeonPinsLayer.js`
2. แก้ overlay ให้ไม่ซ่อนร้านอื่นเมื่อมี preview popup หรือ detail modal และเพิ่ม cap เป็น 30 ร้าน
3. เพิ่ม DOM cluster marker สำหรับ zoom out พร้อม click-to-zoom เพื่อแตกกลุ่มเมื่อซูมเข้า
4. ผ่อนระดับการ dim pin ใน `src/components/map/MapLibreContainer.vue` ไม่ให้หมุดอื่นดูหาย
5. เพิ่ม unit test สำหรับ visibility/cluster และรัน lint + targeted tests

## Success criteria
- [ ] เมื่อเลือกร้านกลางแผนที่ neon pin sign ของร้านอื่นยังอยู่บนแผนที่
- [ ] overlay แสดงร้านได้สูงสุด 30 ร้านจากชุด `mapShops`
- [ ] ซูมออกแล้ว neon sign ที่อยู่ใกล้กันรวมเป็น cluster marker เดียว และซูมเข้าแล้วแตกกลับ
- [ ] targeted lint/tests ผ่าน

## Risks
- overlay หนาแน่นเกินไปบน mobile: ใช้ pixel-based clustering + จำกัด 30 ร้าน
- selected sign ซ้อน modal: คง fixed selected overlay และรักษา clearance helper เดิม

## Rollback
revert `src/composables/map/useNeonPinsLayer.js`, `src/components/map/MapLibreContainer.vue`, และไฟล์ test ที่เพิ่ม
