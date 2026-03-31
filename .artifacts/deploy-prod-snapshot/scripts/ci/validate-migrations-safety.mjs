#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const MIGRATION_NAME_RE = /^\d{14}_[a-z0-9_]+\.sql$/;

const issues = [];

const pushIssue = (level, code, detail) => {
	issues.push({ level, code, detail });
	const icon = level === "error" ? "ERROR" : "WARN ";
	console.log(`${icon} ${code} :: ${detail}`);
};

const safeGitStatus = () => {
	try {
		return execFileSync("git", ["status", "--porcelain", "supabase/migrations"], {
			cwd: ROOT,
			encoding: "utf8",
		});
	} catch {
		return "";
	}
};

const parseStatusLine = (line) => {
	const status = line.slice(0, 2);
	const rawPath = line.slice(3).trim();
	const normalizedPath = rawPath.replaceAll("\\", "/");
	return { status, normalizedPath };
};

const checkChangedMigrations = () => {
	const statusText = safeGitStatus();
	if (!statusText) return [];
	const changed = [];
	for (const line of statusText.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const entry = parseStatusLine(line);
		if (!entry.normalizedPath.startsWith("supabase/migrations/")) continue;
		changed.push(entry);
	}
	return changed;
};

const checkMigrationFilenameContract = async () => {
	const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
	const names = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
		.map((entry) => entry.name)
		.sort();

	let previous = "";
	const seenTimestamps = new Set();
	for (const name of names) {
		if (!MIGRATION_NAME_RE.test(name)) {
			pushIssue("error", "migration_name", `invalid filename: ${name}`);
			continue;
		}
		if (previous && name < previous) {
			pushIssue("error", "migration_order", `${name} is out of order`);
		}
		previous = name;
		const ts = name.slice(0, 14);
		if (seenTimestamps.has(ts)) {
			pushIssue("error", "migration_duplicate_timestamp", `duplicate timestamp: ${ts}`);
		}
		seenTimestamps.add(ts);
	}
};

const checkOldMigrationEdits = (changedMigrations) => {
	for (const { status, normalizedPath } of changedMigrations) {
		const isTrackedEdit = status[0] === "M" || status[1] === "M";
		const isNew = status.includes("?") || status.includes("A");
		if (!isTrackedEdit || isNew) continue;
		pushIssue(
			"error",
			"migration_mutation",
			`existing migration edited: ${normalizedPath}`,
		);
	}
};

const checkChangedMigrationContent = async (changedMigrations) => {
	for (const { status, normalizedPath } of changedMigrations) {
		const isNew = status.includes("?") || status.includes("A");
		if (!isNew) continue;
		const fullPath = path.join(ROOT, normalizedPath);
		let sql = "";
		try {
			sql = await fs.readFile(fullPath, "utf8");
		} catch {
			continue;
		}

		const normalizedSql = sql.toLowerCase();
		if (/\bdrop\s+table\b/.test(normalizedSql)) {
			pushIssue("warn", "destructive_drop_table", normalizedPath);
		}
		if (/\btruncate\b/.test(normalizedSql)) {
			pushIssue("warn", "destructive_truncate", normalizedPath);
		}
		if (/\bdelete\s+from\b/.test(normalizedSql) && !/\bwhere\b/.test(normalizedSql)) {
			pushIssue("warn", "destructive_delete", normalizedPath);
		}
		if (
			/\bset\s+statement_timeout\b/.test(normalizedSql) &&
			!/\breset\s+statement_timeout\b/.test(normalizedSql)
		) {
			pushIssue(
				"warn",
				"statement_timeout_reset_missing",
				`${normalizedPath} sets statement_timeout without reset`,
			);
		}
	}
};

async function main() {
	await checkMigrationFilenameContract();

	const changed = checkChangedMigrations();
	checkOldMigrationEdits(changed);
	await checkChangedMigrationContent(changed);

	const errorCount = issues.filter((issue) => issue.level === "error").length;
	const warnCount = issues.filter((issue) => issue.level === "warn").length;
	console.log(
		`Migration safety summary: errors=${errorCount} warnings=${warnCount}`,
	);

	if (errorCount > 0) process.exit(1);
}

main().catch((error) => {
	console.error("validate-migrations-safety failed:", error);
	process.exit(1);
});
