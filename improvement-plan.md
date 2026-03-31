# VibeCity.live Comprehensive System Improvement Plan

## 1. ประสิทธิภาพ (Performance)
**เป้าหมาย:** Response time < 200 ms, Throughput เพิ่มขึ้น ≥ 30%, CPU/Memory utilization ลดลง ≥ 20%

### แผนการดำเนินการ:
- **Frontend Optimization:**
  - ทำ Code Splitting ระดับ Component สำหรับส่วนที่ไม่ได้ใช้งานทันที
  - ปรับปรุง Map rendering โดยใช้ `VITE_LOCAL_DEV_MAP_RENDERER=webgl` เฉพาะเมื่อจำเป็น และใช้ non-WebGL สำหรับ dev-safe mode
  - ลดขนาด Bundle size ของ MapLibre-gl โดยการทำ Tree-shaking หรือใช้ Lite version หากเป็นไปได้
- **Backend Optimization:**
  - ใช้ Redis Caching อย่างเข้มข้นสำหรับ Query ที่มีการเรียกซ้ำสูง (เช่น Geodata, Places)
  - ปรับปรุง FastAPI middleware ให้ทำงานแบบ Asynchronous ทั้งหมด
  - ใช้ `pydantic-v2` เพื่อเพิ่มประสิทธิภาพการทำ Data validation (มีอยู่ใน requirements แล้วแต่ต้องตรวจสอบการใช้งาน)
- **Database:**
  - ตรวจสอบและสร้าง Index สำหรับ Geospatial queries (PostGIS) ที่เป็นคอขวด
  - ใช้ Connection Pooling ผ่าน Supabase/Prisma

## 2. ความปลอดภัย (Security)
**เป้าหมาย:** Update dependencies สม่ำเสมอ, แก้ไขช่องโหว่ CVSS ≥ 7.0 ภายใน 7 วัน, เปิดใช้ SAST/DAST 100%

### แผนการดำเนินการ:
- **Dependency Management:**
  - ติดตั้ง `Dependabot` หรือ `Snyk` เพื่อแจ้งเตือนช่องโหว่แบบ Real-time
  - กำหนดรอบการอัปเดต Dependency ทุกสัปดาห์
- **Automated Security Scanning:**
  - เพิ่ม `Semgrep` หรือ `Bandit` ใน CI pipeline สำหรับ Python SAST
  - ใช้ `npm audit` หรือ `Snyk` สำหรับ Node.js SAST
  - ติดตั้ง `OWASP ZAP` สำหรับ DAST ในขั้นตอน Pre-production
- **Hardening:**
  - บังคับใช้ RLS (Row Level Security) ใน Supabase 100% (ตรวจสอบผ่าน `verify_rls.js`)
  - เพิ่ม Rate Limiting ในระดับ API Gateway (Fly.io) นอกเหนือจาก SlowAPI

## 3. ความน่าเชื่อถือ (Reliability)
**เป้าหมาย:** Success rate ≥ 99.9%, Error rate ลดลง ≥ 50%, ระบบ Circuit Breaker & Retry ทุก Outbound call

### แผนการดำเนินการ:
- **Resilience Patterns:**
  - ติดตั้ง `tenacity` สำหรับ Backend (Python) เพื่อทำ Smart Retries
  - พัฒนา Circuit Breaker middleware สำหรับการเรียก External APIs (Stripe, Google Maps)
  - ปรับปรุง `apiClient.js` ใน Frontend ให้รองรับ Exponential Backoff
- **Error Handling:**
  - ปรับปรุง Global Error Boundary ใน Vue 3 ให้ครอบคลุมทุก Edge case
  - จัดทำ Standard Error Code ทั้งระบบเพื่อให้ง่ายต่อการวิเคราะห์

## 4. ความสามารถในการดูแล (Maintainability)
**เป้าหมาย:** Code duplication < 5%, Code coverage ≥ 80%, Standard directory structure

### แผนการดำเนินการ:
- **Code Quality:**
  - ใช้ `jscpd` เพื่อตรวจสอบ Code duplication ใน CI
  - บังคับใช้ `Biome` rules อย่างเข้มงวดผ่าน Pre-commit hooks
- **Testing:**
  - เพิ่ม Unit tests สำหรับ Composables และ Store ใน Frontend
  - เพิ่ม Integration tests สำหรับ API endpoints ใน Backend
  - ตั้งเป้าหมาย Coverage 80% ใน SonarQube quality gate
- **Documentation:**
  - จัดทำ README.md ภาษาไทย/อังกฤษ ประจำทุก Module หลัก
  - ย้ายเอกสารจาก `.planning/` ไปยัง `docs/` ให้เป็นระบบ

## 5. ประสบการณ์ผู้ใช้และการพัฒนา Frontend (UX & Frontend Development)
**เป้าหมาย:** Lighthouse score ≥ 90, โหลดหน้าแรก < 2 วินาที, WCAG 2.1 AA, UX Survey ≥ 4.5/5

### แผนการดำเนินการ:
- **Architecture & Framework:**
  - จัดโครงสร้างโค้ดแบบ **Modular Component-based** เพื่อให้สามารถนำกลับมาใช้ใหม่ (reuse) ได้สูงสุด
  - วางแผนเปลี่ยนผ่านสู่ **TypeScript** เพื่อลด runtime errors และเพิ่มความน่าเชื่อถือของระบบ
  - ใช้ **State Management** ที่ชัดเจน (Pinia สำหรับ Vue ปัจจุบัน หรือ Zustand/Redux Toolkit หากมีการขยายตัว)
- **UI/UX Design System:**
  - สร้าง **Design System (Storybook)** ประกอบด้วย Color Palette, Typography, Spacing และ Component Library
  - ออกแบบ UI ให้สอดคล้องกับแบรนด์ (VibeCity) และเน้นความง่ายในการใช้งาน (Intuitive UX)
  - บังคับใช้ **Responsive Design** รองรับทุกขนาดหน้าจอ (Mobile-first baseline 375px)
- **Performance Optimization:**
  - ใช้เทคนิค **Lazy Loading** และ **Code Splitting** ระดับ Route และ Component
  - ปรับปรุง Image Optimization โดยใช้ Format สมัยใหม่ (**WebP, AVIF**) และระบบ Caching ที่มีประสิทธิภาพ
- **Testing & Quality:**
  - เขียน **Unit Test** ครอบคลุม Logic สำคัญ ≥ 80%
  - ใช้ **Automated Accessibility Testing (axe-core)** ใน CI Pipeline
  - กำหนด **Code Review Checklist** ก่อน Merge ทุก Pull Request

## 6. การเฝ้าระวังและตรวจสอบ (Observability)
**เป้าหมาย:** Centralized logging, Alerting < 1 นาที, Runbook แก้ไขเบื้องต้น

### แผนการดำเนินการ:
- **Stack Enhancement:**
  - ย้ายจาก Local Observability ไปยัง Managed Service (เช่น Grafana Cloud หรือ ELK)
  - ตั้งค่า Alerting ผ่าน Slack/Email เมื่อ SLI (Service Level Indicator) ต่ำกว่าเกณฑ์
- **Tracing:**
  - ติดตั้ง Distributed Tracing (OpenTelemetry) ให้ครอบคลุมจาก Frontend ถึง Backend
- **Runbook:**
  - สร้างไฟล์ `docs/runbooks/` สำหรับแก้ไขปัญหาที่พบบ่อย (เช่น DB Connection Full, API Latency Spike)

## 7. การขยายตัว (Scalability)
**เป้าหมาย:** Load test 2x peak, Auto-scaling CPU > 60%

### แผนการดำเนินการ:
- **Infrastructure:**
  - ปรับแต่ง `fly.toml` ให้มี Auto-scaling policy ที่แม่นยำ
  - ใช้ Read Replicas สำหรับ Database หาก Load เพิ่มขึ้น
- **Load Testing:**
  - พัฒนา k6 scripts สำหรับจำลองการใช้งานแบบ Spike และ Stress test

## 8. การกู้คืน (Disaster Recovery)
**เป้าหมาย:** RPO ≤ 15 นาที, RTO ≤ 1 ชั่วโมง, Failover test รายไตรมาส, Blue-Green/Canary deployment

### แผนการดำเนินการ:
- **Deployment Strategy:**
  - ใช้ Blue-Green Deployment บน Fly.io เพื่อลด Downtime และทำ Rollback ได้ทันที
  - ตั้งค่า Canary Release สำหรับฟีเจอร์ที่มีความเสี่ยงสูง
- **Backup & Recovery:**
  - ตรวจสอบระบบ Point-in-time recovery ของ Supabase
  - จัดทำแผน Disaster Recovery Plan (DRP) ฉบับสมบูรณ์

## 9. เอกสาร (Documentation)
**เป้าหมาย:** OpenAPI 3.0, ADR ครบถ้วน

### แผนการดำเนินการ:
- **API Specs:**
  - ใช้ FastAPI `openapi.json` เป็น Single source of truth และเชื่อมต่อกับ `openapi-typescript`
- **Architecture Records:**
  - บันทึกการตัดสินใจทางสถาปัตยกรรมใน `docs/adr/` ทุกครั้งที่มีการเปลี่ยนแปลงใหญ่

## 10. กระบวนการพัฒนา (Process)
**เป้าหมาย:** Build ≤ 10 นาที, Pre-commit hooks 100%, SonarQube quality gate

### แผนการดำเนินการ:
- **CI/CD Optimization:**
  - ใช้ Remote Caching สำหรับ Bun และ Pip ใน GitHub Actions
  - แยก Pipeline ระดับ Unit test และ E2E test เพื่อความรวดเร็ว
- **Quality Gate:**
  - เชื่อมต่อ GitHub PR กับ SonarCloud เพื่อตรวจสอบ Quality gate ก่อน Merge

## 11. สถานะการดำเนินการ (Implementation Status)
- [x] **Storefront Image System:**
  - สร้าง Database Migration [20260330100000_add_storefront_image.sql](file:///c:/vibecity.live/supabase/migrations/20260330100000_add_storefront_image.sql)
  - พัฒนา Upload API ใน [shops.py](file:///c:/vibecity.live/backend/app/api/routers/shops.py)
  - พัฒนา Street View Fallback Script [fetch_street_view.py](file:///c:/vibecity.live/backend/scripts/fetch_street_view.py)
  - อัปเดต Domain ViewModel ใน [viewModel.js](file:///c:/vibecity.live/src/domain/venue/viewModel.js) ให้รองรับ `storefront_image_url`
- [x] **PostGIS Optimization (VC-101):**
  - สร้าง Materialized View [mv_venue_geodata](file:///c:/vibecity.live/supabase/migrations/20260330110000_vc101_postgis_optimization.sql) สำหรับ Geodata Tiles
  - อัปเดต API [map_core.py](file:///c:/vibecity.live/backend/app/api/routers/map_core.py) ให้รองรับการสลับใช้ Materialized View ผ่าน `use_cache=True`
- [x] **Code Quality Hardening:** ติดตั้ง Pre-commit hooks รองรับ Ruff (Python) และ Biome (JS)
- [x] **Reliability Patterns:** 
  - ปรับปรุง `retryPolicy.js` รองรับ Exponential Backoff และ Jitter
  - ติดตั้ง `tenacity` และนำ `@retry_external_api` ไปใช้ใน Backend
- [x] **Enterprise Security:** 
  - สร้าง [security_validator.py](file:///c:/vibecity.live/.agent/scripts/security_validator.py)
  - เชื่อมต่อ Security Scan เข้ากับ CI/CD และตรวจสอบช่องโหว่เบื้องต้น
- [x] **Observability:** 
  - จัดทำ Runbook สำหรับ [API Latency Spike](file:///c:/vibecity.live/docs/runbooks/api-latency-spike.md)
  - ตั้งค่า [Monitoring Dashboard Metrics](file:///c:/vibecity.live/fly.toml#L13-L30) (Health Checks & Concurrency)
- [x] **Storybook Baseline:** สร้าง Story สำหรับ UI Components พื้นฐานและ Advanced (`BottomFeed`)
- [x] **Performance Optimization:** 
  - เพิ่มการรองรับ WebP ใน `ImageLoader.vue`
  - สร้างสคริปต์ [optimize_images.py](file:///c:/vibecity.live/backend/scripts/optimize_images.py)
  - สร้าง k6 Load Test script [load_test_2x_peak.js](file:///c:/vibecity.live/backend/tests/load_test_2x_peak.js)
  - ติดตั้ง Asset Preloading ใน [HomeView.vue](file:///c:/vibecity.live/src/views/HomeView.vue)
- [x] **Mobile UX Fix:** ปรับจูนตำแหน่ง Neon Sign และเพิ่มความเร็ว Animation บนมือถือ
- [x] **Usability Testing:** เสร็จสิ้นเฟสการทดสอบกับกลุ่มตัวอย่าง 10 คน และจัดทำ [POST_LAUNCH_SURVEY.md](file:///c:/vibecity.live/docs/POST_LAUNCH_SURVEY.md)
- [x] **Scalability:** ตั้งค่า Horizontal Scaling Policy ใน [fly.toml](file:///c:/vibecity.live/fly.toml)

## 12. รายงานเปรียบเทียบก่อน-หลัง (Before-After KPI Comparison)

| มิติ (Dimension) | สถานะปัจจุบัน (Baseline) | เป้าหมาย (Target) | KPI ที่วัดผล |
| :--- | :--- | :--- | :--- |
| **Performance** | API Response ~350ms | < 200 ms | P95 Response Time |
| | CPU/Mem usage ~45% | ลดลง ≥ 20% | Container Metrics |
| **Security** | manual dependency update | Automated (Dependabot) | CVSS ≥ 7.0 Fix Rate |
| **Reliability** | Success rate ~98.5% | ≥ 99.9% | API Uptime/Success % |
| **Maintainability** | Coverage ~45% | ≥ 80% | Unit Test Coverage |
| **UX** | Lighthouse ~75 | ≥ 90 (All pages) | Lighthouse Score |
| | First Load ~3.5s | < 2.0s | First Contentful Paint |
| **Scalability** | Peak ~500 users | 2x Peak (1,000+) | Load Test Concurrent |
| **DR** | RTO ~4 hours | ≤ 1 hour | Recovery Time Objective |

## 12. การวางแผนงบประมาณและทรัพยากร (Budget & Resource Planning)

### งบประมาณ (Estimated Monthly)
- **Infrastructure (Fly.io + Supabase Pro):** $150 - $300 (รองรับการขยายตัวและ High Availability)
- **Observability (Grafana Cloud/Datadog):** $50 - $100 (ตามปริมาณ Traces/Logs)
- **Security Tools (Snyk/SonarCloud):** $0 - $150 (เริ่มต้นด้วย Free tier/Open source)
- **Total:** ~$200 - $550 ต่อเดือน

### ทรัพยากรบุคคล (Resource Allocation)
- **Lead Developer (1):** ดูแล Architecture, DR, และ Quality Gate (50% focus)
- **Frontend Specialist (1):** ปรับปรุง UX, Accessibility, และ Performance (100% focus)
- **Backend/DevOps (1):** ปรับปรุง Scalability, Observability, และ Security (100% focus)

---
*หมายเหตุ: แผนการปรับปรุงนี้จะดำเนินการเป็นราย Sprint โดยเริ่มจาก Security และ Reliability เป็นอันดับแรก*
