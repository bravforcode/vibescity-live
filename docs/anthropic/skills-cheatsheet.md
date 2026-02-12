# Anthropic Agent Skills Cheatsheet

> ใช้เป็น “แผ่นสรุป” เพื่อเลือกสกิลให้ตรงงาน และเขียน prompt ให้กระตุ้นสกิลได้แม่น

## ตารางสรุป (skill_id)

| skill_id | ใช้ทำอะไร | Input ที่คาดหวัง | Output | ตัวอย่าง prompt (ให้สกิลชัด) |
|---|---|---|---|---|
| `pptx` | สร้าง/แก้ PowerPoint (.pptx), โครงสไลด์, layout, speaker notes, export | outline, brand notes, หรือไฟล์ `.pptx` เดิม | `.pptx` (และอาจ export เป็น `.pdf`/images เพื่อ QA) | “Use the **pptx** skill to create a 5-slide pitch deck from this outline… Return a `.pptx` file.” |
| `xlsx` | สร้าง/แก้/วิเคราะห์ Excel (.xlsx), ใส่สูตร/format, summary แบบ pivot-ish, chart (ถ้าเหมาะ) | dataset/CSV, requirements, หรือไฟล์ `.xlsx` เดิม | `.xlsx` (พร้อมสูตร/format) + สรุป insight | “Use the **xlsx** skill. Create a quarterly sales model with formulas and a summary sheet… Return a `.xlsx`.” |
| `docx` | สร้าง/แก้ Word (.docx), styles, headings, tables, (TOC ถ้า feasible) | outline/text, template rules, หรือไฟล์ `.docx` เดิม | `.docx` | “Use the **docx** skill to turn these bullets into a structured report with headings and a table… Return a `.docx`.” |
| `pdf` | สร้าง PDF, รวม/แยก/append, เติมฟอร์ม (ถ้าได้), ดึงข้อความ/ตาราง/OCR | outline/template, หรือไฟล์ `.pdf` เดิม | `.pdf` (หรือ extracted text/table) | “Use the **pdf** skill to generate an invoice PDF with these line items… Return a `.pdf`.” |

## Prompt snippets (เรียกให้ตรงสกิล)

### PPTX
```text
Use the pptx skill. Create a 7-slide deck for [audience] about [topic].
Constraints: 16:9, include speaker notes, avoid text-heavy slides.
Deliver: return a .pptx file.
```

### XLSX
```text
Use the xlsx skill. Create a spreadsheet with:
1) Inputs sheet (assumptions)
2) Calculations sheet (formulas)
3) Summary dashboard
Deliver: return a .xlsx file.
```

### DOCX
```text
Use the docx skill. Convert this outline into a Word document:
- Use Heading 1/2 styles
- Include a table and an executive summary
Deliver: return a .docx file.
```

### PDF
```text
Use the pdf skill. Generate a 2-page PDF report with:
- Title page
- Key metrics table
Deliver: return a .pdf file.
```

## หมายเหตุเรื่อง “Claude Code custom skills” vs “Messages API skills”

- **Claude Messages API**:
  - ต้อง “อนุญาตสกิล” ผ่าน `container.skills`
  - `skill_id` ต้องมาจาก `GET /v1/skills` (อย่าเดา)
- **Claude Code**:
  - Skills อยู่ที่ `.claude/skills/` และเป็น **model-invoked**
  - ถ้าต้องการ invoke แบบ `/...` ให้ใช้ **Slash Commands** (ดู: `docs/anthropic/agent.md`)

## References
- `docs/anthropic/agent.md`
- Skills API (List Skills): https://docs.claude.com/en/api/skills

