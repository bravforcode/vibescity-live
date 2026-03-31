#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONSOLE_CALL_PATTERN = /\bconsole\.(log|warn|error|info|debug|trace)\s*\(/g;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".vue"]);
const REPORT_LIMIT = Number(process.env.SOURCE_CONSOLE_REPORT_LIMIT || 20);
const SOURCE_BUDGET = Number(process.env.SOURCE_CONSOLE_BUDGET_SRC || 243);
const SW_BUDGET = Number(process.env.SOURCE_CONSOLE_BUDGET_SW || 3);

const isCommentOnly = (line) => {
	const trimmed = line.trim();
	return (
		trimmed.length === 0 ||
		trimmed.startsWith("//") ||
		trimmed.startsWith("/*") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("<!--")
	);
};

const walkFiles = (dir) => {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkFiles(fullPath));
			continue;
		}
		if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
};

const collectMatches = (filePath) => {
	const relativePath = path.relative(ROOT, filePath).replaceAll("\\", "/");
	const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
	const matches = [];

	for (const [index, line] of lines.entries()) {
		if (isCommentOnly(line)) {
			continue;
		}

		const lineMatches = [...line.matchAll(CONSOLE_CALL_PATTERN)];
		for (const match of lineMatches) {
			matches.push({
				file: relativePath,
				line: index + 1,
				call: match[0],
				source: line.trim(),
			});
		}
	}

	return matches;
};

const srcRoot = path.join(ROOT, "src");
const sourceFiles = walkFiles(srcRoot).filter((filePath) =>
	SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
);
const sourceMatches = sourceFiles.flatMap(collectMatches);
const swMatches = collectMatches(path.join(ROOT, "public", "sw.js"));

const failures = [];

if (sourceMatches.length > SOURCE_BUDGET) {
	failures.push(
		`src console call budget exceeded: ${sourceMatches.length} > ${SOURCE_BUDGET}`,
	);
}

if (swMatches.length > SW_BUDGET) {
	failures.push(
		`service worker console call budget exceeded: ${swMatches.length} > ${SW_BUDGET}`,
	);
}

if (failures.length > 0) {
	console.error("Source console budget check failed.\n");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}

	console.error("\nSample matches:");
	for (const entry of [...sourceMatches, ...swMatches].slice(0, REPORT_LIMIT)) {
		console.error(`- ${entry.file}:${entry.line} :: ${entry.source}`);
	}
	process.exit(1);
}

console.log(
	`Source console budget passed: src=${sourceMatches.length}/${SOURCE_BUDGET}, sw=${swMatches.length}/${SW_BUDGET}.`,
);
