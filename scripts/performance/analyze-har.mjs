#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const readArg = (name, fallback = "") => {
	const idx = args.indexOf(name);
	if (idx < 0) return fallback;
	return args[idx + 1] || fallback;
};

const harPath = readArg("--har", "");
if (!harPath) {
	console.error("Missing --har <path-to.har>");
	process.exit(1);
}

const slowMs = Number(readArg("--slow-ms", "1000")) || 1000;
const blockMs = Number(readArg("--blocked-ms", "100")) || 100;

const raw = await fs.readFile(harPath, "utf8");
let har = null;
try {
	har = JSON.parse(raw);
} catch {
	console.error("HAR is not valid JSON");
	process.exit(1);
}

const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
const rows = entries.map((entry) => ({
	url: String(entry?.request?.url || ""),
	status: Number(entry?.response?.status || 0),
	method: String(entry?.request?.method || "GET"),
	mime: String(entry?.response?.content?.mimeType || ""),
	timeMs: Number(entry?.time || 0),
	blockedMs: Number(entry?.timings?.blocked || 0),
	waitMs: Number(entry?.timings?.wait || 0),
	receiveMs: Number(entry?.timings?.receive || 0),
}));

const slow = rows
	.filter((row) => row.timeMs >= slowMs)
	.sort((a, b) => b.timeMs - a.timeMs)
	.slice(0, 50);

const blocked = rows
	.filter((row) => row.blockedMs >= blockMs)
	.sort((a, b) => b.blockedMs - a.blockedMs)
	.slice(0, 50);

const output = {
	har: path.normalize(harPath),
	thresholds: { slowMs, blockedMs: blockMs },
	totalRequests: rows.length,
	slowOverThresholdCount: rows.filter((row) => row.timeMs >= slowMs).length,
	blockedOverThresholdCount: rows.filter((row) => row.blockedMs >= blockMs)
		.length,
	slowTop: slow,
	blockedTop: blocked,
};

console.log(JSON.stringify(output, null, 2));
