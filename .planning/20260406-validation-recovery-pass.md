## Goal
ลดหนี้ validation หลักของ repo โดยแก้สาเหตุจริงใน lint/type/test/UX/accessibility/GEO ให้ได้มากที่สุดโดยไม่แตะ auth, schema, payment หรือ behavior เสี่ยง

## Scope
- in: ระบุสาเหตุล่าสุดของ lane ที่ยัง fail, patch แบบแคบ, rerun validation ที่เกี่ยวข้อง, อัปเดต memory
- out: schema migration, auth/RLS, payment, refactor กว้าง, เปลี่ยน product behavior ที่ไม่เกี่ยวกับ failure ปัจจุบัน

## Agent(s)
orchestrator เพราะงานนี้กินหลาย lane พร้อมกันทั้ง frontend quality, test stability, audit gates และ deploy safety

## Steps
1. รันและเก็บ output ของ lint/type/test/UX/accessibility/GEO จาก state ปัจจุบัน
2. จัดกลุ่ม failure ตามต้นเหตุร่วมและหา patch ที่เล็กที่สุด
3. แก้โค้ด/fixture/config เฉพาะจุดที่ทำให้ gate fail
4. rerun lane ที่แตะจนได้ผลล่าสุดที่ตรวจสอบได้
5. อัปเดต operating memory ด้วย baseline และ debt ที่ยังเหลือ

## Success criteria
- [x] มี root-cause output ล่าสุดของทุก lane ที่ยัง fail
- [x] lane ที่แก้แล้ว rerun ได้และไม่ regress build/smoke
- [x] มีรายการ debt คงเหลือที่แคบลงและอธิบายได้

## Outcome
- false negatives ใน lint/type/test/accessibility/GEO ถูกแก้ที่ตัว validation runners และ fixture/tests ที่ล้าสมัย
- public production เลิกยิง direct Supabase browser reads สำหรับ lane ที่คอนโซลพังจาก CORS/no-ACAO และหันไปใช้ snapshot/default/local fallback
- current production alias ถูก redeploy และ smoke ผ่านโดยคอนโซลเป็น `0 errors / 0 warnings`

## Risks
- audit scripts อาจพาไปแก้กว้างเกินจำเป็น: จำกัด patch ให้ยึด failure ล่าสุดจริง
- test/UX/GEO บาง lane อาจพึ่ง external/runtime data: ทำ fallback ที่ไม่บิด product contract

## Rollback
revert เฉพาะไฟล์ที่แตะใน validation pass นี้ แล้ว rerun checklist เพื่อยืนยันว่าไม่แย่ลงกว่า baseline เดิม
