import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleMessages = [];
page.on("console", (m) => consoleMessages.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => consoleMessages.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:5417", { waitUntil: "domcontentloaded" });
for (const delay of [1000, 3000, 6000, 10000]) {
  await page.waitForTimeout(delay === 1000 ? 1000 : delay - ([1000,3000,6000,10000][[1000,3000,6000,10000].indexOf(delay)-1] || 0));
  const state = await page.evaluate(() => {
    const shells = Array.from(document.querySelectorAll('[data-testid="map-shell"]'));
    const wrappers = Array.from(document.querySelectorAll('[data-testid="map-shell-wrapper"]'));
    const modals = Array.from(document.querySelectorAll('[data-testid="vibe-modal"]'));
    return {
      shellCount: shells.length,
      wrapperCount: wrappers.length,
      modalCount: modals.length,
      shells: shells.map((el, idx) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          idx,
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          width: Math.round(r.width),
          height: Math.round(r.height),
          ready: el.getAttribute("data-map-ready"),
          init: el.getAttribute("data-map-init-requested"),
          tokenInvalid: el.getAttribute("data-map-token-invalid")
        };
      }),
      modalVisible: modals.map((el, idx) => {
        const cs = getComputedStyle(el);
        return { idx, display: cs.display, visibility: cs.visibility, opacity: cs.opacity };
      })
    };
  });
  console.log(`T+${delay}ms`, JSON.stringify(state));
}
console.log("CONSOLE", JSON.stringify(consoleMessages.slice(-20), null, 2));
await browser.close();
