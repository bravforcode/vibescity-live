## Goal
ลดขนาดการ์ด carousel ลงราว 10%, ทำให้ basemap มองเห็นชัดบนเว็บ production, และเอา toast `Ready for Offline` ออกโดยไม่ทำให้ PWA/offline fallback พัง

## Scope
- in: `src/components/feed/BottomFeed.vue`, `src/components/pwa/ReloadPrompt.vue`, `public/map-styles/vibecity-neon.json`, `src/components/map/MapLibreContainer.vue`, validation, prod deploy
- out: backend, schema, analytics, service worker offline fallback logic

## Agent(s)
frontend-specialist

## Steps
1. ลดขนาด card constants และ container height ของ bottom carousel แบบรักษา layout เดิม
2. ปิดเฉพาะ offline-ready toast แต่คง refresh prompt/update flow ไว้
3. ปรับ basemap neon style และ selected-map vignette ให้หน้าเว็บเห็นรายละเอียดแมพมากขึ้น
4. รัน build/checklist/verify และ smoke production ก่อน deploy
5. deploy production แล้วตรวจ alias/live screenshot ซ้ำ

## Success criteria
- [x] การ์ดเล็กลงประมาณ 10% โดย interaction เดิมยังทำงาน
- [x] หน้าเว็บเห็น basemap ชัดขึ้น ไม่ดำทั้งผืนเมื่อเลือก venue
- [x] ไม่มี `Ready for Offline` toast โผล่บน production
- [x] checklist/verify ผ่าน และ deploy production สำเร็จ

## Risks
- map อาจสว่างเกินจนเสีย neon identity: ปรับเฉพาะสี/opacity หลัก ไม่เปลี่ยน layer structure
- card อาจเหลือ spacing แปลก: ลดทั้ง width/height และ wrapper height ให้สัมพันธ์กัน

## Rollback
revert `src/components/feed/BottomFeed.vue`, `src/components/pwa/ReloadPrompt.vue`, `public/map-styles/vibecity-neon.json`, `src/components/map/MapLibreContainer.vue` แล้ว deploy production ใหม่

## Outcome

- bottom carousel card footprint ลดจาก `220x264` เหลือ `198x238` พร้อมลดความสูงของ rail ให้สัมพันธ์กัน
- toast `Ready for Offline` ถูกเอาออก โดยยังคง flow ของ update/reload prompt เดิมไว้
- basemap production มองเห็นชัดขึ้นจากการปรับ neon style และลดความเข้มของ selected-map vignette
- `SwipeCard` narrow live-card lane now offsets the venue name to the right of the `LIVE` badge and clamps it to one line so long names stop colliding with the badge
- `SwipeCard` narrow mobile cards now reserve both the `LIVE` badge lane and the favorite-button lane, move the category chip onto its own row, and hide `IMG/VID` counts on compact cards so the copy stack reads cleaner
- `SwipeCard` narrow mobile cards now allow full venue names without clamping, restore the compact `IMG/VID` counts, and avoid badge/heart overlap by using real left/right gutters instead of text-overpaint tricks
- `BottomFeed` compact carousel height was increased to `198x272` cards with a taller rail so the full copy stack can fit without clipping
- production ล่าสุดคือ `dpl_EcTxBwF4fXx3e2WyP34vQcFoxJph` และ alias อยู่ที่ `https://www.vibescity.live`

## Validation

- `npx biome check src/components/feed/BottomFeed.vue src/components/pwa/ReloadPrompt.vue src/components/map/MapLibreContainer.vue`
- `npm run build`
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/checklist.py .`
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/verify_all.py . --url https://www.vibescity.live`
- Mobile smoke บน `https://www.vibescity.live/th?fresh_map=20260407n` ยืนยัน `toast: false`, การ์ดสามใบแรก `198 x 238`, และ map canvas พร้อมใช้งาน
- Production DOM smoke หลัง deploy ใหม่ยืนยันการ์ด live ชุดแรกมี `badgeBottom < titleTop` ทุกใบที่ตรวจและ `overlap: false`
- Production text-rect smoke สำหรับ `Louis Residence Hotel` ยืนยันตัวอักษรจริงถูกเยื้องขวาจาก badge แล้ว (`overlap: false`)
- `checklist.py` ผ่านหลัง deploy ล่าสุด; `verify_all.py` ยังมี `Test Suite` lane fail แบบ intermittent แม้ `python .agent/skills/testing-patterns/scripts/test_runner.py .` จะผ่านตรง ๆ
- `npx biome check src/components/ui/SwipeCard.vue` ผ่านหลังจัด header/meta ใหม่ของการ์ดแคบ
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/checklist.py .` ผ่านบน 2026-04-08
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/verify_all.py . --url https://www.vibescity.live` ผ่านทั้งหมดที่มี script บน 2026-04-08
- Production DOM smoke บน `https://www.vibescity.live/th?cardtidy=20260408a` ยืนยันว่าการ์ดแคบ active card แสดง `chip` เป็นแถวแยก, `distance`/`travel time` อยู่แถวถัดไป, และ `IMG/VID` counts ถูกซ่อน (`display: none`)
- `npx biome check src/components/ui/SwipeCard.vue src/components/feed/BottomFeed.vue` ผ่านหลังเปิดชื่อเต็ม/details ครบของการ์ดแคบ
- `npm run build` ผ่านหลังเพิ่มความสูงการ์ด compact และปลด title clamp
- `$env:PYTHONIOENCODING='utf-8'; python .agent/scripts/checklist.py .` timeout ที่ `Security Scan` เพราะ runner ถูก hard-stop ที่ 5 นาทีบน Windows host นี้ แม้ `verify_all.py` จะผ่าน security lane เดียวกันในรอบถัดมา
- `vercel deploy --prod --archive=tgz -y --force` สำเร็จเป็น `dpl_EcTxBwF4fXx3e2WyP34vQcFoxJph`
- Production DOM smoke บน `https://www.vibescity.live/th?fulldetail=20260408b` ยืนยัน `titleLineClamp: none`, metadata ทั้ง `distance / travel time / IMG / VID` ยังแสดงครบ, และ text-range ของชื่อร้านไม่ overlap ทั้ง `LIVE` badge และปุ่มหัวใจ
