import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5417", { waitUntil: "domcontentloaded" });
const mapShellVisible = await page.locator('[data-testid="map-shell"]').first().isVisible({ timeout: 30000 }).catch(() => false);
const mapReady = await page.locator('[data-testid="map-shell"][data-map-ready="true"]').first().isVisible({ timeout: 45000 }).catch(() => false);
const filterButton = page
  .getByTestId("btn-filter")
  .or(page.locator("button[aria-label='Open filter menu']"))
  .first();
const count = await filterButton.count();
const filterVisible = await filterButton.isVisible({ timeout: 10000 }).catch(() => false);
console.log(JSON.stringify({ mapShellVisible, mapReady, count, filterVisible }, null, 2));
await browser.close();
