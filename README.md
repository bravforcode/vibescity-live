# VibeCity

โปรเจกต์ VibeCity ประกอบด้วย:
- Frontend: Vue 3 + Rsbuild
- Backend: FastAPI
- Database/Auth/Storage: Supabase

## Quick Setup

```bash
bun install
bun run dev
```

ดูขั้นตอนใช้งานแบบละเอียดได้ที่ `QUICKSTART.md`

## WSL (Windows) Note

ถ้าใช้งานผ่าน WSL ให้ติดตั้ง dependencies ด้วยคำสั่งนี้:

```bash
bun install --os linux --cpu x64
```

## Enterprise Deployment (Production)

ระบบรองรับการทำงานระดับ Enterprise แบบอัตโนมัติ 100% ผ่าน CI/CD (GitHub Actions)

### สิ่งที่ต้องเตรียมใน GitHub Secrets
เพื่อให้ระบบทำงานได้สมบูรณ์ในระดับ Production ให้เพิ่ม Secrets เหล่านี้ใน **GitHub Repository -> Settings -> Secrets and variables -> Actions**:
- `DATABASE_URL`: สำหรับรัน Migration และตั้งค่า Cron Job อัตโนมัติ (ดึงจาก Supabase)
- `GOOGLE_MAPS_API_KEY`: สำหรับระบบดึงภาพหน้าร้านค้า (Street View Backfill)
- `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY`: สำหรับ Validation

#### วิธีการขอรับ GOOGLE_MAPS_API_KEY:
1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้างโปรเจกต์ใหม่ (หรือเลือกโปรเจกต์ที่มีอยู่)
3. ไปที่เมนู **APIs & Services > Library**
4. ค้นหาและเปิดใช้งาน (Enable) 2 APIs ต่อไปนี้:
   - **Street View Static API** (สำหรับดึงรูปภาพ)
   - **Places API** (หรือ Geocoding API เผื่อไว้ใช้หาพิกัด)
5. ไปที่เมนู **APIs & Services > Credentials**
6. คลิก **Create Credentials > API key**
7. คัดลอก API Key ที่ได้มา นำไปใส่ใน:
   - **GitHub Secrets** (ชื่อ `GOOGLE_MAPS_API_KEY`)
   - **Fly.io Secrets** (รันคำสั่ง `fly secrets set GOOGLE_MAPS_API_KEY="your_api_key_here"`)
   - ไฟล์ `.env` ในเครื่องของคุณ (สำหรับการทดสอบแบบ Local)

เมื่อ Merge โค้ดเข้า `main` ระบบจะทำการรันสคริปต์ `execute_enterprise_updates.py` โดยอัตโนมัติ ซึ่งรวมถึง:
1. การสร้าง Materialized View เพื่อเพิ่มความเร็ว PostGIS
2. ตั้งค่า Cron Job เพื่อ Refresh Geodata ทุก 15 นาที
3. ดึงรูปร้านค้าที่ขาดหายไปจาก Google Street View

## WSL Bootstrap

รันคำสั่งเดียวเพื่อ setup Bun/Linux dependencies และตรวจ Biome พร้อมใช้งาน:

```bash
bash scripts/dev/wsl-bootstrap.sh
```

Biome troubleshooting แบบตรงจุดอยู่ที่ `docs/wsl-biome-troubleshooting.md`
