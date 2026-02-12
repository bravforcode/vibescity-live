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

## WSL Bootstrap

รันคำสั่งเดียวเพื่อ setup Bun/Linux dependencies และตรวจ Biome พร้อมใช้งาน:

```bash
bash scripts/dev/wsl-bootstrap.sh
```

Biome troubleshooting แบบตรงจุดอยู่ที่ `docs/wsl-biome-troubleshooting.md`
