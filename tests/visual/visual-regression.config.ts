/**
 * Enterprise Visual Regression Testing Configuration
 *
 * Comprehensive visual testing setup for VibeCity with:
 * - Multiple viewport testing
 * - Component-level snapshots
 * - Full-page screenshots
 * - Cross-browser compatibility
 * - Performance monitoring
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.visual.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [
    ["html", { outputFolder: "test-results/visual-report" }],
    ["json", { outputFile: "test-results/visual-results.json" }],
    ["junit", { outputFile: "test-results/visual-junit.xml" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Desktop browsers
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] },
    },

    // Mobile browsers
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 12"] },
    },

    // Tablet browsers
    {
      name: "chromium-tablet",
      use: { ...devices["iPad Pro"] },
    },

    // High-DPI displays
    {
      name: "chromium-hidpi",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  expect: {
    // Visual comparison tolerance
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 1000,
      animations: "disabled",
    },
    // Visual comparison tolerance for layouts
    toMatchSnapshot: {
      threshold: 0.3,
      maxDiffPixels: 1500,
    },
  },
});
