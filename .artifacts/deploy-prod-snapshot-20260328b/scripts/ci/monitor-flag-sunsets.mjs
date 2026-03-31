#!/usr/bin/env node
/**
 * Monitor Feature Flag Sunsets
 * Run: node scripts/ci/monitor-flag-sunsets.mjs
 *
 * Tracks which flags are approaching sunset and need removal/cleanup.
 * Generates warnings for upcoming deadlines.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const GOVERNANCE_PATH = path.join(ROOT, "src/config/featureFlagGovernance.js");

const main = async () => {
	const { FLAG_GOVERNANCE } = await import(
		pathToFileURL(GOVERNANCE_PATH).href
	);

	const now = new Date();
	const inThreeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

	const flags = Object.entries(FLAG_GOVERNANCE);
	const upcoming = [];
	const overdue = [];
	const healthy = [];

	for (const [key, config] of flags) {
		if (!config.sunsetAfter) {
			healthy.push({ key, sunsetAfter: "no sunset" });
			continue;
		}

		// Parse 2026-Q4 format → actual date
		const match = config.sunsetAfter.match(/^(\d{4})-Q([1-4])$/);
		if (!match) {
			console.warn(`⚠️  Invalid sunset format: ${key} = ${config.sunsetAfter}`);
			continue;
		}

		const [, year, quarter] = match;
		const monthOfQuarterEnd = parseInt(quarter) * 3; // Q4 → month 12
		const sunsetDate = new Date(
			parseInt(year),
			monthOfQuarterEnd - 1,
			1,
			23,
			59,
			59,
		);

		if (sunsetDate < now) {
			overdue.push({
				key,
				sunsetAfter: config.sunsetAfter,
				daysOverdue: Math.floor((now - sunsetDate) / (24 * 60 * 60 * 1000)),
				owner: config.owner,
			});
		} else if (sunsetDate < inThreeMonths) {
			upcoming.push({
				key,
				sunsetAfter: config.sunsetAfter,
				daysRemaining: Math.floor((sunsetDate - now) / (24 * 60 * 60 * 1000)),
				owner: config.owner,
			});
		} else {
			healthy.push({ key, sunsetAfter: config.sunsetAfter });
		}
	}

	console.log("\n=== FEATURE FLAG SUNSET MONITOR ===\n");

	if (overdue.length > 0) {
		console.log(`🔴 OVERDUE (${overdue.length})`);
		for (const flag of overdue) {
			console.log(
				`   ${flag.key.padEnd(30)} [REMOVE] ${flag.sunsetAfter} (${flag.daysOverdue}+ days)`,
			);
		}
		console.log(
			`\n   ⚠️  ACTION: Remove these flags immediately. Owner: ${overdue.map((f) => f.owner).join(", ")}\n`,
		);
	}

	if (upcoming.length > 0) {
		console.log(`🟡 UPCOMING (${upcoming.length})`);
		for (const flag of upcoming) {
			const urgency =
				flag.daysRemaining <= 30 ? "🔥 URGENT" : "⏰ SOON";
			console.log(
				`   ${urgency} ${flag.key.padEnd(24)} ${flag.sunsetAfter} (${flag.daysRemaining} days)`,
			);
		}
		console.log(
			`\n   ACTION: Plan removal/migration. Owner: ${upcoming.map((f) => f.owner).join(", ")}\n`,
		);
	}

	if (healthy.length > 0) {
		console.log(`✅ HEALTHY (${healthy.length})`);
		for (const flag of healthy.slice(0, 3)) {
			console.log(
				`   ${flag.key.padEnd(30)} ${flag.sunsetAfter || "permanent"}`,
			);
		}
		if (healthy.length > 3) {
			console.log(`   ... and ${healthy.length - 3} more`);
		}
		console.log("");
	}

	console.log("=== SUMMARY ===\n");
	console.log(`Total flags: ${flags.length}`);
	console.log(`  ✅ Healthy: ${healthy.length}`);
	console.log(`  🟡 Approaching sunset: ${upcoming.length}`);
	console.log(`  🔴 Overdue for removal: ${overdue.length}`);
	console.log("");

	if (overdue.length > 0) {
		console.log(
			"⚠️  ALERT: Fix overdue flag removals before next release!",
		);
		process.exit(1);
	}

	if (upcoming.length > 0 && upcoming.some((f) => f.daysRemaining <= 30)) {
		console.log("⚠️  WARNING: Flags expiring within 30 days!");
	}
};

main().catch((err) => {
	console.error("[monitor-flag-sunsets] Failed:", err?.message || err);
	process.exit(1);
});
