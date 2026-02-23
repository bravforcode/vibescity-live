# Codebase Audit & Quality Rating Matrix
## UI/UX & Accessibility Review Scorecard

### Findings (Web Interface Guidelines format)

## src/App.vue
src/App.vue:62 - transition: all → ระบุ property เฉพาะ
## src/assets/css/main.postcss
src/assets/css/main.postcss:140 - transition: all → ระบุ property เฉพาะ
src/assets/css/main.postcss:437 - transition: all → ระบุ property เฉพาะ
## src/assets/map-atmosphere.css
src/assets/map-atmosphere.css:19 - animation ไม่มี prefers-reduced-motion
## src/assets/vibe-animations.css
src/assets/vibe-animations.css:12 - animation ไม่มี prefers-reduced-motion
## src/components/dashboard/BuyPinsPanel.vue
src/components/dashboard/BuyPinsPanel.vue:140 - ปุ่มไอคอนไม่มี aria-label
src/components/dashboard/BuyPinsPanel.vue:172 - input ไม่มี label/aria-label + autocomplete/type
## src/components/dashboard/OwnerDashboard.vue
src/components/dashboard/OwnerDashboard.vue:148 - “Loading...” → “Loading…”
## src/components/dashboard/SubscriptionManager.vue
src/components/dashboard/SubscriptionManager.vue:71 - “Loading...” → “Loading…”
## src/components/design-system/compositions/PlaceCard.vue
src/components/design-system/compositions/PlaceCard.vue:56 - ปุ่มไอคอนไม่มี aria-label
src/components/design-system/compositions/PlaceCard.vue:114 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
## src/components/feed/BottomFeed.vue
src/components/feed/BottomFeed.vue:495 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:544 - ปุ่มไอคอนไม่มี aria-label
src/components/feed/BottomFeed.vue:645 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:699 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:813 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
src/components/feed/BottomFeed.vue:1290 - transition: all → ระบุ property เฉพาะ
## src/components/feed/ImmersiveFeed.vue
src/components/feed/ImmersiveFeed.vue:100 - overlay/โมดัลขาด role="dialog"/aria-modal
src/components/feed/ImmersiveFeed.vue:106 - img ไม่มี alt
src/components/feed/ImmersiveFeed.vue:130 - ปุ่มไอคอนไม่มี aria-label
## src/components/layout/SideBar.vue
src/components/layout/SideBar.vue:601 - transition: all → ระบุ property เฉพาะ
## src/components/layout/SmartHeader.vue
src/components/layout/SmartHeader.vue:1192 - transition: all → ระบุ property เฉพาะ
## src/components/map/MapboxContainer.vue
src/components/map/MapboxContainer.vue:2756 - transition: all → ระบุ property เฉพาะ
## src/components/modal/EditVenueModal.vue
src/components/modal/EditVenueModal.vue:50 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/EditVenueModal.vue:63 - ปุ่มไอคอนไม่มี aria-label
src/components/modal/EditVenueModal.vue:117 - “Saving...” → “Saving…”
## src/components/modal/FavoritesModal.vue
src/components/modal/FavoritesModal.vue:51 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/FavoritesModal.vue:158 - transition: all → ระบุ property เฉพาะ
## src/components/modal/MallDrawer.vue
src/components/modal/MallDrawer.vue:269 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/MallDrawer.vue:278 - img ไม่มี alt
src/components/modal/MallDrawer.vue:292 - ปุ่มไอคอนไม่มี aria-label
src/components/modal/MallDrawer.vue:436 - input ไม่มี label/aria-label
src/components/modal/MallDrawer.vue:520 - img ไม่มี alt
src/components/modal/MallDrawer.vue:556 - img ไม่มี alt
src/components/modal/MallDrawer.vue:599 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
src/components/modal/MallDrawer.vue:622 - img ไม่มี alt
## src/components/modal/ProfileDrawer.vue
src/components/modal/ProfileDrawer.vue:155 - drawer ขาด role="dialog"/aria-modal
src/components/modal/ProfileDrawer.vue:276 - “Loading...” → “Loading…”
## src/components/modal/VibeModal.vue
src/components/modal/VibeModal.vue:716 - โมดัลขาด role="dialog"/aria-modal
src/components/modal/VibeModal.vue:1034 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
src/components/modal/VibeModal.vue:1420 - transition: all → ระบุ property เฉพาะ
## src/components/panel/MerchantRegister.vue
src/components/panel/MerchantRegister.vue:3 - โมดัลขาด role="dialog"/aria-modal
src/components/panel/MerchantRegister.vue:21 - ปุ่มไอคอนไม่มี aria-label
src/components/panel/MerchantRegister.vue:34 - input ไม่มี label/aria-label + autocomplete
src/components/panel/MerchantRegister.vue:262 - “Uploading...” → “Uploading…”
src/components/panel/MerchantRegister.vue:273 - “Submitting...” → “Submitting…”
## src/components/panel/ShopCard.vue
src/components/panel/ShopCard.vue:124 - div คลิกได้ควรเป็น button/ลิงก์ + รองรับคีย์บอร์ด
## src/components/system/AppModals.vue
src/components/system/AppModals.vue:161 - loading overlay ขาด role="status"/aria-live
src/components/system/AppModals.vue:184 - “Synchronizing Vibe Engine...” → “Synchronizing Vibe Engine…”
src/components/system/AppModals.vue:214 - ปุ่มไอคอนไม่มี aria-label
src/components/system/AppModals.vue:264 - transition: all → ระบุ property เฉพาะ
## src/components/transport/RideComparisonModal.vue
src/components/transport/RideComparisonModal.vue:45 - โมดัลขาด role="dialog"/aria-modal
src/components/transport/RideComparisonModal.vue:69 - ปุ่มไอคอนไม่มี aria-label
src/components/transport/RideComparisonModal.vue:88 - “Finding drivers...” → “Finding drivers…”
src/components/transport/RideComparisonModal.vue:104 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
## src/components/ugc/AddShopModal.vue
src/components/ugc/AddShopModal.vue:2 - โมดัลขาด role="dialog"/aria-modal
src/components/ugc/AddShopModal.vue:17 - ปุ่มไอคอนไม่มี aria-label
src/components/ugc/AddShopModal.vue:110 - input URL ควรใช้ type="url" + autocomplete
## src/components/ugc/EditShopModal.vue
src/components/ugc/EditShopModal.vue:2 - โมดัลขาด role="dialog"/aria-modal
src/components/ugc/EditShopModal.vue:17 - ปุ่มไอคอนไม่มี aria-label
src/components/ugc/EditShopModal.vue:105 - input URL ควรใช้ type="url" + autocomplete
## src/components/ui/AchievementBadges.vue
src/components/ui/AchievementBadges.vue:184 - transition: all → ระบุ property เฉพาะ
## src/components/ui/BottomNav.vue
src/components/ui/BottomNav.vue:51 - tab ต้องมี role="tablist" + aria-selected
## src/components/ui/ConsentBanner.vue
src/components/ui/ConsentBanner.vue:3 - แบนเนอร์ขาด role="dialog"/aria-describedby
src/components/ui/ConsentBanner.vue:66 - transition: all → ระบุ property เฉพาะ
## src/components/ui/CouponModal.vue
src/components/ui/CouponModal.vue:2 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/CouponModal.vue:26 - “Claiming...” → “Claiming…”
## src/components/ui/DailyCheckin.vue
src/components/ui/DailyCheckin.vue:129 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/DailyCheckin.vue:191 - “Loading...” → “Loading…”
src/components/ui/DailyCheckin.vue:252 - transition: all → ระบุ property เฉพาะ
## src/components/ui/FilterMenu.vue
src/components/ui/FilterMenu.vue:388 - transition: all → ระบุ property เฉพาะ
## src/components/ui/LuckyWheel.vue
src/components/ui/LuckyWheel.vue:127 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/LuckyWheel.vue:331 - transition: all → ระบุ property เฉพาะ
## src/components/ui/OnboardingTour.vue
src/components/ui/OnboardingTour.vue:99 - โมดัลขาด role="dialog"/aria-modal
## src/components/ui/PhotoGallery.vue
src/components/ui/PhotoGallery.vue:93 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/PhotoGallery.vue:114 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/PhotoGallery.vue:122 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/PhotoGallery.vue:158 - img ไม่มี alt
src/components/ui/PhotoGallery.vue:201 - transition: all → ระบุ property เฉพาะ
## src/components/ui/RelatedShopsDrawer.vue
src/components/ui/RelatedShopsDrawer.vue:39 - drawer ขาด role="dialog"/aria-modal
src/components/ui/RelatedShopsDrawer.vue:55 - ปุ่มไอคอนไม่มี aria-label
src/components/ui/RelatedShopsDrawer.vue:65 - div คลิกได้ควรเป็น button + รองรับคีย์บอร์ด
## src/components/ui/ReviewSystem.vue
src/components/ui/ReviewSystem.vue:144 - ปุ่มดาวไม่มี aria-label/aria-pressed
src/components/ui/ReviewSystem.vue:148 - outline-none ไม่มี focus-visible
src/components/ui/ReviewSystem.vue:178 - “Share the vibe...” → “Share the vibe…”
src/components/ui/ReviewSystem.vue:286 - transition: all → ระบุ property เฉพาะ
## src/components/ui/SafetyPanel.vue
src/components/ui/SafetyPanel.vue:91 - โมดัลขาด role="dialog"/aria-modal
src/components/ui/SafetyPanel.vue:238 - transition: all → ระบุ property เฉพาะ
## src/components/ui/SidebarDrawer.vue
src/components/ui/SidebarDrawer.vue:137 - drawer ขาด role="dialog"/aria-modal
src/components/ui/SidebarDrawer.vue:170 - ปุ่มไอคอนไม่มี aria-label
## src/components/ui/VibeNotification.vue
src/components/ui/VibeNotification.vue:65 - transition: all → ระบุ property เฉพาะ
## src/i18n.js
src/i18n.js:6 - “...” → “…”
## src/locales/en.json
src/locales/en.json:3 - “...” → “…”
## src/locales/th.json
src/locales/th.json:3 - “...” → “…”
## src/utils/mapRenderer.js
src/utils/mapRenderer.js:108 - “...” → “…”
src/utils/mapRenderer.js:123 - img ไม่มี alt
src/utils/mapRenderer.js:133 - ปุ่มไอคอนไม่มี aria-label
## src/views/AdminView.vue
src/views/AdminView.vue:9 - “Loading...” → “Loading…”
src/views/AdminView.vue:114 - input ไม่มี label/aria-label + autocomplete

### Rating Matrix (All Files)

| File | Rating | Recommendations |
| --- | --- | --- |
| `.env.example` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `Procfile` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `fly.toml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `package.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `postcss.config.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `playwright.config.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `Dockerfile` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `bun.lock` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `biome.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `firebase.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `nul` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `knip.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `sonar-project.properties` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `vitest.config.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `vite.config.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `vibecity_zero_loss_patch.diff` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `vercel.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `QUICKSTART.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `PR_CHECKLIST.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `review.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `requirements.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `runtime.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `api/index.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `audit/pentest_checklist.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `e2e/example.spec.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/diagnose.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/debug_main.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/debug_config.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/run_backend.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/requirements.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/requirements-dev.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/pyproject.toml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `k6-tests/spike-test.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `k6-tests/realistic-load.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `public/sw.js` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/manifest.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/index.html` | A | ตรวจว่า skip-link ชี้ไป #main-content ได้จริง; ตรวจ meta/OG ให้ครบถ้วนและสอดคล้อง |
| `observability/tempo.yaml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `observability/prometheus.yml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `observability/otel-collector-config.yaml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/TESTSPRITE_MANUAL.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/system-audit-remediation.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/sql-editor-hardening.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/slip-verification.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/verify-supabase.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/update-schema-analytics.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/supabase_geo_setup.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/seed_thailand_data.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/db/schema.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/db/rpc.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/constraints-production.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/check_pydantic.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/__pycache__/__init__.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/__init__.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/migrate-to-supabase.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/master-data-recovery.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/loki_mode_schema.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/list-tables.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backup/legacy_data/events.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/healthcheck-slip.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/fix-rls-permissions.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/check-runtime-env.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/chaos-slip-test.sh` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/import_osm.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/import-csv-to-supabase.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/junit-to-sonar-generic.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/seed-thailand-77-provinces.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/seed-massive-thailand.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/seed-database.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/road-lanes.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tests/unit/shopUtils.spec.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `k6-tests/lib/summary-report.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `k6-tests/chaos-test.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/sql-editor-hardening/phase-d-verify.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/sql-editor-hardening/phase-b-fixes.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/sql-editor-hardening/phase-a-audit.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `public/data/thailand-provinces.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/data/events.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/data/chiang-mai-leaflet.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/data/chiang-mai-boundary.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `docs/runbooks/2026-02-05-prod-one-shot.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/railway-24x7-setup.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/observability.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/observability-stack.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/knip-triage.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/fly-24x7-setup.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/deployment-matrix.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/DATABASE-SETUP.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `docs/AUDIT_UX_UI.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_config.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_auth.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/manual_test.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/conftest.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260207120000_prod_uuid_unification_delta.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260207110000_gamification_persistence.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260206100010_analytics_partition_retention.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260206100000_map_effects_hotspot_cache.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205100000_unification_fix.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205090000_view_security_invoker.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205061000_healthcheck_cron.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205060000_slip_audit_and_healthcheck.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205050000_apply_entitlement_logic.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205040000_advanced_subscriptions.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205033000_visitor_auth_and_stats.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260205000000_comprehensive_rls_security.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204100000_final_polish.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204099999_master_fix.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204050000_enrichment.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204040000_fix_schema_unification.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204030000_cron_jobs.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204020200_rpc_expire_entitlements.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204020100_rpc_apply_entitlements.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204010300_rpc_promote_to_giant.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204010200_rpc_get_map_pins.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204010100_rpc_get_feed_cards.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204000400_coin_ledger.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204000300_analytics.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204000200_orders_and_payments.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260204000100_pins_and_entitlements.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/20260202_osm_data_support.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/012_rpc_apply_entitlement.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/011_rls_payment.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/010_analytics_indexes.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/009_public_views.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/migrations/008_payment_idempotency_and_entitlements.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/release/prod-one-shot.ps1` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/k6/report.mjs` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/seed-thailand-master.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/seed-thailand-complete.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/set-supabase-secrets.sh` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/setup-db-webhooks.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tailwind.config.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_ugc.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_payments.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_owner.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_metrics.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_health.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_config.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/test_auth.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/manual_test.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/__pycache__/conftest.cpython-312-pytest-9.0.2.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_ugc.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_payments.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_owner.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_metrics.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/tests/test_health.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/README-database.md` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/sql/sql_editor_runlist_20260206.sql` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tests/e2e/mobile-interactions.spec.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tests/e2e/map_flow.spec.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tests/e2e/enterprise-features.spec.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tests/e2e/smoke.spec.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `tests/e2e/vibe_check.spec.js` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/config.toml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/main.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `public/images/pins/Vlive.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-red.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-red.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-purple.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-purple.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-gray.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-gray.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-blue.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/pins/pin-blue.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `observability/grafana/dashboards/vibecity-api.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/scripts/workers.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/scripts/osm_sync_ultimate.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/scripts/osm_scraper.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/scripts/ocr_worker.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/scripts/data_pipeline.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `public/images/logo/bolt.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/logo/grab.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `backend/app/__pycache__/__init__.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/__pycache__/main.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/__init__.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `public/images/animation/Fake 3D vector coin.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `public/images/animation/Google.geminicodeassist-2.69.0.vsix` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `scripts/release/config/migration-delta-allowlist.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/release/config/function-allowlist.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `scripts/release/config/required-supabase-secrets.txt` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/main.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `public/images/menu/icons8-menu.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในหน้าเว็บ |
| `observability/grafana/provisioning/dashboards/dashboards.yaml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `observability/grafana/provisioning/datasources/datasources.yaml` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/sw.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/style.css` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/locales/th.json` | A | ใช้ ellipsis “…” แทน “...” ในข้อความ |
| `src/locales/en.json` | A | ใช้ ellipsis “…” แทน “...” ในข้อความ |
| `src/store/userStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/userPreferencesStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/shopStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/roomStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/locationStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/index.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/favoritesStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/store/coinStore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/router/index.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `backend/app/api/__init__.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/views/HomeView.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/views/AdminView.vue` | B | เพิ่ม label/aria-label + autocomplete ให้ช่องค้นหา; “Loading...” → “Loading…” |
| `backend/app/core/models.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/metrics.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/logging.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/config.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/auth.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/rate_limit.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/otel.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/observability.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/supabase.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__init__.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/ocr_queue.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/notifications.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/emergency_service.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/types.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/plugins/queryClient.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/geoService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/gamificationService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/eventService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/emergencyService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/DeepLinkService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/analyticsService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/adminService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/redemptionService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/realTimeDataService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/placesService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/paymentService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/shopService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/sheetsService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/services/socketService.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/schemas/index.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `backend/app/api/__pycache__/__init__.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/stories/header.css` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/Configure.mdx` | S | ไฟล์ระบบ/ลอจิก ไม่เกี่ยว UI/UX โดยตรง |
| `src/stories/Button.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/Button.stories.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/button.css` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `backend/app/core/__pycache__/__init__.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/supabase.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/rate_limit.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/otel.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/observability.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/models.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/metrics.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/logging.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/config.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/core/__pycache__/auth.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/__pycache__/emergency_service.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/slip_verification.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/shop_service.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/ride_service.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/__pycache__/ocr_queue.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/__pycache__/notifications.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/__pycache__/ride_service.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/services/__pycache__/shop_service.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/stories/SwipeCard.stories.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/Page.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/Page.stories.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/page.css` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/Header.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/stories/Header.stories.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/lib/supabase.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/lib/runtimeConfig.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/i18n.js` | A | ใช้ ellipsis “…” แทน “...” ในข้อความ |
| `src/utils/storageHelper.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/utils/shopUtils.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/utils/osmRoads.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/utils/mapRenderer.js` | B | ใส่ alt ให้ <img>; ปุ่มปิดเพิ่ม aria-label; ใช้ “…” ในการตัดข้อความ |
| `src/utils/linkHelper.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/utils/browserUtils.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `backend/app/api/routers/redemption.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/payments.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/owner.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/emergency.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/analytics.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/admin.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/ugc.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/shops.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/rides.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__init__.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/vibes.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/models/__init__.py` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/admin-slip-export/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/analytics-ingest/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/create-manual-order/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/create-manual-order/gcv.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/create-manual-order/slip-parser.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/admin-slip-dashboard/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/manage-subscription/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/handlers/analytics.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/deno.json` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/handlers/payment.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/handlers/database.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/webhook-handler/handlers/userAction.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/stories/assets/youtube.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/tutorials.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/theming.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/testing.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/styling.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/share.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/github.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/figma-plugin.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/docs.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/discord.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/context.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/avif-test-image.avif` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/assets.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/addon-library.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/accessibility.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/stories/assets/accessibility.png` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/i18n/index.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/App.vue` | A | เปลี่ยน transition: all เป็น property เฉพาะ; รองรับ prefers-reduced-motion |
| `supabase/functions/coin-action/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/create-checkout-session/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/redemption.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/payments.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/owner.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/emergency.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/analytics.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/admin.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/ugc.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/shops.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/rides.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/vibes.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `backend/app/api/routers/__pycache__/__init__.cpython-312.pyc` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/get-order-status/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/stripe-webhook/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `supabase/functions/easyslip-healthcheck/index.ts` | S | ไฟล์ระบบ/เอกสาร/สคริปต์ ไม่เกี่ยว UI/UX โดยตรง |
| `src/constants/filterCategories.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/constants/zIndex.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/design-system/tailwind.preset.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/assets/map-atmosphere.css` | B | เพิ่ม @media (prefers-reduced-motion: reduce) เพื่อลด/ปิดแอนิเมชันต่อเนื่อง |
| `src/assets/vibe-animations.css` | B | เพิ่ม @media (prefers-reduced-motion: reduce) เพื่อลด/ปิดแอนิเมชัน |
| `src/assets/vue.svg` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/composables/useLocation.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useIdle.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useHomeBase.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useHaptics.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useGestures.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useEventLogic.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useDragScroll.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useBodyScrollLock.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useAudioSystem.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useAppLogic.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useAnalytics.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useSmartVideo.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useShopFilters.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useScrollSync.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/usePerformance.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useNotifications.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useMapLogic.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useTransportLogic.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useTimeTheme.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useStripe.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useVibeEffects.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useUILogic.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/useVirtualList.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/directives/testid.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/directives/vHaptic.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/map/useMapLayers.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/assets/css/main.postcss` | A | เลี่ยง transition: all; ระบุ property เฉพาะให้ชัด |
| `src/composables/map/useMapMarkers.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/map/useMapNavigation.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/composables/map/useMapCore.js` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/assets/animations/coin.json` | S | ไฟล์แอสเซ็ต/ข้อมูล ไม่เกี่ยว UI/UX โดยตรง; ตรวจการใช้งานในคอมโพเนนต์ |
| `src/components/feed/ImmersiveFeed.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; ใส่ alt ให้ภาพพื้นหลัง; ปุ่มย้อนกลับเพิ่ม aria-label |
| `src/components/feed/BottomFeed.vue` | C | เปลี่ยน div คลิกได้เป็น button/ลิงก์หรือเพิ่มคีย์บอร์ด; เพิ่ม aria-label ให้ปุ่มไอคอน; เลี่ยง transition: all |
| `src/components/modal/MallDrawer.vue` | C | เพิ่ม role="dialog"/aria-modal; ใส่ alt ให้รูป; input ใส่ label/aria-label; ปุ่มปิดเพิ่ม aria-label; เปลี่ยนรายการคลิกได้เป็น button |
| `src/components/modal/FavoritesModal.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; เลี่ยง transition: all |
| `src/components/modal/EditVenueModal.vue` | B | เพิ่ม role="dialog"/aria-modal; ปุ่มปิดเพิ่ม aria-label; “Saving...” → “Saving…” |
| `src/components/modal/ProfileDrawer.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; “Loading...” → “Loading…” |
| `src/components/modal/VibeModal.vue` | C | เพิ่ม role="dialog"/aria-modal + focus trap; เปลี่ยน div คลิกได้เป็น button; เลี่ยง transition: all |
| `src/components/layout/SideBar.vue` | A | เลี่ยง transition: all; ระบุ property เฉพาะ |
| `src/components/layout/SmartHeader.vue` | A | เลี่ยง transition: all; ระบุ property เฉพาะ |
| `src/components/panel/MerchantStats.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/panel/MerchantRegister.vue` | B | เพิ่ม role="dialog"/aria-modal; ปุ่มปิดเพิ่ม aria-label; ใส่ label/aria-label + autocomplete ให้ช่องกรอก; “Uploading...”/“Submitting...” → “…” |
| `src/components/panel/ShopCard.vue` | B | เปลี่ยน div คลิกได้เป็น button/ลิงก์หรือเพิ่มคีย์บอร์ด |
| `src/components/panel/VideoPanel.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/system/AppModals.vue` | B | เพิ่ม role="status"/aria-live ให้โหลด; ปุ่มปิดเพิ่ม aria-label; เลี่ยง transition: all; “Synchronizing...” → “…” |
| `src/components/system/PortalLayer.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/PullToRefresh.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/PhotoGallery.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; ปุ่มลูกศรเพิ่ม aria-label; ใส่ alt ให้ thumbnail; เลี่ยง transition: all |
| `src/components/ui/OnboardingTour.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; เคารพ prefers-reduced-motion |
| `src/components/ui/LuckyWheel.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; เลี่ยง transition: all |
| `src/components/ui/LottieCoin.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/Leaderboard.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/LanguageToggle.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/HeartPop.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/FilterMenu.vue` | A | เลี่ยง transition: all; ระบุ property เฉพาะ |
| `src/components/ui/DailyCheckin.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; “Loading...” → “Loading…”; เลี่ยง transition: all |
| `src/components/ui/CouponModal.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; “Claiming...” → “Claiming…” |
| `src/components/ui/ConsentBanner.vue` | B | เพิ่ม role="dialog"/aria-describedby + จัดการโฟกัส; เลี่ยง transition: all |
| `src/components/ui/ConfettiEffect.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/BottomNav.vue` | B | เพิ่ม role="tablist" และ aria-selected ให้แท็บ; ตรวจโฟกัสคีย์บอร์ด |
| `src/components/ui/AchievementBadges.vue` | A | เลี่ยง transition: all; ระบุ property เฉพาะ |
| `src/components/ui/SOSPanel.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/SkeletonCard.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/SidebarDrawer.vue` | B | เพิ่ม role="dialog"/aria-modal; ปุ่มปิดเพิ่ม aria-label |
| `src/components/ui/SettingsPanel.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/SafetyPanel.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; เลี่ยง transition: all |
| `src/components/ui/ReviewSystem.vue` | B | เพิ่ม aria-label/aria-pressed ให้ดาว; ใส่ focus-visible; “...” → “…”; เลี่ยง transition: all |
| `src/components/ui/RelatedShopsDrawer.vue` | B | เพิ่ม role="dialog"/aria-modal; ปุ่มปิดเพิ่ม aria-label; เปลี่ยน div คลิกได้เป็น button |
| `src/components/ui/ReferralShare.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/VibeError.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/TiltCard.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/SwipeCard.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/SplashScreen.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/VibeSkeleton.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/ui/VibeNotification.vue` | A | เลี่ยง transition: all; ระบุ property เฉพาะ |
| `src/components/ui/VisitorCount.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/dashboard/OwnerDashboard.vue` | A | เปลี่ยน “Loading...” → “Loading…” |
| `src/components/dashboard/BuyPinsPanel.vue` | B | เพิ่ม aria-label ให้ปุ่มปิด; ใส่ label/aria-label + autocomplete/type/inputmode ให้ช่องกรอก |
| `src/components/dashboard/SubscriptionManager.vue` | A | เปลี่ยน “Loading...” → “Loading…” |
| `src/components/pwa/ReloadPrompt.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/transport/RideComparisonModal.vue` | B | เพิ่ม role="dialog"/aria-modal + โฟกัส; ปุ่มปิดเพิ่ม aria-label; เปลี่ยน div คลิกได้เป็น button; “Finding drivers...” → “Finding drivers…” |
| `src/components/map/LiveActivityChips.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/map/MapboxContainer.vue` | A | เลี่ยง transition: all; ระบุ property เฉพาะ |
| `src/components/ugc/AddShopModal.vue` | B | เพิ่ม role="dialog"/aria-modal; ปุ่มปิดเพิ่ม aria-label; ช่อง URL ใช้ type="url" + autocomplete |
| `src/components/ugc/EditShopModal.vue` | B | เพิ่ม role="dialog"/aria-modal; ปุ่มปิดเพิ่ม aria-label; ช่อง URL ใช้ type="url" + autocomplete |
| `src/components/design-system/compositions/BottomSheet.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/design-system/compositions/PlaceCard.vue` | B | ปุ่มไอคอนเพิ่ม aria-label; เปลี่ยน div คลิกได้เป็น button + รองรับคีย์บอร์ด |
| `src/components/design-system/primitives/ActionBtn.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
| `src/components/design-system/primitives/GlassCard.vue` | A | ไม่พบประเด็นเด่นจากการตรวจแบบสแตติก; แนะนำทดสอบคีย์บอร์ด/โฟกัสและ screen reader |
