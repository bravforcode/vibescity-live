import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",

  // ✅ แนะนำ: e2e มัก share server/infra → parallel มากไปจะ flaky
  fullyParallel: true,
  workers: isCI ? 1 : "50%",
  retries: isCI ? 2 : 0,

  // ✅ ลด noise: ไม่ให้ "only" หลุดขึ้น CI
  forbidOnly: isCI,

  // ✅ กัน test ค้าง
  timeout: 60_000,
  expect: { timeout: 30_000 },

  // ✅ แยก report ชัด + path มาตรฐานสำหรับ upload artifact
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "reports/e2e/junit.xml" }],
  ],

  // ✅ output ชัด ๆ (screenshots/videos/traces ไปใน test-results)
  outputDir: "test-results",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",

    // ✅ trace/video/screenshot เฉพาะ fail → ประหยัดพื้นที่+เร็ว
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // ✅ ลด flaky จาก animation / transition
    // (ช่วยให้ tap/click นิ่งขึ้นมาก)
    // NOTE: ถ้าหน้าเว็บต้องพึ่ง animation จริง ๆ ค่อยปิด
    launchOptions: {
      slowMo: process.env.PW_SLOWMO ? Number(process.env.PW_SLOWMO) : 0,
    },

    // ✅ ให้เป็น mobile-ish มากขึ้น (เล่นกับ touch ได้ดี)
    hasTouch: true,

    // ✅ เก็บ context ไว้ debug หลัง fail (โดยเฉพาะ iOS webkit)
    // บางที CI webkit จุกจิก → เราใช้ trace/video ช่วย
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },

  // ✅ Server: ให้ CI/local ใช้โหมดเดียวกัน (แต่ local ควร reuse server)
  webServer: {
    command: "npm run dev -- --host 0.0.0.0 --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: {
      VITE_E2E: "true",
      // ✅ ใส่ flag ให้ app ปิดของหนัก ๆ ตอนเทสได้ เช่น map animation / realtime
      // คุณเอาไปใช้ในโค้ดได้: if (import.meta.env.VITE_E2E) { ... }
      VITE_DISABLE_ANIMATIONS: "true",
    },
  },

  // ✅ ถ้าคุณอยาก “แยก smoke vs full” ภายในไฟล์เดียว:
  //   - ใส่ @smoke ใน test.describe หรือ test(...) name
  //   - แล้วรัน: npx playwright test -g "@smoke"
  grep: process.env.PW_GREP ? new RegExp(process.env.PW_GREP) : undefined,

  projects: [
    // 🍎 iOS-first (Safari-like)
    {
      name: "Mobile Safari (iOS)",
      use: {
        ...devices["iPhone 14"],
        browserName: "webkit",
        // ✅ บางที iOS/webkit ต้องบังคับ viewport ให้ชัวร์
        viewport: { width: 390, height: 844 },
      },
    },

    // 🤖 Android
    {
      name: "Mobile Chrome (Android)",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
      },
    },

    // 🖥 Desktop sanity
    {
      name: "Desktop Chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
      },
    },
  ],
});
