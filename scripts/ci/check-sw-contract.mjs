#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

const read = (relativePath) =>
	fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const assertContract = (source, name, pattern, detail) => {
	if (!pattern.test(source)) {
		failures.push(`${name}: ${detail}`);
	}
};

const swPath = path.join(ROOT, "public", "sw.js");
const offlinePath = path.join(ROOT, "public", "offline.html");

if (!fs.existsSync(swPath)) {
	failures.push("service-worker: missing public/sw.js");
}

if (!fs.existsSync(offlinePath)) {
	failures.push("service-worker: missing public/offline.html");
}

if (fs.existsSync(swPath)) {
	const swSource = read("public/sw.js");

	assertContract(
		swSource,
		"service-worker.workbox-loader",
		/importScripts\(["'][^"']*workbox-sw\.js["']\)/,
		"Workbox runtime loader is missing",
	);
	assertContract(
		swSource,
		"service-worker.skip-waiting",
		/skipWaiting\(\)/,
		"skipWaiting contract is missing",
	);
	assertContract(
		swSource,
		"service-worker.clients-claim",
		/clientsClaim\(\)/,
		"clientsClaim contract is missing",
	);
	assertContract(
		swSource,
		"service-worker.precache-manifest",
		/precacheAndRoute\(self\.__WB_MANIFEST\s*\|\|\s*\[\]\)/,
		"precache manifest injection contract is missing",
	);
	assertContract(
		swSource,
		"service-worker.offline-fallback",
		/url:\s*["']\/offline\.html["']/,
		"offline fallback is not precached",
	);
	assertContract(
		swSource,
		"service-worker.api-cache-route",
		/url\.pathname\.startsWith\(["']\/api\/["']\)/,
		"API caching route is missing",
	);
	assertContract(
		swSource,
		"service-worker.navigate-fallback",
		/request\.mode\s*===\s*["']navigate["']/,
		"navigation fallback contract is missing",
	);
	assertContract(
		swSource,
		"service-worker.offline-response",
		/caches\.match\(["']\/offline\.html["']\)/,
		"offline response handler is missing",
	);
}

if (failures.length > 0) {
	console.error("Service worker contract check failed.\n");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log("Service worker contract check passed.");
