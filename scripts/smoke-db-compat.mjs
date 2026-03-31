import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = process.cwd();
const ENV_FILE_CANDIDATES = [
	".env",
	".env.local",
	".env.production",
	".env.production.local",
];
const shellEnv = new Set(Object.keys(process.env));
const mergedEnv = {};

for (const envFile of ENV_FILE_CANDIDATES) {
	const fullPath = path.join(ROOT, envFile);
	if (!fs.existsSync(fullPath)) {
		continue;
	}

	Object.assign(mergedEnv, dotenv.parse(fs.readFileSync(fullPath, "utf8")));
}

for (const [key, value] of Object.entries(mergedEnv)) {
	if (!shellEnv.has(key)) {
		process.env[key] = value;
	}
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
	process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
	console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in env");
	process.exit(1);
}

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: { persistSession: false },
});

const results = [];

function addResult(status, name, detail) {
	results.push({ status, name, detail });
	const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌";
	console.log(
		`${icon} ${status.padEnd(4)} ${name}${detail ? ` :: ${detail}` : ""}`,
	);
}

function isMissingFunction(error) {
	const code = String(error?.code || "").toUpperCase();
	const msg = String(error?.message || "").toLowerCase();
	return (
		code === "PGRST202" ||
		code === "42883" ||
		msg.includes("could not find the function")
	);
}

function isPermission(error) {
	const code = String(error?.code || "").toUpperCase();
	const msg = String(error?.message || "").toLowerCase();
	return (
		code === "42501" ||
		msg.includes("permission denied") ||
		msg.includes("not allowed")
	);
}

function isNotAuthenticated(error) {
	const msg = String(error?.message || "").toLowerCase();
	return (
		msg.includes("not_authenticated") ||
		msg.includes("unauthenticated") ||
		msg.includes("jwt")
	);
}

function isAuthBoundary(status, error) {
	return (
		status === 401 ||
		status === 403 ||
		isPermission(error) ||
		isNotAuthenticated(error)
	);
}

async function checkTableExists(tableName, options = {}) {
	const { allowPermission = false } = options;
	const { error, status } = await anon
		.from(tableName)
		.select("*", { head: true, count: "exact" });

	if (!error) {
		addResult("PASS", `table:${tableName}`, "reachable");
		return;
	}

	if (String(error.code || "").toUpperCase() === "PGRST205") {
		addResult("FAIL", `table:${tableName}`, "not found");
		return;
	}

	if (allowPermission && isAuthBoundary(status, error)) {
		addResult(
			"PASS",
			`table:${tableName}`,
			`exists (permission-guarded${status ? `: ${status}` : ""})`,
		);
		return;
	}

	addResult(
		"FAIL",
		`table:${tableName}`,
		`${error.code || ""} ${error.message || "unknown"}`,
	);
}

async function callRpc(name, params, options = {}) {
	const { allowPermission = false, allowUnauthenticated = false } = options;

	const { error, status } = await anon.rpc(name, params);

	if (!error) {
		addResult("PASS", `rpc:${name}`, "ok");
		return;
	}

	if (isMissingFunction(error)) {
		addResult("FAIL", `rpc:${name}`, `missing (${error.code || ""})`);
		return;
	}

	if (allowPermission && isAuthBoundary(status, error)) {
		addResult(
			"PASS",
			`rpc:${name}`,
			`exists (permission-guarded: ${error.code || ""})`,
		);
		return;
	}

	if (allowUnauthenticated && isNotAuthenticated(error)) {
		addResult("PASS", `rpc:${name}`, "exists (auth required)");
		return;
	}

	addResult(
		"FAIL",
		`rpc:${name}`,
		`${error.code || ""} ${error.message || "unknown"}`,
	);
}

async function callRpcWithVariants(name, paramVariants, options = {}) {
	let lastError = null;

	for (const params of paramVariants) {
		const { error, status } = await anon.rpc(name, params);

		if (!error) {
			const variantName = Object.keys(params || {}).join(",") || "default";
			addResult(
				"PASS",
				`rpc:${name}`,
				variantName === "default" ? "ok" : `ok (${variantName})`,
			);
			return;
		}

		if (options.allowPermission && isAuthBoundary(status, error)) {
			addResult(
				"PASS",
				`rpc:${name}`,
				`exists (permission-guarded: ${error.code || ""})`,
			);
			return;
		}

		if (options.allowUnauthenticated && isNotAuthenticated(error)) {
			addResult("PASS", `rpc:${name}`, "exists (auth required)");
			return;
		}

		lastError = error;
		if (!isMissingFunction(error)) {
			break;
		}
	}

	addResult(
		"FAIL",
		`rpc:${name}`,
		`${lastError?.code || ""} ${lastError?.message || "unknown"}`.trim(),
	);
}

async function checkStorageBucket(bucket, allowPermission = false) {
	const { error } = await anon.storage.from(bucket).list("", { limit: 1 });

	if (!error) {
		addResult("PASS", `storage:${bucket}`, "ok");
		return;
	}

	const msg = String(error.message || "").toLowerCase();
	if (msg.includes("bucket not found")) {
		addResult("FAIL", `storage:${bucket}`, "bucket not found");
		return;
	}

	if (allowPermission && isPermission(error)) {
		addResult("PASS", `storage:${bucket}`, "exists (permission-guarded)");
		return;
	}

	addResult("WARN", `storage:${bucket}`, `${error.message || "unknown"}`);
}

async function getSampleVenueId() {
	const primary = await anon.from("venues").select("id").limit(1).maybeSingle();
	if (!primary.error && primary.data?.id) return primary.data.id;

	return "00000000-0000-0000-0000-000000000000";
}

async function main() {
	console.log("\n=== VibeCity DB Compat Smoke ===\n");

	const tables = [
		"venue_slug_history",
		"partner_referrals",
		"partner_commission_ledger",
		"analytics_events",
		"check_ins",
		"visitor_gamification_stats",
	];

	for (const table of tables) {
		await checkTableExists(table, {
			allowPermission: [
				"partner_referrals",
				"partner_commission_ledger",
			].includes(table),
		});
	}

	const sampleVenueId = await getSampleVenueId();
	const visitorId = `smoke_${Date.now()}`;

	await callRpc("search_venues", {
		p_query: "",
		p_lat: 13.7563,
		p_lng: 100.5018,
		p_radius_km: 5,
	});

	await callRpc("get_feed_cards", {
		p_lat: 13.7563,
		p_lng: 100.5018,
	});

	await callRpc("get_map_pins", {
		p_min_lat: 13.7,
		p_min_lng: 100.45,
		p_max_lat: 13.82,
		p_max_lng: 100.58,
		p_zoom: 16,
	});

	await callRpc("increment_venue_views", { venue_id: null });

	await callRpcWithVariants("get_venue_stats", [
		{ p_shop_id: sampleVenueId },
		{ p_venue_id: sampleVenueId },
	]);

	await callRpc("update_venue_anonymous", {
		p_shop_id: sampleVenueId,
		p_visitor_id: visitorId,
		p_updates: {
			name: "",
			category: "",
			description: "",
		},
	});

	await callRpc("get_daily_checkin_status", { p_visitor_id: visitorId });
	await callRpc("claim_daily_checkin", { p_visitor_id: visitorId });
	await callRpc("get_lucky_wheel_status", { p_visitor_id: visitorId });
	await callRpc("spin_lucky_wheel", { p_visitor_id: visitorId });

	await callRpc(
		"create_partner_profile",
		{ p_display_name: "Smoke Partner", p_referral_code: null },
		{ allowPermission: true, allowUnauthenticated: true },
	);

	await callRpc(
		"upsert_partner_secrets",
		{
			p_bank_code: "KBANK",
			p_account_name: "SMOKE",
			p_account_number: null,
			p_promptpay_id: null,
		},
		{ allowPermission: true, allowUnauthenticated: true },
	);

	await checkStorageBucket("payment-slips", false);
	await checkStorageBucket("sensitive-uploads", true);

	const failCount = results.filter((r) => r.status === "FAIL").length;
	const warnCount = results.filter((r) => r.status === "WARN").length;
	const passCount = results.filter((r) => r.status === "PASS").length;

	const report = [
		"VibeCity DB Compat Smoke Report",
		`pass=${passCount} warn=${warnCount} fail=${failCount}`,
		...results.map((r) => `${r.status}\t${r.name}\t${r.detail || ""}`),
	].join("\n");

	fs.writeFileSync("scripts/db_compat_smoke_result.txt", `${report}\n`, "utf8");

	console.log("\n=== Summary ===");
	console.log(`PASS: ${passCount}`);
	console.log(`WARN: ${warnCount}`);
	console.log(`FAIL: ${failCount}`);
	console.log("Report: scripts/db_compat_smoke_result.txt\n");

	process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error("Smoke test crashed:", error);
	process.exit(1);
});
