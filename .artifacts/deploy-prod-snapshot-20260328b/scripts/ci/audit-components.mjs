#!/usr/bin/env node
/**
 * Component Usage Tracker
 * bun run components:audit
 *
 * Reports:
 * - Unused components in src/components/
 * - Single-use components (candidates for inlining)
 * - Orphaned component test files (test file with no matching component)
 * - Usage count per component
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const COMPONENTS_DIR = path.join(ROOT, "src/components");
const SRC_DIR = path.join(ROOT, "src");
const TESTS_DIR = path.join(ROOT, "tests/unit");
const REPORT_PATH = path.join(ROOT, "reports/ci/components-audit.json");

const checks = [];
const add = (ok, name, detail = "") => checks.push({ ok, name, detail });

async function collectFiles(dir, exts) {
	const files = [];
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === ".git") continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath, exts)));
		} else if (exts.some((e) => entry.name.endsWith(e))) {
			files.push(fullPath);
		}
	}
	return files;
}

const main = async () => {
	const vueFiles = await collectFiles(COMPONENTS_DIR, [".vue"]);
	const srcFiles = await collectFiles(SRC_DIR, [".vue", ".js", ".ts"]);
	const testEntries = await fs
		.readdir(TESTS_DIR, { withFileTypes: true })
		.catch(() => []);
	const testFileNames = testEntries
		.filter((e) => e.name.match(/\.spec\.(js|ts)$/))
		.map((e) => e.name);

	console.log(
		`Scanning ${vueFiles.length} components against ${srcFiles.length} source files...\n`,
	);

	// Read all source files once
	const srcContents = new Map();
	for (const f of srcFiles) {
		const content = await fs.readFile(f, "utf8").catch(() => "");
		srcContents.set(f, content);
	}

	const results = [];
	const unused = [];
	const singleUse = [];

	for (const vueFile of vueFiles) {
		const componentName = path.basename(vueFile, ".vue");
		const relPath = path.relative(ROOT, vueFile).replace(/\\/g, "/");

		// Match: import ComponentName from, <ComponentName, defineAsyncComponent path, route component
		const nameRe = new RegExp(
			`import\\s+${componentName}\\b|<${componentName}[\\s/>]|["'\`]${componentName}["'\`]`,
		);
		// Also match dynamic path imports: import('./admin/AdminFoo.vue') or import('../AdminFoo.vue')
		const pathRe = new RegExp(`['"\`][^'"]+\\/${componentName}\\.vue['"\`]`);
		let usageCount = 0;
		const usedIn = [];

		for (const [srcFile, content] of srcContents) {
			if (srcFile === vueFile) continue;
			if (nameRe.test(content) || pathRe.test(content)) {
				usageCount++;
				usedIn.push(path.relative(ROOT, srcFile).replace(/\\/g, "/"));
			}
		}

		const entry = { component: componentName, path: relPath, usageCount, usedIn };
		results.push(entry);

		if (usageCount === 0) unused.push(componentName);
		else if (usageCount === 1) singleUse.push(componentName);
	}

	// Orphaned tests: spec file exists but no matching component
	const componentNames = new Set(
		vueFiles.map((f) => path.basename(f, ".vue")),
	);
	const orphanedTests = testFileNames.filter((f) => {
		const baseName = f.replace(/\.spec\.(js|ts)$/, "");
		// Only PascalCase names are component tests (e.g. MyModal.spec.js)
		// Lowercase-first = utility/module test (apiClient, mapPinHierarchy, etc.)
		if (!/^[A-Z]/.test(baseName)) return false;
		if (baseName.includes("Store")) return false;
		return !componentNames.has(baseName);
	});

	add(
		unused.length === 0,
		"components.none-unused",
		`${unused.length} unused: ${unused.slice(0, 8).join(", ")}${unused.length > 8 ? `... +${unused.length - 8} more` : ""}`,
	);
	add(
		orphanedTests.length === 0,
		"components.no-orphan-tests",
		`${orphanedTests.length} orphaned test files: ${orphanedTests.join(", ")}`,
	);
	// Single-use is informational: warn only if >40% are single-use
	const singleUseRatio = singleUse.length / vueFiles.length;
	add(
		singleUseRatio < 0.4,
		"components.single-use-ratio",
		`${singleUse.length}/${vueFiles.length} (${Math.round(singleUseRatio * 100)}%) have single usage`,
	);

	// Print summary
	console.log(`Total components: ${vueFiles.length}`);
	console.log(`  Shared (2+ usages): ${vueFiles.length - unused.length - singleUse.length}`);
	console.log(`  Single-use:         ${singleUse.length}`);
	console.log(`  Unused:             ${unused.length}`);
	if (orphanedTests.length)
		console.log(`  Orphaned tests:     ${orphanedTests.join(", ")}`);
	console.log();

	for (const row of checks) {
		console.log(
			`${row.ok ? "PASS" : "FAIL"} ${row.name}${row.detail ? ` :: ${row.detail}` : ""}`,
		);
	}

	if (unused.length) {
		console.log(`\nUnused components:`);
		unused.forEach((c) => console.log(`  - ${c}`));
	}

	await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
	await fs.writeFile(
		REPORT_PATH,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				summary: {
					total: vueFiles.length,
					shared: vueFiles.length - unused.length - singleUse.length,
					singleUse: singleUse.length,
					unused: unused.length,
					orphanedTests: orphanedTests.length,
				},
				unused,
				singleUse,
				orphanedTests,
				components: results,
			},
			null,
			2,
		),
	);
	console.log(`\nReport: reports/ci/components-audit.json`);
};

main().catch((err) => {
	console.error("[audit-components] Failed:", err?.message || err);
	process.exit(1);
});
