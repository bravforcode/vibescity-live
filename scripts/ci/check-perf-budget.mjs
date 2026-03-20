#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BUDGET = "perf-budget.json";
const DEFAULT_MAP_REPORT = "reports/performance/map-fps-benchmark.json";
const DEFAULT_FIELD_REPORT = "reports/performance/rum-field-summary.json";
const DEFAULT_API_REPORT = "reports/performance/api-sla-summary.json";
const DEFAULT_SUMMARY_MD = "reports/ci/perf-budget-summary.md";
const DEFAULT_SUMMARY_JSON = "reports/ci/perf-budget-summary.json";

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		budget: process.env.PERF_BUDGET_FILE || DEFAULT_BUDGET,
		mapReport: process.env.PERF_MAP_REPORT || DEFAULT_MAP_REPORT,
		fieldReport: process.env.PERF_FIELD_REPORT || DEFAULT_FIELD_REPORT,
		apiReport: process.env.PERF_API_REPORT || DEFAULT_API_REPORT,
		summaryMd: process.env.PERF_BUDGET_SUMMARY || DEFAULT_SUMMARY_MD,
		summaryJson: process.env.PERF_BUDGET_SUMMARY_JSON || DEFAULT_SUMMARY_JSON,
	};
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--budget":
				options.budget = String(next || options.budget);
				i += 1;
				break;
			case "--map-report":
				options.mapReport = String(next || options.mapReport);
				i += 1;
				break;
			case "--field-report":
				options.fieldReport = String(next || options.fieldReport);
				i += 1;
				break;
			case "--api-report":
				options.apiReport = String(next || options.apiReport);
				i += 1;
				break;
			case "--summary":
				options.summaryMd = String(next || options.summaryMd);
				i += 1;
				break;
			case "--summary-json":
				options.summaryJson = String(next || options.summaryJson);
				i += 1;
				break;
			default:
				break;
		}
	}
	return options;
};

const toNumber = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const readJsonIfExists = async (filePath) => {
	const abs = path.resolve(process.cwd(), filePath);
	try {
		const text = await readFile(abs, "utf8");
		return JSON.parse(text);
	} catch {
		return null;
	}
};

const ensureParent = async (filePath) => {
	const abs = path.resolve(process.cwd(), filePath);
	await mkdir(path.dirname(abs), { recursive: true });
	return abs;
};

const resolveMapBudgetProfile = ({ budget, mapReport }) => {
	const mapNode = budget?.map_fps || {};
	const profileMap =
		mapNode && typeof mapNode === "object" ? mapNode.profiles : null;
	if (!profileMap || typeof profileMap !== "object") {
		return {
			profile: "legacy",
			budget: {
				tier_b: mapNode?.tier_b || {},
				tier_c: mapNode?.tier_c || {},
			},
		};
	}

	const requestedProfile = String(process.env.PERF_MAP_PROFILE || "").trim();
	const autoProfile = mapReport?.config?.headless
		? "synthetic_headless"
		: "real_device";
	const defaultProfile =
		String(mapNode.default_profile || "").trim() ||
		(Object.keys(profileMap).find(Boolean) ?? "synthetic_headless");
	const profile = requestedProfile || autoProfile || defaultProfile;
	const selected = profileMap[profile] || profileMap[defaultProfile] || {};
	return {
		profile,
		budget: {
			tier_b: selected?.tier_b || {},
			tier_c: selected?.tier_c || {},
		},
	};
};

const pickMapMetric = (mapReport, profile, scenario) => {
	const results = Array.isArray(mapReport?.results) ? mapReport.results : [];
	return (
		results.find(
			(item) =>
				item?.ok &&
				String(item?.profile || "") === profile &&
				String(item?.scenario || "") === scenario,
		) || null
	);
};

const evaluate = (name, actual, expected, compare = "max") => {
	let pass = true;
	if (compare === "max") pass = actual <= expected;
	if (compare === "min") pass = actual >= expected;
	return { name, actual, expected, compare, pass };
};

const buildMarkdown = (results, notes) => {
	const lines = [];
	lines.push("## Perf Budget Summary");
	lines.push("");
	lines.push("| Check | Actual | Expected | Comparator | Status |");
	lines.push("|---|---:|---:|---|---|");
	for (const item of results) {
		lines.push(
			`| ${item.name} | ${item.actual} | ${item.expected} | ${item.compare} | ${item.pass ? "PASS" : "FAIL"} |`,
		);
	}
	lines.push("");
	if (notes.length) {
		lines.push("### Notes");
		lines.push("");
		for (const note of notes) {
			lines.push(`- ${note}`);
		}
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
};

const main = async () => {
	const options = parseArgs();
	const budget = await readJsonIfExists(options.budget);
	if (!budget) {
		console.error(`Perf budget file not found or invalid: ${options.budget}`);
		process.exit(1);
	}

	const mapReport = await readJsonIfExists(options.mapReport);
	const fieldReport = await readJsonIfExists(options.fieldReport);
	const apiReport = await readJsonIfExists(options.apiReport);
	const mapBudgetProfile = resolveMapBudgetProfile({ budget, mapReport });

	const results = [];
	const notes = [];
	const hardFailures = [];

	if (mapReport) {
		const tierBResult =
			pickMapMetric(mapReport, "android", "baseline") ||
			pickMapMetric(mapReport, "ios", "baseline");
		if (tierBResult) {
			results.push(
				evaluate(
					"map.tier_b.median_fps",
					toNumber(tierBResult?.metrics?.fps?.p50, 0),
					toNumber(mapBudgetProfile?.budget?.tier_b?.median_fps_min, 55),
					"min",
				),
			);
		} else {
			notes.push("Tier B baseline lane missing in map report.");
		}

		const tierCResult =
			pickMapMetric(mapReport, "android", "network-2g") ||
			pickMapMetric(mapReport, "android", "network-3g") ||
			pickMapMetric(mapReport, "ios", "network-2g");
		if (tierCResult) {
			results.push(
				evaluate(
					"map.tier_c.p95_fps",
					toNumber(tierCResult?.metrics?.fps?.p95, 0),
					toNumber(mapBudgetProfile?.budget?.tier_c?.p95_fps_min, 45),
					"min",
				),
			);
		} else {
			notes.push("Tier C network lane missing in map report.");
		}
	} else {
		notes.push(`Map report not found: ${options.mapReport}`);
		hardFailures.push("Map report missing");
	}

	if (fieldReport) {
		const runtimeBudget = budget?.runtime || {};
		const touchBudget = budget?.touch || {};
		if (Number.isFinite(Number(fieldReport?.inp_p75_ms))) {
			results.push(
				evaluate(
					"field.inp_p75_ms",
					toNumber(fieldReport.inp_p75_ms),
					toNumber(runtimeBudget.inp_p75_ms_max, 200),
					"max",
				),
			);
		}
		if (Number.isFinite(Number(fieldReport?.fcp_ms))) {
			results.push(
				evaluate(
					"field.fcp_ms",
					toNumber(fieldReport.fcp_ms),
					toNumber(runtimeBudget.fcp_ms_max, 1000),
					"max",
				),
			);
		}
		if (Number.isFinite(Number(fieldReport?.touch_to_scroll_start_p75_ms))) {
			results.push(
				evaluate(
					"field.touch_to_scroll_start_p75_ms",
					toNumber(fieldReport.touch_to_scroll_start_p75_ms),
					toNumber(touchBudget.touch_to_scroll_start_p75_ms_max, 24),
					"max",
				),
			);
		}
	} else {
		notes.push(`Field report not found: ${options.fieldReport} (skipped field checks).`);
	}

	if (apiReport) {
		const endpointBudgets = budget?.backend_sla?.endpoints || {};
		for (const [endpoint, endpointBudget] of Object.entries(endpointBudgets)) {
			const row = apiReport?.endpoints?.[endpoint];
			if (!row) {
				notes.push(`API report missing endpoint lane: ${endpoint}`);
				continue;
			}
			if (Number.isFinite(Number(endpointBudget?.p50_ms_max))) {
				results.push(
					evaluate(
						`api.${endpoint}.p50_ms`,
						toNumber(row.p50_ms),
						toNumber(endpointBudget.p50_ms_max),
						"max",
					),
				);
			}
			if (Number.isFinite(Number(endpointBudget?.p95_ms_max))) {
				results.push(
					evaluate(
						`api.${endpoint}.p95_ms`,
						toNumber(row.p95_ms),
						toNumber(endpointBudget.p95_ms_max),
						"max",
					),
				);
			}
			if (Number.isFinite(Number(endpointBudget?.p99_ms_max))) {
				results.push(
					evaluate(
						`api.${endpoint}.p99_ms`,
						toNumber(row.p99_ms),
						toNumber(endpointBudget.p99_ms_max),
						"max",
					),
				);
			}
		}
		if (Number.isFinite(Number(apiReport?.error_rate?.five_xx_percent))) {
			results.push(
				evaluate(
					"api.error_rate.5xx_percent",
					toNumber(apiReport.error_rate.five_xx_percent),
					toNumber(budget?.backend_sla?.error_rate?.five_xx_max_percent, 0.1),
					"max",
				),
			);
		}
		if (Number.isFinite(Number(apiReport?.error_rate?.four_xx_percent))) {
			results.push(
				evaluate(
					"api.error_rate.4xx_percent",
					toNumber(apiReport.error_rate.four_xx_percent),
					toNumber(budget?.backend_sla?.error_rate?.four_xx_max_percent, 5),
					"max",
				),
			);
		}
	} else {
		notes.push(`API report not found: ${options.apiReport} (skipped API checks).`);
	}

	const markdown = buildMarkdown(results, notes);
	const summaryMdAbs = await ensureParent(options.summaryMd);
	await writeFile(summaryMdAbs, markdown, "utf8");

	const failed = results.filter((item) => !item.pass);
	const summaryJsonAbs = await ensureParent(options.summaryJson);
	await writeFile(
		summaryJsonAbs,
		`${JSON.stringify(
			{
				generated_at: new Date().toISOString(),
				budget_file: options.budget,
				map_budget_profile: mapBudgetProfile.profile,
				results,
				notes,
				hard_failures: hardFailures,
				failed_count: failed.length,
				passed_count: results.length - failed.length,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	console.log(`Perf budget summary: ${summaryMdAbs}`);
	console.log(`Perf budget JSON: ${summaryJsonAbs}`);
	if (!results.length) {
		console.error("Perf budget failed: no evaluable metrics were found.");
		process.exit(1);
	}
	if (hardFailures.length > 0) {
		for (const reason of hardFailures) {
			console.error(`Perf budget hard failure: ${reason}`);
		}
		process.exit(1);
	}
	if (failed.length > 0) {
		for (const fail of failed) {
			console.error(
				`Perf budget failed: ${fail.name} actual=${fail.actual} expected=${fail.compare} ${fail.expected}`,
			);
		}
		process.exit(1);
	}
};

main().catch((error) => {
	console.error("Failed to check perf budget:", error);
	process.exit(1);
});
