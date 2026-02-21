# Anthropic Agent Skills Starter Pack

เอกสารนี้เป็น “คู่มือใช้งานสกิล/เอเจนต์แบบพกพา (portable)” สำหรับทีม โดยโฟกัส 3 พื้นผิว:
- Claude Messages API (Skills API + Code Execution + Files API)
- Agent SDK (โหลดสกิลจาก filesystem)
- Claude Code (project skills + subagents + slash commands ที่เกี่ยวข้อง)

> หลักการสำคัญ: **ห้ามเดา** ฟิลด์/เฮดเดอร์/พฤติกรรมที่ไม่ชัวร์ ให้ใส่ `TODO:` พร้อมลิงก์อ้างอิง official docs แทน
> (อัปเดตอ้างอิงตามเอกสารทางการที่ลิงก์ไว้ในภาคผนวก)

---

## 1) Agent Skills คืออะไร (Progressive Disclosure)

**Agent Skill** คือ “แพ็กเกจคำแนะนำ + โครงเวิร์กโฟลว์” ที่ถูกโหลด “เฉพาะเมื่อจำเป็น” เพื่อลด context bloat:
- **Metadata (YAML frontmatter)**: สั้นมาก แต่เป็นตัว trigger สำคัญที่สุด
- **Body ของ SKILL.md**: ขั้นตอนปฏิบัติ + ตัวอย่าง + edge cases
- **References/Scripts/Assets**: โหลด/อ่านเฉพาะตอนจำเป็น (progressive disclosure)

แนวทางนี้ทำให้:
- สกิล trigger ได้แม่นจาก `description`
- ไม่ยัดข้อมูลยาว ๆ เข้ามาใน context โดยไม่จำเป็น
- แยก “คู่มือ” ออกจาก “สคริปต์/ไฟล์ช่วยงาน” ได้ชัด

---

## 2) รูปแบบโฟลเดอร์สกิล + SKILL.md

โครงสร้างแนะนำ (Claude Code / Agent SDK):

```text
.claude/
  skills/
    <skill-name>/
      SKILL.md
      references/        (optional)
      scripts/           (optional)
      assets/            (optional)
```

### YAML frontmatter (ขั้นต่ำที่ต้องมี)

ทุก `SKILL.md` ต้องมี YAML frontmatter ระหว่าง `--- ... ---` และต้องมีอย่างน้อย:
- `name`: ต้องตรงกับชื่อโฟลเดอร์ (lowercase/ตัวเลข/ขีดกลางเท่านั้น)
- `description`: ต้องมี keyword triggers ชัดเจน (ช่วยให้โมเดลเลือกสกิลได้)

ตัวอย่าง (ขั้นต่ำ):

```yaml
---
name: pdf
description: สร้าง/แก้/รวม/แยก/อ่านไฟล์ .pdf รวมถึง OCR และการดึงตาราง ใช้เมื่อมีไฟล์ PDF หรือคำว่า merge/split/OCR/invoice/report
---
```

### ฟิลด์เสริม (ขึ้นกับ runtime)

**Claude Code Skills** รองรับ `allowed-tools` เพื่อจำกัดเครื่องมือที่สกิลเรียกใช้ (แนะนำให้จำกัดเฉพาะที่จำเป็น) และแนวทางอื่น ๆ อยู่ใน docs ของ Claude Code skills.

> หมายเหตุเรื่อง “/invoke + disable-model-invocation + $ARGUMENTS”: นี่เป็นฟีเจอร์ของ **Claude Code Slash Commands** (คนพิมพ์ `/command`) ไม่ใช่ “skills” โดยตรง  
> ถ้าต้องการ “invoke แบบ explicit” ให้ทำ slash command เป็นตัว wrapper ที่บอกให้ใช้สกิล

**Team metadata** (เช่น `license`, `compatibility`, `metadata`) ถ้าต้องการใส่เพื่อทีม:
- แนะนำใส่ใน **body** หรือ `references/` แทน
- เพราะ runtime อาจไม่อ่าน/ไม่ enforce ฟิลด์เหล่านี้

---

## 3) ใช้ Skills กับ Claude Messages API

อ้างอิงหลัก: “Using Agent Skills with the API” และ “Skills API” (official).  
แนวคิดสำคัญ:
- ต้องเปิด beta สำหรับ “skills”
- ถ้าใช้ code execution ให้เปิด beta สำหรับ “code execution”
- ถ้าอัปโหลด/ดาวน์โหลดไฟล์ ให้เปิด beta สำหรับ “files api”

### 3.1 ต้องเปิดอะไรบ้าง (Betas / Tools)

อย่างน้อย:
- `skills-2025-10-02` (เพื่อใช้ `container.skills`)

ถ้าใช้ Code Execution tool:
- `code-execution-2025-08-25`
- และเพิ่ม tool: `{"type":"code_execution_20250825","name":"code_execution"}`

ถ้าใช้ Files API (อัปโหลด/ดาวน์โหลด):
- `files-api-2025-04-14`

> TODO: ถ้าองค์กรของคุณใช้ SDK wrapper ที่ตั้งชื่อ beta/tool ต่างจาก docs ให้ลิงก์ wrapper ที่ใช้จริงไว้ตรงนี้

### 3.2 ใส่สกิลใน request ด้วย `container.skills`

รูปแบบหลัก (แนวคิด):
- `container.skills` เป็น list ของสกิลที่อนุญาตให้ใช้งานใน “container” นั้น ๆ
- 1 request ใส่ได้ “หลายสกิล” (เอกสารทางการระบุ limit ต่อ request)

ตัวอย่างโครง (เฉพาะส่วน `container` + `tools` ดูไฟล์ตัวอย่างเต็มที่):
- `docs/anthropic/examples/messages-api-container.json`

### 3.3 List skills (หา skill IDs ที่ใช้ได้จริง)

ก่อนใช้งาน “skill_id” ใน production:
1. เรียก `GET /v1/skills`
2. กรองด้วย `source=anthropic` (สกิล built-in) หรือ `source=custom` (สกิลที่คุณอัปโหลด)
3. ใช้ค่า `id` ที่ได้จริงเป็น `skill_id`

ตัวอย่าง (cURL):

```bash
curl https://api.anthropic.com/v1/skills?source=anthropic \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: skills-2025-10-02"
```

### 3.4 ดาวน์โหลดไฟล์ด้วย Files API (แนวคิด + flow)

Flow ทั่วไป:
1. โมเดล/เครื่องมือสร้างไฟล์ → response จะมี `file_id`
2. ดาวน์โหลดด้วย `GET /v1/files/{file_id}/content`
3. บันทึกเป็น `.pptx/.xlsx/.docx/.pdf` ตามชนิดไฟล์

ตัวอย่าง (cURL):

```bash
curl -L https://api.anthropic.com/v1/files/$FILE_ID/content \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: files-api-2025-04-14" \
  -o output.bin
```

> TODO: ใส่ตัวอย่าง “การดึง `file_id` จาก response body” ตาม SDK/ภาษาที่ทีมใช้จริง (พร้อมลิงก์ official)

---

## 4) ใช้ Skills กับ Agent SDK

อ้างอิง: Agent SDK “Skills” docs (official).

หลักการ:
- ให้ Agent SDK โหลดสกิลจาก filesystem ผ่าน `settingSources`/`setting_sources`
- เปิดใช้ Skill tool โดยใส่ `"Skill"` ใน `allowedTools`/`allowed_tools`
- ฟิลด์ `allowed-tools` ใน frontmatter (ถ้ามี) อาจไม่ได้ถูกใช้โดย SDK runtime เสมอไป
  ให้ยึด **allowlist ที่ตั้งตอนรัน** เป็นหลัก

Pseudo-example (แนวคิด):

```ts
// PSEUDOCODE: ปรับตาม SDK ที่ใช้งานจริง
const agent = new Agent({
  allowedTools: ["Skill", "Read", "Write"],
  settingSources: [
    { type: "filesystem", path: "./.claude/skills" }
  ]
})
```

> TODO: เติมตัวอย่างจริง (TypeScript/Python) ตาม Agent SDK เวอร์ชันที่ทีมใช้อยู่ พร้อมลิงก์อ้างอิง official

---

## 5) ใช้ Skills ใน Claude Code

อ้างอิงหลัก: Claude Code “Skills” (official) และ “Subagents” (official).

### 5.1 ตำแหน่งโฟลเดอร์
- Project skills: `.claude/skills/`
- User skills: `~/.claude/skills/`

### 5.2 การ invoke
- **Skills** ใน Claude Code เป็นแนว **model-invoked** (Claude เลือกใช้เมื่อเหมาะ)
- ถ้าคุณต้องการ “สั่งแบบ explicit ด้วย `/...`” ให้ใช้ **Slash Commands**
  (อยู่ที่ `.claude/commands/` และเรียกด้วย `/command`)

#### Slash command wrappers (แนะนำสำหรับ deterministic entrypoint)
Starter pack นี้มี wrapper commands ให้เรียก “ให้ตรงสกิล” แบบตั้งใจ:
- `/make-deck` → ใช้ skill `pptx`
- `/make-sheet` → ใช้ skill `xlsx`
- `/make-doc` → ใช้ skill `docx`
- `/make-pdf` → ใช้ skill `pdf`

ไฟล์อยู่ที่:
- `.claude/commands/make-deck.md`
- `.claude/commands/make-sheet.md`
- `.claude/commands/make-doc.md`
- `.claude/commands/make-pdf.md`

### 5.3 Slash Commands ที่เกี่ยวข้อง (สำหรับ /invoke + $ARGUMENTS)
Slash commands รองรับ:
- `$ARGUMENTS`, `$1`, `$2`, ... (แทนค่าจากข้อความที่ผู้ใช้พิมพ์ต่อท้าย)
- `disable-model-invocation` (กันไม่ให้โมเดลเรียก command เอง)
- `allowed-tools`, `argument-hint`, `model` ฯลฯ (ตาม docs)

แนวทางแนะนำ:
- ทำ `/make-deck ...` เป็น wrapper ที่บอก “ให้ใช้ skill pptx” เพื่อให้ได้ behavior ที่ deterministic

---

## 6) Security checklist (Treat skills like installing software)

ก่อนใช้งานสกิล/ซับเอเจนต์จากที่อื่น:
- อ่าน `SKILL.md` ให้ครบ (ดูว่าให้ทำอะไร/เขียนไฟล์อะไร/เรียกเครื่องมืออะไร)
- ตรวจ `scripts/` ว่ามีการ run คำสั่งอันตรายไหม (เช่น overwrite, delete, external fetch)
- จำกัดสิทธิ์ tools: เปิดเฉพาะที่ต้องใช้จริง (principle of least privilege)
- ระวัง prompt injection: อย่าให้ไฟล์/เว็บ/ข้อความภายนอก “สั่งให้ไปดึง secret” หรือ “รันคำสั่งแปลก ๆ”
- ถ้าต้อง fetch URL ภายนอก: whitelist domain และบันทึกแหล่งที่มา
- Pin เวอร์ชัน dependency / MCP server ถ้าขึ้น production workflow

---

## Do / Don’t

### Do
- เขียน `description` ให้ trigger ได้จริง (ระบุ .ext + keyword เช่น “pptx, slide deck, PowerPoint”)
- จำกัด `allowed-tools` ใน Claude Code skills/commands ให้เท่าที่จำเป็น
- ใส่ “Acceptance Criteria” เป็น checklist ที่ตรวจได้ (pass/fail)
- แยกเนื้อหายาวไปไว้ `references/` แล้วลิงก์กลับ (progressive disclosure)
- ใส่ `TODO + link` เมื่อไม่ชัวร์ แทนการเดา

### Don’t
- อย่าใส่ secrets/tokens ลงไฟล์สกิล
- อย่าเปิด tools ที่มีความเสี่ยงสูงโดยไม่จำเป็น (เช่น unrestricted fetch/write)
- อย่า hardcode “skill_id” ใน API โดยไม่ list skills ก่อน
- อย่าเขียนสกิลแบบกว้างเกิน (ทำทุกอย่าง) จน trigger มั่ว/เสี่ยง

---

## Acceptance Criteria

- [ ] มีเอกสารอ้างอิง official docs (ลิงก์) สำหรับ: Skills API, Code Execution, Files API, Claude Code skills/subagents, Agent SDK skills
- [ ] มีคำอธิบายชัดเจนเรื่อง progressive disclosure และการแยก `references/`
- [ ] มีตัวอย่างการใช้ `container.skills` และการ list skills ด้วย `GET /v1/skills`
- [ ] มี flow ดาวน์โหลดไฟล์ด้วย `GET /v1/files/{file_id}/content`
- [ ] มี Do/Don’t และ checklist ด้าน security

---

## ภาคผนวก: Official References

- Using Agent Skills with the API: https://docs.claude.com/en/docs/agents/agent-skills/use-agent-skills-with-the-api
- Skills API overview: https://docs.claude.com/en/docs/agents/agent-skills/overview
- Skills API reference (List Skills): https://docs.claude.com/en/api/skills
- Code Execution tool: https://docs.claude.com/en/docs/build-with-claude/code-execution-tool
- Files API (Download file content): https://docs.claude.com/en/api/files#download-file-content
- Claude Code Skills: https://docs.claude.com/en/docs/claude-code/skills
- Claude Code Slash Commands: https://docs.claude.com/en/docs/claude-code/slash-commands
- Claude Code Subagents: https://docs.claude.com/en/docs/claude-code/subagents
- Agent SDK Skills: https://docs.claude.com/en/docs/agent-sdk/skills
- Model Context Protocol (MCP) servers list: https://github.com/modelcontextprotocol/servers
- MCP “Connecting clients to servers” (concept): https://modelcontextprotocol.io/quickstart/user
