# VibeCity

> 🎉 **Phase 1: Foundation - เปิดใช้งานแล้ว!** ระบบ Performance Monitoring, Analytics, Error Handling, Health Checks, Service Worker, Security และ Code Optimization พร้อมใช้งาน 100%
> 
> 📖 [ดูรายละเอียดการเปิดใช้งาน](PHASE1_ACTIVATED.md) | [คู่มือภาษาไทย](docs/THAI_ACTIVATION_GUIDE.md) | [Developer Guide](docs/DEVELOPER_GUIDE.md) | [Map/PWA Debug Flags](docs/DEVELOPER_GUIDE.md#map-and-pwa-debug-flags)

โปรเจกต์ VibeCity ประกอบด้วย:
- Frontend: Vue 3 + Rsbuild
- Backend: FastAPI
- Database/Auth/Storage: Supabase

## 🚀 Phase 1 Systems (Active)

- ✅ **Performance Monitoring** - ติดตาม FPS, Memory, Web Vitals แบบเรียลไทม์
- ✅ **Analytics** - ติดตามพฤติกรรมผู้ใช้และการแปลง
- ✅ **Error Handling** - จัดการข้อผิดพลาดและกู้คืนอัตโนมัติ
- ✅ **Health Checks** - ตรวจสอบสุขภาพระบบเป็นประจำ
- ✅ **Service Worker** - รองรับการใช้งานออฟไลน์และ PWA
- ✅ **Security** - ป้องกัน XSS, SQL Injection, Rate Limiting
- ✅ **Code Optimization** - Lazy Loading, Code Splitting, Prefetching

## Quick Setup

```bash
bun install
bun run dev
```

ดูขั้นตอนใช้งานแบบละเอียดได้ที่ `QUICKSTART.md`

สำหรับทีม dev ที่ต้อง debug map หรือ service worker แบบเจาะลึก ให้ดู `Map/PWA Debug Flags` ใน `docs/DEVELOPER_GUIDE.md`

## WSL (Windows) Note

ถ้าใช้งานผ่าน WSL ให้ติดตั้ง dependencies ด้วยคำสั่งนี้:

```bash
bun install --os linux --cpu x64
```

## WSL Bootstrap

รันคำสั่งเดียวเพื่อ setup Bun/Linux dependencies และตรวจ Biome พร้อมใช้งาน:

```bash
bash scripts/dev/wsl-bootstrap.sh
```

Biome troubleshooting แบบตรงจุดอยู่ที่ `docs/wsl-biome-troubleshooting.md`
