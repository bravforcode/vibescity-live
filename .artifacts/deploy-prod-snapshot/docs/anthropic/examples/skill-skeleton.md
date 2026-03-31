---
name: <skill-name>
description: <สรุปสิ่งที่สกิลทำ + trigger keywords ที่ชัด เช่น file extensions (.pdf/.docx) + verbs (merge/split/analyze)>
---

# <Skill Title>

## When to use
- ใช้เมื่อ: ...
- Trigger keywords: ...

## Inputs
- ไฟล์แนบ: (ถ้ามี) ชนิด/รูปแบบที่รับ
- ข้อกำหนด: (เช่น page size, slide count, schema)
- ข้อจำกัด: (เช่น เวลา, ขนาดไฟล์, no-internet)

## Outputs
- ไฟล์ผลลัพธ์: (นามสกุล/ชื่อไฟล์/ตำแหน่ง)
- สรุปข้อความ: (ต้องสรุปอะไรบ้าง)

## Procedure
1. ตรวจ requirement และยืนยันสิ่งที่ “ต้องไม่เปลี่ยน” (non-goals)
2. เลือกเครื่องมือ/ไลบรารี/แนวทางที่เหมาะกับงาน
3. ทำงานเป็นขั้น ๆ พร้อม checkpoint (validate ระหว่างทาง)
4. ตรวจคุณภาพ/ความถูกต้อง (lint/validate/open/render)
5. สรุปผล + ระบุไฟล์ที่สร้าง/แก้ + วิธีทดสอบซ้ำ

## Examples
### Example 1: Create from scratch
```text
<ตัวอย่าง prompt ที่ชัดเจน>
```

### Example 2: Edit existing file
```text
<ตัวอย่าง prompt ที่ระบุว่า "แก้ไฟล์ที่แนบ" และบอกข้อจำกัด>
```

### Example 3: Convert / extract / analyze
```text
<ตัวอย่าง prompt ที่ชัดเจน>
```

## Edge cases
- ไฟล์ใหญ่/หลายหน้า/หลายชีต → ทำเป็น batch + สรุปความคืบหน้า
- ฟอนต์/ภาษา/encoding → ใช้ฟอนต์ที่รองรับ หรือใส่ TODO ถ้าไม่ชัวร์
- ข้อมูลไม่ครบ/กำกวม → ถามกลับ หรือสร้าง placeholder พร้อม TODO

## Do / Don’t
### Do
- ทำงานแบบ progressive disclosure: ไม่โหลด reference ทั้งก้อนถ้าไม่จำเป็น
- ใส่ checklist ตรวจคุณภาพ (เปิดไฟล์ได้, ไม่มี error, ตรงสเปก)
- ใส่ TODO + ลิงก์ official docs เมื่อไม่ชัวร์

### Don’t
- อย่าเดา field/header/format ที่มีผลกับ runtime
- อย่า overwrite ไฟล์เดิมโดยไม่สำรองก่อน
- อย่าใส่ secrets ลงเอกสาร

## Acceptance Criteria
- [ ] มีไฟล์ output ใน path ที่ระบุ และเปิดได้ด้วยโปรแกรมเป้าหมาย
- [ ] โครงสร้าง/รูปแบบตรงตามข้อกำหนดที่ inputs ระบุ
- [ ] มีสรุปสิ่งที่ทำ + รายชื่อไฟล์ที่สร้าง/แก้
- [ ] ไม่มี TODO ที่ค้างอยู่ “โดยไม่มีลิงก์อ้างอิง”

## References
- `docs/anthropic/agent.md`
- `docs/anthropic/skills-cheatsheet.md`
- (optional) `references/<topic>.md`

