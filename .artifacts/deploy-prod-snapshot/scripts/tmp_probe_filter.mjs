import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://localhost:5417", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('[data-testid="btn-filter"]'));
  return {
    count: nodes.length,
    items: nodes.map((n) => {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      return {
        aria: n.getAttribute("aria-label"),
        display: s.display,
        visibility: s.visibility,
        opacity: s.opacity,
        width: r.width,
        height: r.height,
        top: r.top,
        left: r.left,
      };
    }),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
