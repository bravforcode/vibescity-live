import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5417", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.locator('[data-testid="search-input"]').fill('Cafe');
const firstResult = page.getByTestId('search-result').first();
await firstResult.waitFor({ state: 'visible', timeout: 15000 });
await firstResult.click();
const start = Date.now();
let testIdVisible = false;
let dialogVisible = false;
try {
  await page.locator('[data-testid="vibe-modal"]').waitFor({ state: 'visible', timeout: 15000 });
  testIdVisible = true;
} catch {}
try {
  await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 1000 });
  dialogVisible = true;
} catch {}
const elapsed = Date.now() - start;
console.log(JSON.stringify({ elapsed, testIdVisible, dialogVisible }, null, 2));
await browser.close();
