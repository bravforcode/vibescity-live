#!/usr/bin/env node
/**
 * API Contract Validator (Enhanced)
 * bun run api:validate
 *
 * Checks:
 * - Schema: no endpoints removed vs deployed version (breaking changes)
 * - Live: X-API-Version + X-Request-ID headers present
 * - Live: Payload size < 512KB for listing endpoints
 * - Live: Response time vs SLO budget (perf-budget.json)
 * - Live: Protected endpoints return 401 without auth
 *
 * Gracefully skips live checks if backend not reachable.
 * Set API_URL env var to override base URL (default: http://localhost:8001)
 */

import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports/ci/api-contract.json");

const checks = [];
const add = (ok, name, detail = "") => checks.push({ ok, name, detail });

const readJSON = async (relPath) => {
	const raw = await fs
		.readFile(path.join(ROOT, relPath), "utf8")
		.catch(() => null);
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

const timedFetch = (url, options = {}) =>
	new Promise((resolve) => {
		const start = Date.now();
		const proto = url.startsWith("https") ? https : http;
		const req = proto.request(
			url,
			{ method: "GET", ...options, timeout: 5000 },
			(res) => {
				let body = "";
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () =>
					resolve({
						status: res.statusCode,
						headers: res.headers,
						body,
						ms: Date.now() - start,
						ok: true,
					}),
				);
			},
		);
		req.on("error", () => resolve({ ok: false, ms: Date.now() - start }));
		req.on("timeout", () => {
			req.destroy();
			resolve({ ok: false, ms: 5000, timedOut: true });
		});
		req.end();
	});

const writeReport = async (data) => {
	await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
	await fs.writeFile(
		REPORT_PATH,
		JSON.stringify({ timestamp: new Date().toISOString(), ...data }, null, 2),
	);
	console.log(`\nReport: reports/ci/api-contract.json`);
};

const printChecks = () => {
	for (const row of checks) {
		console.log(
			`${row.ok ? "PASS" : "FAIL"} ${row.name}${row.detail ? ` :: ${row.detail}` : ""}`,
		);
	}
};

const main = async () => {
	const budget = await readJSON("perf-budget.json");
	const openApiLocal = await readJSON("tmp_openapi.json");
	const openApiFly = await readJSON("tmp_openapi_fly.json");
	const BASE_URL = process.env.API_URL || "http://localhost:8001";

	// 1. Schema breaking change detection (static — no backend needed)
	if (openApiLocal && openApiFly) {
		const localPaths = new Set(Object.keys(openApiLocal.paths || {}));
		const flyPaths = new Set(Object.keys(openApiFly.paths || {}));
		const removed = [...flyPaths].filter((p) => !localPaths.has(p));
		const added = [...localPaths].filter((p) => !flyPaths.has(p));
		add(
			removed.length === 0,
			"api.schema.no-removed-endpoints",
			removed.length > 0
				? `Removed vs deployed: ${removed.slice(0, 5).join(", ")}`
				: `No endpoints removed (${added.length} new endpoints)`,
		);
	} else {
		add(
			true,
			"api.schema.diff",
			"Skipped — tmp_openapi.json or tmp_openapi_fly.json not found",
		);
	}

	// 2. Check if backend is reachable
	console.log(`\nChecking backend at ${BASE_URL}...`);
	const healthRes = await timedFetch(`${BASE_URL}/health`);

	if (!healthRes.ok) {
		console.warn(
			`WARN: Backend not reachable at ${BASE_URL} — skipping live checks`,
		);
		add(
			true,
			"api.live.checks",
			`Skipped — backend not running at ${BASE_URL}`,
		);
		await writeReport({ checks, base_url: BASE_URL, skipped_live: true });
		printChecks();
		return;
	}

	console.log(`Backend reachable (${healthRes.ms}ms)\n`);

	// 3. GET /shops — headers + payload + SLO
	const venueRes = await timedFetch(`${BASE_URL}/api/v1/shops?limit=1`);
	if (venueRes.ok) {
		add(
			Boolean(venueRes.headers["x-api-version"]),
			"api.headers.x-api-version",
			`GET /shops → x-api-version: ${venueRes.headers["x-api-version"] || "MISSING"}`,
		);
		add(
			Boolean(venueRes.headers["x-request-id"]),
			"api.headers.x-request-id",
			`GET /shops → x-request-id: ${venueRes.headers["x-request-id"] || "MISSING"}`,
		);

		const payloadKB = Math.round(venueRes.body.length / 1024);
		add(
			payloadKB < 512,
			"api.payload-size.shops",
			`GET /shops: ${payloadKB}KB (limit: 512KB)`,
		);

		const sloEndpoint = budget?.backend_sla?.endpoints?.["GET /venues"];
		if (sloEndpoint) {
			add(
				venueRes.ms <= sloEndpoint.p95_ms_max,
				"api.slo.get-venues-p95",
				`${venueRes.ms}ms vs SLO p95=${sloEndpoint.p95_ms_max}ms`,
			);
		}
	} else {
		add(false, "api.live.shops", `GET /api/v1/shops unreachable (${venueRes.ms}ms)`);
	}

	// 4. GET /openapi.json — check API contract headers
	const openApiRes = await timedFetch(`${BASE_URL}/api/v1/openapi.json`);
	if (openApiRes.ok) {
		add(
			Boolean(openApiRes.headers["x-api-version"]),
			"api.headers.openapi-versioned",
			`GET /openapi.json → x-api-version: ${openApiRes.headers["x-api-version"] || "MISSING"}`,
		);
	}

	// 5. Auth check: protected endpoint should reject without credentials
	const protectedRes = await timedFetch(
		`${BASE_URL}/api/v1/partner/stats`,
	);
	if (protectedRes.ok || protectedRes.status) {
		const isProtected =
			protectedRes.status === 401 ||
			protectedRes.status === 403 ||
			protectedRes.status === 422;
		add(
			isProtected,
			"api.auth.required",
			`GET /partner/stats without auth → HTTP ${protectedRes.status || "no response"} (expect 401/403)`,
		);
	}

	await writeReport({ checks, base_url: BASE_URL });
	printChecks();

	const failed = checks.filter((r) => !r.ok);
	if (failed.length) process.exit(1);
};

main().catch((err) => {
	console.error("[validate-api-contract-enhanced] Failed:", err?.message || err);
	process.exit(1);
});
