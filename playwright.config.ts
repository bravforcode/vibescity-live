import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // ✅ แยก report ชัดเจน
 reporter: [
  ["html", { open: "never" }],
  ["list"],
  ["junit", { outputFile: "reports/e2e/junit.xml" }],
],


  expect: {
    timeout: 30_000,
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // ✅ ให้ CI / local ใช้ server เดียวกัน
  webServer: {
    command: "npm run dev -- --host 0.0.0.0 --port 3000",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_E2E: "true",
    },
  },

  projects: [
    // 🍎 iOS-first (Safari-like)
    {
      name: "Mobile Safari (iOS)",
      use: {
        ...devices["iPhone 14"],
        browserName: "webkit",
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
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
