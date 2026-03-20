#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ENTRIES = [
	"src",
	"public",
	"scripts",
	".github/workflows",
	".env",
	".env.example",
	"backend/.env",
	"backend/.env.example",
];
const IGNORE_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".output",
	"playwright-report",
	"reports",
	"output",
	"tmp",
	".planning",
	".agent",
	".agents",
	".codex",
	"backend/.venv",
	"backend/credentials",
]);

const ALLOWLIST_VITE_NAMES = new Set([
	"VITE_MAPBOX_TOKEN",
	"VITE_MAPBOX_PUBLIC_TOKEN",
	"VITE_SENTRY_DSN",
	"VITE_SUPABASE_URL",
	"VITE_SUPABASE_ANON_KEY",
]);

const SUSPICIOUS_NAME =
	/\b(VITE_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE|CLIENT_SECRET))\b/;
const VITE_KEYWORD_NAME = /\b(VITE_[A-Z0-9_]*(KEY|TOKEN))\b/;
const SUSPICIOUS_VALUE =
	/sk_live_|sk_test_|-----BEGIN\s+PRIVATE\s+KEY-----|xox[baprs]-|AIza[0-9A-Za-z\-_]{20,}|ghp_[0-9A-Za-z]{30,}|supabase_service_role/i;

const TEXT_EXTENSIONS = new Set([
	".js",
	".ts",
	".vue",
	".json",
	".mjs",
	".cjs",
	".yml",
	".yaml",
	".env",
	".md",
	".txt",
	".sh",
	".ps1",
]);

const envFileLike = (name) => name.startsWith(".env");

const toRel = (file) => path.relative(ROOT, file).replaceAll("\\", "/");

const shouldInspectFile = (fileName) => {
	const ext = path.extname(fileName).toLowerCase();
	if (TEXT_EXTENSIONS.has(ext)) return true;
	return envFileLike(path.basename(fileName));
};

const walk = async (dir) => {
	const out = [];
	const entries = await fs
		.readdir(dir, { withFileTypes: true })
		.catch(() => []);
	for (const entry of entries) {
		if (IGNORE_DIRS.has(entry.name)) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walk(full)));
			continue;
		}
		if (!entry.isFile()) continue;
		if (!shouldInspectFile(entry.name)) continue;
		out.push(full);
	}
	return out;
};

const collectScanFiles = async () => {
	const files = [];
	for (const entry of SCAN_ENTRIES) {
		const full = path.join(ROOT, entry);
		const info = await fs.stat(full).catch(() => null);
		if (!info) continue;
		if (info.isDirectory()) {
			files.push(...(await walk(full)));
		} else if (info.isFile() && shouldInspectFile(path.basename(full))) {
			files.push(full);
		}
	}
	return files;
};

const collectFindings = async () => {
	const files = await collectScanFiles();
	const findings = [];

	for (const file of files) {
		const content = await fs.readFile(file, "utf8").catch(() => "");
		if (!content) continue;
		const lines = content.split(/\r?\n/);

		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i];

			const strictNameMatch = line.match(SUSPICIOUS_NAME);
			if (strictNameMatch) {
				const varName = strictNameMatch[1];
				if (!ALLOWLIST_VITE_NAMES.has(varName)) {
					findings.push({
						file: toRel(file),
						line: i + 1,
						reason: `Disallowed VITE variable name: ${varName}`,
					});
				}
			}

			const keywordNameMatch = line.match(VITE_KEYWORD_NAME);
			if (keywordNameMatch) {
				const varName = keywordNameMatch[1];
				if (!ALLOWLIST_VITE_NAMES.has(varName) && SUSPICIOUS_VALUE.test(line)) {
					findings.push({
						file: toRel(file),
						line: i + 1,
						reason: `Potential secret-like value assigned to ${varName}`,
					});
				}
			}
		}
	}

	return findings;
};

const main = async () => {
	const findings = await collectFindings();
	if (!findings.length) {
		console.log("[check-vite-public-secrets] PASS");
		return;
	}

	console.error("[check-vite-public-secrets] FAIL");
	for (const finding of findings.slice(0, 100)) {
		console.error(`- ${finding.file}:${finding.line} :: ${finding.reason}`);
	}
	process.exit(1);
};

main().catch((error) => {
	console.error("[check-vite-public-secrets] Failed:", error?.message || error);
	process.exit(1);
});
