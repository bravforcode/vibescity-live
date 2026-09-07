import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LH_DIR = path.join(ROOT, ".lighthouseci");
const DEFAULT_THRESHOLDS = {
	lcpMs: 2500,
	tbtMs: 200,
	perfScore: 0.95,
};

const readJson = async (filePath) => {
	const raw = await fs.readFile(filePath, "utf8");
	return JSON.parse(raw);
};

const percentile = (values, p) => {
	const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
	if (sorted.length === 0) return null;
	if (sorted.length === 1) return sorted[0];
	const idx = (sorted.length - 1) * p;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo];
	const weight = idx - lo;
	return sorted[lo] * (1 - weight) + sorted[hi] * weight;
};

const fmtMs = (value) =>
	Number.isFinite(value) ? `${Math.round(value)}ms` : "n/a";
const fmtScore = (value) =>
	Number.isFinite(value) ? `${Math.round(value * 100) / 100}` : "n/a";

const main = async () => {
	const thresholds = {
		lcpMs: Number(process.env.PERF_GATE_LCP_MS || DEFAULT_THRESHOLDS.lcpMs),
		tbtMs: Number(process.env.PERF_GATE_TBT_MS || DEFAULT_THRESHOLDS.tbtMs),
		perfScore: Number(
			process.env.PERF_GATE_PERF_SCORE || DEFAULT_THRESHOLDS.perfScore,
		),
	};

	let files = [];
	try {
		files = await fs.readdir(LH_DIR);
	} catch {
		files = [];
	}

	const lhrFiles = files
		.filter((name) => name.endsWith(".json"))
		.map((name) => path.join(LH_DIR, name));

	const results = [];
	for (const filePath of lhrFiles) {
		let lhr = null;
		try {
			lhr = await readJson(filePath);
		} catch {
			continue;
		}
		const audits = lhr?.audits || {};
		const categories = lhr?.categories || {};
		const lcp = Number(audits["largest-contentful-paint"]?.numericValue);
		const tbt = Number(audits["total-blocking-time"]?.numericValue);
		const perf = Number(categories?.performance?.score);
		if (
			!Number.isFinite(lcp) &&
			!Number.isFinite(tbt) &&
			!Number.isFinite(perf)
		) {
			continue;
		}
		results.push({
			file: path.basename(filePath),
			url: String(lhr?.finalUrl || ""),
			lcp,
			tbt,
			perf,
		});
	}

	const lcpValues = results.map((r) => r.lcp).filter(Number.isFinite);
	const tbtValues = results.map((r) => r.tbt).filter(Number.isFinite);
	const perfValues = results.map((r) => r.perf).filter(Number.isFinite);

	const lcpP75 = percentile(lcpValues, 0.75);
	const tbtP75 = percentile(tbtValues, 0.75);
	const perfMin = perfValues.length ? Math.min(...perfValues) : null;

	const breaches = [];
	if (results.length === 0) {
		breaches.push("No Lighthouse LHR JSON results found under .lighthouseci");
	}
	if (Number.isFinite(lcpP75) && lcpP75 > thresholds.lcpMs) {
		breaches.push(`LCP p75 ${fmtMs(lcpP75)} > ${fmtMs(thresholds.lcpMs)}`);
	}
	if (Number.isFinite(tbtP75) && tbtP75 > thresholds.tbtMs) {
		breaches.push(`TBT p75 ${fmtMs(tbtP75)} > ${fmtMs(thresholds.tbtMs)}`);
	}
	if (Number.isFinite(perfMin) && perfMin < thresholds.perfScore) {
		breaches.push(
			`Performance min ${fmtScore(perfMin)} < ${fmtScore(thresholds.perfScore)}`,
		);
	}

	const summaryLines = [
		"Performance Gate (p75 evaluator)",
		`Runs: ${results.length}`,
		`LCP p75: ${fmtMs(lcpP75)} (threshold ${fmtMs(thresholds.lcpMs)})`,
		`TBT p75: ${fmtMs(tbtP75)} (threshold ${fmtMs(thresholds.tbtMs)})`,
		`Performance min: ${fmtScore(perfMin)} (threshold ${fmtScore(thresholds.perfScore)})`,
		`Outcome: ${breaches.length ? "FAIL" : "PASS"}`,
	];

	console.log(summaryLines.join("\n"));

	const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (stepSummaryPath) {
		const md = [
			"### Perf Gate p75 Evaluation",
			`- Runs: ${results.length}`,
			`- LCP p75: ${fmtMs(lcpP75)} (≤ ${fmtMs(thresholds.lcpMs)})`,
			`- TBT p75: ${fmtMs(tbtP75)} (≤ ${fmtMs(thresholds.tbtMs)})`,
			`- Performance min: ${fmtScore(perfMin)} (≥ ${fmtScore(thresholds.perfScore)})`,
			breaches.length ? "" : "- Status: PASS",
			breaches.length ? "- Status: FAIL" : "",
			...breaches.map((b) => `  - ${b}`),
			"",
		]
			.filter(Boolean)
			.join("\n");
		await fs.appendFile(stepSummaryPath, `${md}\n`, "utf8").catch(() => {});
	}

	if (breaches.length) {
		process.exitCode = 1;
	}
};

await main();
