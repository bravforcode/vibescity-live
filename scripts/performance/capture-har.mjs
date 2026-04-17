#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";

const args = process.argv.slice(2);
const readArg = (name, fallback = "") => {
	const idx = args.indexOf(name);
	if (idx < 0) return fallback;
	return args[idx + 1] || fallback;
};

const url = readArg(
	"--url",
	process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5417/en",
);
const output = readArg(
	"--output",
	path.join(process.cwd(), "reports", "performance", "mobile-chrome-en.har"),
);
const timeoutMs = Number(readArg("--timeout-ms", "60000")) || 60000;
const deviceName = String(readArg("--device", "Pixel 7"));

const deviceProfile = devices[deviceName] || devices["Pixel 7"];

await fs.mkdir(path.dirname(output), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
	...deviceProfile,
	recordHar: { path: output, mode: "full" },
});
const page = await context.newPage();

try {
	await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
	await page.waitForTimeout(1200);
} finally {
	await context.close().catch(() => {});
	await browser.close().catch(() => {});
}

console.log(
	JSON.stringify(
		{
			url,
			output,
			device: deviceName,
		},
		null,
		2,
	),
);
