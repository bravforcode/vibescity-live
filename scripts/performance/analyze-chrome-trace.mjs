#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const readArg = (name, fallback = "") => {
	const idx = args.indexOf(name);
	if (idx < 0) return fallback;
	return args[idx + 1] || fallback;
};

const tracePath = readArg("--trace", "");
if (!tracePath) {
	console.error("Missing --trace <path-to-trace.json>");
	process.exit(1);
}

const minTaskMs = Number(readArg("--min-task-ms", "50")) || 50;
const blockMs = Number(readArg("--block-ms", "200")) || 200;

const raw = await fs.readFile(tracePath, "utf8");
let trace = null;
try {
	trace = JSON.parse(raw);
} catch {
	console.error("Trace is not valid JSON");
	process.exit(1);
}

const events = Array.isArray(trace?.traceEvents)
	? trace.traceEvents
	: Array.isArray(trace)
		? trace
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
	const slot = byThread.get(key) || {
		pid,
		tid,
		runTaskCount: 0,
		totalDurMs: 0,
	};
	if (e.name === "RunTask" && Number.isFinite(e.dur)) {
		slot.runTaskCount += 1;
		slot.totalDurMs += Number(e.dur) / 1000;
	}
	byThread.set(key, slot);
}

const rendererMain = [...byThread.values()]
	.sort(
		(a, b) => b.runTaskCount - a.runTaskCount || b.totalDurMs - a.totalDurMs,
	)
	.at(0);

const isMainThreadEvent = (e) =>
	rendererMain && e.pid === rendererMain.pid && e.tid === rendererMain.tid;

const main = timelineEvents.filter(isMainThreadEvent);
const toMs = (durUs) => Number(durUs) / 1000;

const longTasks = main
	.filter((e) => e.name === "RunTask" && Number.isFinite(e.dur))
	.map((e) => ({
		name: e.name,
		durMs: Number(toMs(e.dur).toFixed(2)),
		tsUs: Number(e.ts || 0),
	}))
	.filter((e) => e.durMs >= minTaskMs)
	.sort((a, b) => b.durMs - a.durMs);

const blockedOver200 = longTasks.filter((t) => t.durMs >= blockMs).length;

const actionable = main
	.filter((e) => Number.isFinite(e.dur) && toMs(e.dur) >= minTaskMs)
	.map((e) => ({
		name: String(e.name || "unknown"),
		durMs: Number(toMs(e.dur).toFixed(2)),
		cat: String(e.cat || ""),
	}))
	.sort((a, b) => b.durMs - a.durMs)
	.slice(0, 30);

const aggregates = new Map();
for (const e of main) {
	if (!Number.isFinite(e.dur)) continue;
	const name = String(e.name || "unknown");
	const slot = aggregates.get(name) || { name, count: 0, totalMs: 0 };
	slot.count += 1;
	slot.totalMs += toMs(e.dur);
	aggregates.set(name, slot);
}

const topAggregates = [...aggregates.values()]
	.sort((a, b) => b.totalMs - a.totalMs)
	.slice(0, 15)
	.map((item) => ({
		...item,
		totalMs: Number(item.totalMs.toFixed(2)),
	}));

const output = {
	trace: path.normalize(tracePath),
	mainThread: rendererMain || null,
	thresholds: { minTaskMs, blockMs },
	longTasks: {
		count: longTasks.length,
		blockedOver200ms: blockedOver200,
		maxMs: longTasks.length ? longTasks[0].durMs : 0,
		top: longTasks.slice(0, 20),
	},
	topActionableEvents: actionable,
	topAggregates,
};

console.log(JSON.stringify(output, null, 2));
