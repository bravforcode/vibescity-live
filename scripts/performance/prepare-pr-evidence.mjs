#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const readArg = (name, fallback = "") => {
	const idx = args.indexOf(name);
	if (idx < 0) return fallback;
	return args[idx + 1] || fallback;
};

const tracePath = readArg("--trace", "");
const harPath = readArg("--har", "");
const device = readArg("--device", "");
const os = readArg("--os", "");
const chrome = readArg("--chrome", "");
const network = readArg("--network", "");
const url = readArg("--url", "/en");

if (!tracePath || !harPath) {
	console.error(
		"Usage: node scripts/performance/prepare-pr-evidence.mjs --trace <trace.json> --har <network.har> [--device ... --os ... --chrome ... --network ... --url ...]",
	);
	process.exit(1);
}

const percentile = (values, p) => {
	const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
	if (sorted.length === 0) return null;
	if (sorted.length === 1) return sorted[0];
	const idx = (sorted.length - 1) * p;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo];
	const w = idx - lo;
	return sorted[lo] * (1 - w) + sorted[hi] * w;
};

const analyzeTrace = async (filePath) => {
	const raw = await fs.readFile(filePath, "utf8");
	const json = JSON.parse(raw);
	const events = Array.isArray(json?.traceEvents)
		? json.traceEvents
		: Array.isArray(json)
			? json
			: [];
	const timelineEvents = events.filter(
		(e) =>
			typeof e?.name === "string" &&
			String(e?.cat || "").includes("devtools.timeline"),
	);

	const byThread = new Map();
	for (const e of timelineEvents) {
		const pid = Number(e.pid);
		const tid = Number(e.tid);
		if (!Number.isFinite(pid) || !Number.isFinite(tid)) continue;
		const key = `${pid}:${tid}`;
		const slot = byThread.get(key) || { pid, tid, runTaskCount: 0, totalUs: 0 };
		if (e.name === "RunTask" && Number.isFinite(e.dur)) {
			slot.runTaskCount += 1;
			slot.totalUs += Number(e.dur);
		}
		byThread.set(key, slot);
	}

	const mainThread = [...byThread.values()]
		.sort((a, b) => b.runTaskCount - a.runTaskCount || b.totalUs - a.totalUs)
		.at(0);

	if (!mainThread) {
		return { mainThread: null, longTasks: [] };
	}

	const toMs = (durUs) => Number(durUs) / 1000;
	const longTasks = timelineEvents
		.filter(
			(e) =>
				e.pid === mainThread.pid &&
				e.tid === mainThread.tid &&
				e.name === "RunTask" &&
				Number.isFinite(e.dur),
		)
		.map((e) => ({
			startMs: Number((Number(e.ts || 0) / 1000).toFixed(2)),
			durMs: Number(toMs(e.dur).toFixed(2)),
		}))
		.sort((a, b) => b.durMs - a.durMs);

	return { mainThread, longTasks };
};

const analyzeHar = async (filePath) => {
	const raw = await fs.readFile(filePath, "utf8");
	const json = JSON.parse(raw);
	const entries = Array.isArray(json?.log?.entries) ? json.log.entries : [];
	const rows = entries.map((e) => ({
		url: String(e?.request?.url || ""),
		status: Number(e?.response?.status || 0),
		timeMs: Number(e?.time || 0),
		blockedMs: Number(e?.timings?.blocked || 0),
		waitMs: Number(e?.timings?.wait || 0),
		receiveMs: Number(e?.timings?.receive || 0),
	}));
	return rows;
};

const [traceSummary, harRows] = await Promise.all([
	analyzeTrace(tracePath),
	analyzeHar(harPath),
]);

const longTasks = traceSummary.longTasks || [];
const longTaskDurations = longTasks.map((t) => t.durMs);
const longTaskMaxMs = longTaskDurations.length
	? Math.max(...longTaskDurations)
	: 0;
const longTaskBlockedOver200 = longTasks.filter((t) => t.durMs >= 200).length;

const harTimes = harRows.map((r) => r.timeMs);
const harP75 = percentile(harTimes, 0.75);
const slowOver1s = harRows
	.filter((r) => r.timeMs >= 1000)
	.sort((a, b) => b.timeMs - a.timeMs)
	.slice(0, 15);

const fmtMs = (v) => (Number.isFinite(v) ? `${Math.round(v)}ms` : "n/a");

const md = [
	"## Evidence (real device)",
	"",
	`- URL: ${url}`,
	`- Device: ${device || "[model]"}`,
	`- OS: ${os || "[version]"}`,
	`- Chrome: ${chrome || "[version]"}`,
	`- Network conditions: ${network || "[preset + details]"}`,
	`- Attachments:`,
	`  - ${path.basename(tracePath)}`,
	`  - ${path.basename(harPath)}`,
	"",
	"### Trace summary",
	"",
	`- Main thread: ${traceSummary.mainThread ? `${traceSummary.mainThread.pid}:${traceSummary.mainThread.tid}` : "n/a"}`,
	`- Long tasks >= 50ms: ${longTasks.filter((t) => t.durMs >= 50).length}`,
	`- Long tasks >= 200ms: ${longTaskBlockedOver200}`,
	`- Max long task: ${fmtMs(longTaskMaxMs)}`,
	"",
	"### HAR summary",
	"",
	`- Total requests: ${harRows.length}`,
	`- p75 request time (all requests): ${fmtMs(harP75)}`,
	`- Requests >= 1s: ${slowOver1s.length}`,
	"",
	...(!slowOver1s.length
		? ["(none)"]
		: slowOver1s.map(
				(r) =>
					`- ${fmtMs(r.timeMs)} status=${r.status} blocked=${fmtMs(r.blockedMs)} ${r.url}`,
			)),
	"",
].join("\n");

process.stdout.write(md);
