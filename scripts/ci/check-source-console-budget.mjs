#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const BUDGET = {
	log: Number(process.env.SOURCE_CONSOLE_BUDGET_LOG || 58),
	warn: Number(process.env.SOURCE_CONSOLE_BUDGET_WARN || 67),
	error: Number(process.env.SOURCE_CONSOLE_BUDGET_ERROR || 100),
	debug: Number(process.env.SOURCE_CONSOLE_BUDGET_DEBUG || 5),
};

const METHOD_PATTERN = /console\.(log|warn|error|debug)\s*\(/g;
const FILE_EXT_ALLOWLIST = new Set([".js", ".ts", ".vue"]);

const walkFiles = async (dir) => {
	const out = [];
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkFiles(full)));
			continue;
		}
		if (!entry.isFile()) continue;
		const ext = path.extname(entry.name).toLowerCase();
		if (!FILE_EXT_ALLOWLIST.has(ext)) continue;
		out.push(full);
	}
	return out;
};

const rel = (file) => path.relative(ROOT, file).replaceAll("\\", "/");

const main = async () => {
	const files = await walkFiles(SRC_DIR);
	const counts = { log: 0, warn: 0, error: 0, debug: 0 };
	const offenders = [];

	for (const file of files) {
		const text = await fs.readFile(file, "utf8").catch(() => "");
		if (!text) continue;
		const local = { log: 0, warn: 0, error: 0, debug: 0 };
		let match = METHOD_PATTERN.exec(text);
		while (match) {
			const method = match[1];
			local[method] += 1;
			counts[method] += 1;
			match = METHOD_PATTERN.exec(text);
		}
		METHOD_PATTERN.lastIndex = 0;
		const total = local.log + local.warn + local.error + local.debug;
		if (total > 0) offenders.push({ file: rel(file), total, ...local });
	}

	const violations = Object.entries(BUDGET)
		.map(([method, budget]) => ({
			method,
			budget,
			actual: counts[method],
		}))
		.filter((row) => row.actual > row.budget);

	if (violations.length) {
		console.error("[source-console-budget] Budget exceeded:");
		for (const row of violations) {
			console.error(
				`- console.${row.method}: actual=${row.actual} > budget=${row.budget}`,
			);
		}
		console.error("[source-console-budget] Top offenders:");
		for (const row of offenders.sort((a, b) => b.total - a.total).slice(0, 15)) {
			console.error(
				`- ${row.file} :: total=${row.total} (log=${row.log}, warn=${row.warn}, error=${row.error}, debug=${row.debug})`,
			);
		}
		process.exit(1);
	}

	console.log(
		`[source-console-budget] PASS :: log=${counts.log}/${BUDGET.log}, warn=${counts.warn}/${BUDGET.warn}, error=${counts.error}/${BUDGET.error}, debug=${counts.debug}/${BUDGET.debug}`,
	);
};

main().catch((error) => {
	console.error("[source-console-budget] Failed:", error?.message || error);
	process.exit(1);
});
