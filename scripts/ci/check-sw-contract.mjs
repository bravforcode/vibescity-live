#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const read = async (relativePath) =>
	fs.readFile(path.join(ROOT, relativePath), "utf8").catch(() => "");

const checks = [];
const add = (ok, name, detail = "") => checks.push({ ok, name, detail });

const main = async () => {
	const publicSw = await read("public/sw.js");
	const srcSw = await read("src/sw.js");
	const mainJs = await read("src/main.js");

	add(Boolean(publicSw), "sw.public.exists", "public/sw.js");
	add(Boolean(srcSw), "sw.src.exists", "src/sw.js");
	add(
		/public\/sw\.js/i.test(srcSw),
		"sw.src.legacy-note",
		"src/sw.js should state it is legacy and public/sw.js is deployed",
	);
	add(
		/__WB_MANIFEST/.test(publicSw) &&
			/precacheAndRoute\(/.test(publicSw),
		"sw.public.precache",
		"public/sw.js should precache build manifest",
	);
	add(
		/register\(\"\/sw\.js\"\)/.test(mainJs),
		"sw.main.registration",
		"src/main.js should register /sw.js",
	);
	add(
		/cacheableResponse\.CacheableResponsePlugin/.test(publicSw),
		"sw.public.cacheable-200-only",
		"public/sw.js should limit cacheable responses",
	);

	const failed = checks.filter((row) => !row.ok);
	for (const row of checks) {
		const icon = row.ok ? "PASS" : "FAIL";
		console.log(`${icon} ${row.name}${row.detail ? ` :: ${row.detail}` : ""}`);
	}

	if (failed.length) {
		process.exit(1);
	}
};

main().catch((error) => {
	console.error("[check-sw-contract] Failed:", error?.message || error);
	process.exit(1);
});
