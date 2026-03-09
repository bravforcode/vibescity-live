#!/usr/bin/env node
/**
 * Feature Flag Auditor
 * bun run flags:audit
 *
 * Reports:
 * - Flags past their sunset date (dead code candidates)
 * - Flags in governance config but never referenced in code
 * - Flags referenced in code but not declared in governance
 * - Hardcoded boolean comparisons (always-true/false)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const GOVERNANCE_PATH = path.join(ROOT, "src/config/featureFlagGovernance.js");
// Search src/ AND tests/ — flags referenced in tests are legitimately "used"
const SEARCH_DIRS = [path.join(ROOT, "src"), path.join(ROOT, "tests")];
const REPORT_PATH = path.join(ROOT, "reports/ci/flags-audit.json");

const checks = [];
const add = (ok, name, detail = "") => checks.push({ ok, name, detail });

async function collectSourceFiles(dir) {
	const files = [];
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "tmp") continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectSourceFiles(fullPath)));
		} else if ([".vue", ".js", ".ts"].some((e) => entry.name.endsWith(e))) {
			files.push(fullPath);
		}
	}
	return files;
}

const main = async () => {
	// Import governance — works because project is ESM ("type": "module")
	const { FLAG_GOVERNANCE, getFlagGovernanceViolations, isGovernanceSunsetExceeded } =
		await import(pathToFileURL(GOVERNANCE_PATH).href);

	const flagKeys = Object.keys(FLAG_GOVERNANCE);

	// 1. Sunset violations (treat all flags as enabled to catch all potential violations)
	const allEnabled = Object.fromEntries(flagKeys.map((k) => [k, true]));
	const sunsetViolations = getFlagGovernanceViolations({
		flags: allEnabled,
		now: new Date(),
	});
	add(
		sunsetViolations.length === 0,
		"flags.sunset-not-expired",
		sunsetViolations.length > 0
			? `Past sunset: ${sunsetViolations.map((v) => `${v.key} (${v.sunsetAfter})`).join(", ")}`
			: "All flags within sunset window",
	);

	// 2. Scan source + test files
	const srcFiles = (
		await Promise.all(SEARCH_DIRS.map(collectSourceFiles))
	).flat();

	const flagUsage = new Map(flagKeys.map((k) => [k, []]));
	const hardcodedComparisons = new Map();
	const undeclaredRefs = new Map();

	for (const file of srcFiles) {
		if (file === GOVERNANCE_PATH) continue;
		const content = await fs.readFile(file, "utf8").catch(() => "");
		const relPath = path.relative(ROOT, file).replace(/\\/g, "/");

		// Track usage of known flags
		for (const key of flagKeys) {
			if (content.includes(key)) {
				flagUsage.get(key).push(relPath);
			}
		}

		// Detect hardcoded boolean comparisons for known flags
		for (const key of flagKeys) {
			if (!content.includes(key)) continue;
			const alwaysTrueRe = new RegExp(
				`${key}\\s*===?\\s*true|true\\s*===?\\s*${key}`,
			);
			const alwaysFalseRe = new RegExp(
				`${key}\\s*===?\\s*false|false\\s*===?\\s*${key}`,
			);
			if (alwaysTrueRe.test(content) || alwaysFalseRe.test(content)) {
				if (!hardcodedComparisons.has(key)) hardcodedComparisons.set(key, []);
				hardcodedComparisons.get(key).push(relPath);
			}
		}

		// Detect undeclared flag patterns: strings that look like flag keys
		// but aren't in governance — scan for ff_xxx or enable_xxx patterns
		const undeclaredRe = /\b(ff_[a-z_]+|enable_[a-z_]+)\b/g;
		for (const m of content.matchAll(undeclaredRe)) {
			const ref = m[1];
			if (!FLAG_GOVERNANCE[ref] && ref !== "ff_" && ref !== "enable_") {
				if (!undeclaredRefs.has(ref)) undeclaredRefs.set(ref, []);
				if (!undeclaredRefs.get(ref).includes(relPath)) {
					undeclaredRefs.get(ref).push(relPath);
				}
			}
		}
	}

	// 3. Dead flags (in governance but never used in code)
	const deadFlags = flagKeys.filter((k) => flagUsage.get(k).length === 0);
	add(
		deadFlags.length === 0,
		"flags.no-dead-flags",
		deadFlags.length > 0
			? `Never referenced in code: ${deadFlags.join(", ")}`
			: "All governance flags referenced in code",
	);

	// 4. Hardcoded comparisons
	add(
		hardcodedComparisons.size === 0,
		"flags.no-hardcoded-comparisons",
		hardcodedComparisons.size > 0
			? `Hardcoded === true/false: ${[...hardcodedComparisons.keys()].join(", ")}`
			: "No hardcoded flag boolean comparisons",
	);

	// 5. Undeclared flags referenced in code (informational — may be false positives)
	const significantUndeclared = [...undeclaredRefs.entries()].filter(
		([, files]) => files.length >= 2,
	);
	add(
		significantUndeclared.length === 0,
		"flags.no-undeclared-refs",
		significantUndeclared.length > 0
			? `Referenced but not in governance (2+ files): ${significantUndeclared.map(([k]) => k).join(", ")}`
			: "No significant undeclared flag references",
	);

	// Print summary
	console.log(`\nGovernance flags: ${flagKeys.length}`);
	console.log();
	for (const key of flagKeys) {
		const count = flagUsage.get(key).length;
		const config = FLAG_GOVERNANCE[key];
		const expired =
			config.sunsetAfter && isGovernanceSunsetExceeded(config.sunsetAfter)
				? " [EXPIRED]"
				: "";
		const sunset = config.sunsetAfter ? `sunset: ${config.sunsetAfter}` : "no sunset";
		console.log(`  ${key}: ${count} file(s) | ${sunset}${expired}`);
	}
	console.log();

	for (const row of checks) {
		console.log(
			`${row.ok ? "PASS" : "FAIL"} ${row.name}${row.detail ? ` :: ${row.detail}` : ""}`,
		);
	}

	await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
	await fs.writeFile(
		REPORT_PATH,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				sunsetViolations,
				deadFlags,
				hardcodedComparisons: Object.fromEntries(hardcodedComparisons),
				undeclaredRefs: Object.fromEntries(significantUndeclared),
				flagUsage: Object.fromEntries(
					[...flagUsage].map(([k, v]) => [k, v.length]),
				),
				flagDetails: Object.fromEntries(
					flagKeys.map((k) => [k, FLAG_GOVERNANCE[k]]),
				),
			},
			null,
			2,
		),
	);
	console.log(`\nReport: reports/ci/flags-audit.json`);

	const failed = checks.filter((r) => !r.ok);
	if (failed.length) process.exit(1);
};

main().catch((err) => {
	console.error("[audit-feature-flags] Failed:", err?.message || err);
	process.exit(1);
});
