# แผนการแก้ไขบั๊ก `statement timeout` ตอนรัน Supabase Migration

**ถึง Codex (หรือ AI ที่รับช่วงต่อ)**

ช่วยแก้ปัญหา `canceling statement due to statement timeout` ที่เกิดจากการรัน `npx supabase db push`

**สาเหตุ:**
ไฟล์ Migration ล่าสุดพยายามรันคำสั่ง `UPDATE public.venues` เพื่อเซ็ตค่าเริ่มต้นให้คอลัมน์ใหม่ แต่ตารางนี้มีข้อมูลจำนวนมาก ทำให้ใช้เวลา Execute นานเกินกว่าที่ Supabase กำหนดไว้เป็นค่าดีฟอลต์ (statement timeout)

**สิ่งที่ต้องทำ:**
1. เปิดไฟล์ `supabase/migrations/20260224120000_venues_admin_granular_th.sql`
2. ค้นหาบรรทัดที่เขียนว่า `BEGIN;` (ประมาณบรรทัดที่ 6)
3. เพิ่มคำสั่งเพิ่มเวลา timeout ชั่วคราวเฉพาะใน Transaction นี้ โดยแทรกบรรทัดใหม่ต่อจาก `BEGIN;` ให้เป็นแบบนี้:
   ```sql
   BEGIN;
   SET LOCAL statement_timeout = '15min';
   ```
4. บันทึกไฟล์
5. แจ้ง User ให้ลองรัน `npx supabase db push` ใน Terminal ใหม่อีกครั้ง
