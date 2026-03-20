#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_INPUT = "reports/performance/map-fps-benchmark.json";
const DEFAULT_THRESHOLDS = "scripts/ci/map-fps-thresholds.json";
const DEFAULT_SUMMARY = "reports/ci/map-fps-guardrail-summary.md";
const DEFAULT_JSON_SUMMARY = "reports/ci/map-fps-guardrail-summary.json";

const toNumber = (value, fallback) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		input: process.env.MAP_FPS_INPUT || DEFAULT_INPUT,
		thresholds: process.env.MAP_FPS_THRESHOLDS || DEFAULT_THRESHOLDS,
		summary: process.env.MAP_FPS_SUMMARY || DEFAULT_SUMMARY,
		jsonSummary: process.env.MAP_FPS_SUMMARY_JSON || DEFAULT_JSON_SUMMARY,
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--input":
				options.input = String(next || options.input);
				i += 1;
				break;
			case "--thresholds":
				options.thresholds = String(next || options.thresholds);
				i += 1;
				break;
			case "--summary":
				options.summary = String(next || options.summary);
				i += 1;
				break;
			case "--json-summary":
				options.jsonSummary = String(next || options.jsonSummary);
				i += 1;
				break;
			default:
				break;
		}
	}
	return options;
};

const mergeThresholds = (...parts) => {
	const merged = {};
	for (const part of parts) {
		if (!part || typeof part !== "object") continue;
		for (const [key, value] of Object.entries(part)) {
			if (value === undefined || value === null) continue;
			merged[key] = value;
		}
	}
	return merged;
};

const resolveThresholdCatalog = ({ thresholds, report }) => {
	const profileMap =
		thresholds && typeof thresholds === "object" ? thresholds.profiles : null;
	if (!profileMap || typeof profileMap !== "object") {
		return {
			profile: "legacy",
			config: thresholds || {},
		};
	}

	const requestedProfile = String(process.env.MAP_FPS_GUARDRAIL_PROFILE || "").trim();
	const autoProfile = report?.config?.headless
		? "synthetic_headless"
		: "real_device";
	const defaultProfile =
		String(thresholds.default_profile || "").trim() ||
		(Object.keys(profileMap).find(Boolean) ?? "synthetic_headless");
	const profile = requestedProfile || autoProfile || defaultProfile;
	const config = profileMap[profile] || profileMap[defaultProfile] || {};
	return { profile, config };
};

const resolveThresholdFor = ({ profile, scenario, thresholds }) => {
	const globalDefault = thresholds.default || {};
	const globalScenario = thresholds.scenario_overrides?.[scenario] || {};
	const profileNode = thresholds.profile_overrides?.[profile] || {};
	const profileDefault = profileNode.default || {};
	const profileScenario = profileNode.scenario_overrides?.[scenario] || {};
	return mergeThresholds(globalDefault, globalScenario, profileDefault, profileScenario);
};

const evaluateResult = ({ result, threshold }) => {
	if (!result?.ok) {
		return {
			passed: false,
			reasons: [result?.error || "benchmark_failed"],
		};
	}

	const p95Fps = toNumber(result?.metrics?.fps?.p95, 0);
	const avgFps = toNumber(result?.metrics?.fps?.avg, 0);
	const samples = toNumber(result?.metrics?.samples, 0);
	const minP95 = toNumber(threshold?.p95_fps_min, 0);
	const minAvg = toNumber(threshold?.avg_fps_min, 0);
	const minSamples = toNumber(threshold?.min_sample_count, 0);
	const reasons = [];

	if (minSamples > 0 && samples < minSamples) {
		reasons.push(`samples ${samples} < min_sample_count ${minSamples}`);
	}
	if (minP95 > 0 && p95Fps < minP95) {
		reasons.push(`p95_fps ${p95Fps} < min ${minP95}`);
	}
	if (minAvg > 0 && avgFps < minAvg) {
		reasons.push(`avg_fps ${avgFps} < min ${minAvg}`);
	}

	return {
		passed: reasons.length === 0,
		reasons,
	};
};

const buildMarkdownSummary = ({
	reportPath,
	thresholdPath,
	thresholdProfile,
	evaluations,
}) => {
	const lines = [];
	lines.push("## Map FPS Guardrail");
	lines.push("");
	lines.push(`- Benchmark report: \`${reportPath}\``);
	lines.push(`- Threshold config: \`${thresholdPath}\``);
	lines.push(`- Threshold profile: \`${thresholdProfile}\``);
	lines.push(`- Evaluated lanes: ${evaluations.length}`);
	const passedCount = evaluations.filter((item) => item.status === "pass").length;
	lines.push(`- Passed: ${passedCount}`);
	lines.push(`- Failed: ${evaluations.length - passedCount}`);
	lines.push("");
	lines.push("| Profile | Scenario | p95 FPS | avg FPS | Samples | Threshold (p95/avg/samples) | Status | Notes |");
	lines.push("|---|---:|---:|---:|---:|---:|---|---|");
	for (const evalItem of evaluations) {
		const thresholdText = `${evalItem.threshold.p95_fps_min ?? "-"}/${evalItem.threshold.avg_fps_min ?? "-"}/${evalItem.threshold.min_sample_count ?? "-"}`;
		const notes = evalItem.reasons.length ? evalItem.reasons.join("; ") : "ok";
		lines.push(
			`| ${evalItem.profile} | ${evalItem.scenario} | ${evalItem.metrics.p95_fps} | ${evalItem.metrics.avg_fps} | ${evalItem.metrics.samples} | ${thresholdText} | ${evalItem.status.toUpperCase()} | ${notes} |`,
		);
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
};

const ensureParentDir = async (filePath) => {
	const abs = path.resolve(process.cwd(), filePath);
	await mkdir(path.dirname(abs), { recursive: true });
	return abs;
};

const main = async () => {
	const options = parseArgs();
	const reportPathAbs = path.resolve(process.cwd(), options.input);
	const thresholdPathAbs = path.resolve(process.cwd(), options.thresholds);

	const report = JSON.parse(await readFile(reportPathAbs, "utf8"));
	const thresholds = JSON.parse(await readFile(thresholdPathAbs, "utf8"));
	const results = Array.isArray(report?.results) ? report.results : [];
	const thresholdCatalog = resolveThresholdCatalog({ thresholds, report });

	const evaluations = results.map((result) => {
		const threshold = resolveThresholdFor({
			profile: String(result?.profile || "unknown"),
			scenario: String(result?.scenario || "unknown"),
			thresholds: thresholdCatalog.config,
		});
		const outcome = evaluateResult({ result, threshold });
		return {
			profile: String(result?.profile || "unknown"),
			scenario: String(result?.scenario || "unknown"),
			status: outcome.passed ? "pass" : "fail",
			reasons: outcome.reasons,
			threshold,
			metrics: {
				p95_fps: toNumber(result?.metrics?.fps?.p95, 0),
				avg_fps: toNumber(result?.metrics?.fps?.avg, 0),
				samples: toNumber(result?.metrics?.samples, 0),
			},
		};
	});

	const failed = evaluations.filter((item) => item.status === "fail");
	const summaryMd = buildMarkdownSummary({
		reportPath: options.input,
		thresholdPath: options.thresholds,
		thresholdProfile: thresholdCatalog.profile,
		evaluations,
	});

	const summaryPathAbs = await ensureParentDir(options.summary);
	await writeFile(summaryPathAbs, summaryMd, "utf8");

	const jsonSummaryPathAbs = await ensureParentDir(options.jsonSummary);
	await writeFile(
		jsonSummaryPathAbs,
		`${JSON.stringify(
			{
				generated_at: new Date().toISOString(),
				threshold_profile: thresholdCatalog.profile,
				evaluations,
				failed_count: failed.length,
				pass_count: evaluations.length - failed.length,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	console.log(`Map FPS guardrail summary: ${summaryPathAbs}`);
	console.log(`Map FPS guardrail JSON: ${jsonSummaryPathAbs}`);

	if (failed.length > 0) {
		console.error("Map FPS guardrail failed:");
		for (const item of failed) {
			console.error(
				`- ${item.profile}/${item.scenario}: ${item.reasons.join("; ") || "threshold_violation"}`,
			);
		}
		process.exit(1);
	}
};

main().catch((error) => {
	console.error("Failed to evaluate map FPS guardrail:", error);
	process.exit(1);
});
