# Knip Safe Triage (Frontend Baseline)

Date: 2026-02-05  
Scope: frontend only (`knip.json`)

Update: 2026-02-05 (evening rerun)
- `npm run knip`, `npm run knip:files`, `npm run knip:deps` executed again.
- Baseline still reports ~35 frontend files as unused (safe-mode: no bulk delete this round).
- `src/services/gamificationService.js`, `src/components/ui/DailyCheckin.vue`, `src/components/ui/LuckyWheel.vue` are still reported unused because they are not wired into the current Home runtime tree yet.

Update: 2026-02-08 (Week-1 P0 wiring)
- `src/services/gamificationService.js`, `src/components/ui/DailyCheckin.vue`, `src/components/ui/LuckyWheel.vue` are now wired into `src/views/HomeView.vue` through Sidebar Rewards actions.
- Knip package integrity in local workspace has been repaired and verification has been re-run:
  - `npm run knip`
  - `npm run knip:files`
  - `npm run knip:deps`
- Current baseline:
  - Unused files: 34
  - Unused dependencies: 11
  - Unused devDependencies: 2
  - `src/services/gamificationService.js`, `src/components/ui/DailyCheckin.vue`, `src/components/ui/LuckyWheel.vue` are no longer reported in the unused-files set.

## A) ใช้จริงแต่ Knip อาจมองไม่เห็น
- `src/components/modal/EditVenueModal.vue`
  - พบการเรียกใช้ใน template ของ `src/components/dashboard/OwnerDashboard.vue` แต่ยังไม่ได้ import แบบ explicit ใน `<script setup>`.
  - อาจเป็น runtime component lookup มากกว่าการ import ตรง ทำให้ Knip มองไม่เห็น.
- `src/main.js` และ `.storybook/main.js`
  - ถูกอ้างเป็น `entry` ซ้ำกับ plugin detection จึงมี config hint ว่า redundant entry.

## B) มีแนวโน้มเป็น dead code จริง (รอรอบ cleanup ถัดไป)
- กลุ่ม composables/services ที่ไม่ถูกอ้างจาก entry ปัจจุบัน:
  - `src/composables/useAnalytics.js`
  - `src/composables/useLocation.js`
  - `src/composables/useStripe.js`
  - `src/composables/useVirtualList.js`
  - `src/services/geoService.js`
  - `src/services/placesService.js`
  - `src/services/realTimeDataService.js`
  - `src/services/redemptionService.js`
  - `src/services/sheetsService.js`
  - `src/utils/osmRoads.js`
- กลุ่ม UI/Design-system ที่ยังไม่ถูก import จาก flow หลัก:
  - `src/components/dashboard/SubscriptionManager.vue`
  - `src/components/ui/BottomNav.vue`
  - `src/components/ui/CouponModal.vue`
  - `src/components/ui/Leaderboard.vue`
  - `src/components/ui/LottieCoin.vue`
  - `src/components/ui/OnboardingTour.vue`
  - `src/components/ui/PhotoGallery.vue`
  - `src/components/ui/ReferralShare.vue`
  - `src/components/ui/SplashScreen.vue`
  - `src/components/ui/TiltCard.vue`

## C) ต้องคุยทีมก่อนลบ/ย้าย เพราะโยงหลาย scope
- Dependencies ที่ Knip มองว่า unused ใน frontend baseline แต่บางตัวถูกใช้ใน scripts/ops หรือโค้ดนอก scope:
  - `csv-parser`, `dotenv` (ใช้ใน `scripts/**`)
  - `axios`, `papaparse`, `zod` (ถูกใช้ในไฟล์ที่ตอนนี้ยังไม่ถูกเรียกจาก entry)
  - `@mapbox/mapbox-gl-geocoder`, `@turf/helpers`, `@turf/line-offset`, `@vercel/speed-insights`, `@vueuse/core`, `aos`, `dayjs`
  - `@vue/test-utils` (ต้องยืนยันแผน unit tests ก่อนลบ)

## หมายเหตุผลรันล่าสุด
- `npm run knip`: รันได้ด้วย config ใหม่ และตัด noise จาก `.venv/**`, `supabase/**`, `scripts/**` ตามเป้า
- `npm run knip:deps`: ไม่พบ `unresolved import` ของ `src/stories/SwipeCard.stories.js` แล้ว
