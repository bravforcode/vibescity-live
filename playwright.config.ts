import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const isCI = !!process.env.CI;
const isLowMem = process.env.PW_LOW_MEM === "1";
const reuseServer = process.env.PW_REUSE_SERVER === "1";
const noWebServer = process.env.PW_NO_WEBSERVER === "1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5417";
const e2eWsUrl =
  process.env.PLAYWRIGHT_WS_URL ||
  process.env.VITE_WS_URL ||
  "";
const sanitizeEnvToken = (value = "") =>
  value.trim().replace(/^['"]|['"]$/g, "");

const readMapboxTokenFromDotEnv = () => {
  const envCandidates = [".env.local", ".env"];
  for (const file of envCandidates) {
    try {
      const fullPath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf8");
      const match = content.match(/^\s*VITE_MAPBOX_TOKEN\s*=\s*(.+)\s*$/m);
      if (match?.[1]) {
        const token = sanitizeEnvToken(match[1]);
        if (token) return token;
      }
    } catch {
      // Ignore dotenv read errors in test config.
    }
  }
  return "";
};

const mapboxToken = sanitizeEnvToken(
  process.env.VITE_MAPBOX_TOKEN || readMapboxTokenFromDotEnv(),
);

export default defineConfig({
  testDir: "./tests/e2e",

  // ✅ แนะนำ: e2e มัก share server/infra → parallel มากไปจะ flaky
  fullyParallel: !isLowMem,
  workers: isLowMem ? 1 : isCI ? 1 : "50%",
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
    baseURL,
    // ✅ E2E determinism: service worker caching can cause flaky chunk/script loads in CI.
    serviceWorkers: "block",

    // ✅ trace/video/screenshot เฉพาะ fail → ประหยัดพื้นที่+เร็ว
    trace: isLowMem ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: isLowMem ? "off" : "retain-on-failure",

    // ✅ ลด flaky จาก animation / transition
    // (ช่วยให้ tap/click นิ่งขึ้นมาก)
    // NOTE: ถ้าหน้าเว็บต้องพึ่ง animation จริง ๆ ค่อยปิด
    launchOptions: {
      slowMo: process.env.PW_SLOWMO ? Number(process.env.PW_SLOWMO) : 0,
    },

    // Touch support configured per-project (mobile: true, desktop: false)

    // ✅ เก็บ context ไว้ debug หลัง fail (โดยเฉพาะ iOS webkit)
    // บางที CI webkit จุกจิก → เราใช้ trace/video ช่วย
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },

  // ✅ Server: ให้ CI/local ใช้โหมดเดียวกัน (แต่ local ควร reuse server)
  webServer: noWebServer
    ? undefined
    : {
        command:
          "npm run build -- --env-mode e2e && npm run preview -- --env-mode e2e --host 0.0.0.0 --port 5417",
        url: baseURL,
        reuseExistingServer: reuseServer,
        timeout: 180_000,
        env: {
          VITE_E2E: "true",
          VITE_WS_URL: e2eWsUrl,
          VITE_E2E_MAP_REQUIRED:
            process.env.E2E_MAP_REQUIRED === "1" ? "true" : "false",
          // ✅ ใส่ flag ให้ app ปิดของหนัก ๆ ตอนเทสได้ เช่น map animation / realtime
          // คุณเอาไปใช้ในโค้ดได้: if (import.meta.env.VITE_E2E) { ... }
          VITE_DISABLE_ANIMATIONS: "true",
          ...(mapboxToken
            ? { VITE_MAPBOX_TOKEN: mapboxToken }
            : {}),
          ...(isLowMem
            ? {
                NODE_OPTIONS: "--max-old-space-size=2048",
                RSPACK_MAX_WORKERS: "1",
              }
            : {}),
        },
      },

  // ✅ ถ้าคุณอยาก “แยก smoke vs full” ภายในไฟล์เดียว:
  //   - ใส่ @smoke ใน test.describe หรือ test(...) name
  //   - แล้วรัน: npx playwright test -g "@smoke"
  grep: process.env.PW_GREP ? new RegExp(process.env.PW_GREP) : undefined,
  grepInvert: process.env.PW_GREP_INVERT
    ? new RegExp(process.env.PW_GREP_INVERT)
    : undefined,

  projects: isLowMem
    ? [
        {
          name: "Desktop Chromium",
          use: {
            ...devices["Desktop Chrome"],
            browserName: "chromium",
            hasTouch: false,
          },
        },
      ]
    : [
        // 🍎 iOS-first (Safari-like)
        {
          name: "Mobile Safari (iOS)",
          use: {
            ...devices["iPhone 14"],
            browserName: "webkit",
            // ✅ บางที iOS/webkit ต้องบังคับ viewport ให้ชัวร์
            viewport: { width: 390, height: 844 },
            hasTouch: true,
          },
        },

        // 🤖 Android
        {
          name: "Mobile Chrome (Android)",
          use: {
            ...devices["Pixel 7"],
            browserName: "chromium",
            hasTouch: true,
          },
        },

        // 🖥 Desktop sanity
        {
          name: "Desktop Chromium",
          use: {
            ...devices["Desktop Chrome"],
            browserName: "chromium",
            hasTouch: false,
          },
        },
      ],
});
