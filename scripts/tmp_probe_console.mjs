import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const messages = [];
page.on("console", (msg) => {
  messages.push({ type: msg.type(), text: msg.text() });
});
page.on("pageerror", (err) => {
  messages.push({ type: "pageerror", text: err.message });
});
await page.goto("http://localhost:5417", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const html = await page.content();
console.log("HTML_LENGTH", html.length);
console.log("HAS_APP_ROOT", html.includes('id="app"'));
console.log("HAS_MAIN", html.includes('<main'));
console.log("CONSOLE_START");
for (const m of messages) console.log(`${m.type}: ${m.text}`);
console.log("CONSOLE_END");
await browser.close();
