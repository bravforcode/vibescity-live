## Goal
แก้ UX หน้าเว็บให้ลื่นขึ้น วิดีโอเปิดดูได้จริง และแผนที่บอกตำแหน่งผู้ใช้ชัดเจนตั้งแต่เริ่มใช้งาน

## Scope
- in:  runtime profiling, map startup/location UX, venue video click/playback flow, mobile interaction jank, focused frontend fixes
- out: payment, auth, RLS, database schema, migrations, backend contract changes, production deploy

## Agent(s)
orchestrator (frontend runtime + performance + browser validation อยู่ในงานเดียวกัน)

## Steps
1. วัด baseline ด้วย browser จริงที่ `http://localhost:5173/en`: console errors, FPS/jank, map readiness, video click flow
2. ไล่โค้ด hot paths: `HomeView.vue`, `MapLibreContainer.vue`, `BottomFeed.vue`, `SwipeCard.vue`, `VibeModal.vue`, `useSmartVideo.js`, `locationStore.js`, `shopStore.js`
3. แก้วิดีโอ: ตรวจ source normalization, preload policy, click-to-open state, modal/expanded view rendering, fallback เมื่อ video URL มีแต่ไม่โหลด
4. แก้แผนที่: ทำตำแหน่งผู้ใช้ให้เห็นชัด, CTA ขอ location ให้เข้าใจง่าย, และไม่ปล่อยให้ผู้ใช้เริ่มจาก map shell ที่ไม่รู้ว่าตัวเองอยู่ตรงไหน
5. ลดอาการกระตุก: ปิด/เลื่อนงานหนักช่วง startup, ลด repeated video/map work, ลด forced layout และ event churn ระหว่าง scroll/gesture
6. ตรวจซ้ำด้วย Playwright: desktop + mobile viewport, video visible after tap, map marker/location control visible, console ไม่มี error ใหม่
7. รัน validation gates ที่เกี่ยวข้อง: biome changed files, unit/e2e เฉพาะจุดถ้ามี, `python .agent/scripts/checklist.py .`

## Success criteria
- [ ] เปิด `/en` แล้ว map โหลดพร้อมตำแหน่ง/ปุ่ม location ที่เข้าใจได้
- [ ] กด venue/video แล้วมี `<video>` หรือ fallback ที่ใช้งานได้ ไม่เป็นพื้นที่ว่าง
- [ ] interaction หลักบน feed/map ไม่มี long task หรือ layout churn ชัดเจนใน baseline check
- [ ] ไม่มี console error ใหม่จาก flow ที่แก้
- [ ] validation ไม่มี error level

## Risks
- Map startup และ video preload มี tradeoff ระหว่างความลื่นกับความเร็วในการเล่น: mitigate ด้วย lazy/eager เฉพาะ active item
- Browser geolocation อาจถูกปฏิเสธ: mitigate ด้วย fallback UI ที่บอกสถานะและปุ่มลองใหม่
- Public media URL บางรายการอาจหมดอายุหรือถูกบล็อก: mitigate ด้วย source fallback และ empty-state ที่ชัดเจน

## Rollback
revert ไฟล์ frontend ที่แตะใน task นี้ แล้วรัน browser smoke + `python .agent/scripts/checklist.py .` เพื่อยืนยัน baseline กลับมา
