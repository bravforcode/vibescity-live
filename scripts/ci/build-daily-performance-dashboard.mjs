import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PERF_DIR = path.join(ROOT, "reports", "performance");
const OUTPUT_PATH = path.join(
	ROOT,
	"reports",
	"ci",
	"daily-performance-dashboard.json",
);
const DEFAULT_PROFILE_PATH = path.join(
	PERF_DIR,
	"home-runtime-profile.latest.json",
);
const DEFAULT_HAR_PATH = path.join(PERF_DIR, "mobile-chrome-en.har");
const MAP_STYLE_PATH = path.join(
	ROOT,
	"public",
	"map-styles",
	"vibecity-neon.json",
);
const ALERT_THRESHOLDS = Object.freeze({
	networkSlowOver1sMax: 0,
	longTaskBlockedOver200Max: 0,
	longTaskMaxMs: 200,
	mapFirstRenderMaxMs: 1500,
	mapStyleLoadedMaxMs: 3000,
	hydrationBootstrapMaxMs: 1200,
});

const readJsonIfExists = async (filePath) => {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

const writeJson = async (filePath, payload) => {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const mapStyleStats = async () => {
	let raw = "";
	try {
		raw = await fs.readFile(MAP_STYLE_PATH, "utf8");
	} catch {
		return null;
	}
	let json = null;
	try {
		json = JSON.parse(raw);
	} catch {
		json = null;
	}
	const layers = Array.isArray(json?.layers) ? json.layers : [];
	const sources =
		json?.sources && typeof json.sources === "object" ? json.sources : {};
	const sprite = typeof json?.sprite === "string" ? json.sprite : null;
	const glyphs = typeof json?.glyphs === "string" ? json.glyphs : null;
	return {
		path: "public/map-styles/vibecity-neon.json",
		bytes: Buffer.byteLength(raw, "utf8"),
		layerCount: layers.length,
		sourceCount: Object.keys(sources).length,
		sprite,
		glyphs,
	};
};

const parseHarSummary = async (filePath) => {
	const har = await readJsonIfExists(filePath);
	const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
	if (entries.length === 0) {
		return {
			path: path.relative(ROOT, filePath).replaceAll("\\", "/"),
			total: 0,
			slowOver1sCount: 0,
			slowOver1s: [],
			blockingTop: [],
		};
	}

	const rows = entries.map((entry) => ({
		url: String(entry?.request?.url || ""),
		status: Number(entry?.response?.status || 0),
		timeMs: Number(entry?.time || 0),
		blockingMs: Number(entry?.timings?.blocked || 0),
		waitMs: Number(entry?.timings?.wait || 0),
		receiveMs: Number(entry?.timings?.receive || 0),
		mime: String(entry?.response?.content?.mimeType || ""),
	}));

	const slowOver1s = rows
		.filter((row) => row.timeMs >= 1000)
		.sort((a, b) => b.timeMs - a.timeMs)
		.slice(0, 30);
	const blockingTop = rows
		.filter((row) => row.blockingMs >= 100)
		.sort((a, b) => b.blockingMs - a.blockingMs)
		.slice(0, 30);

	return {
		path: path.relative(ROOT, filePath).replaceAll("\\", "/"),
		total: rows.length,
		slowOver1sCount: slowOver1s.length,
		slowOver1s,
		blockingTop,
	};
};

const buildAlerts = ({ profile, harSummary }) => {
	const alerts = [];
	const longTaskBlockedOver200 = Number(
		profile?.longTaskSummary?.blockedOver200ms || 0,
	);
	const longTaskMaxMs = Number(profile?.longTaskSummary?.maxDuration || 0);
	const firstRenderAt = Number(profile?.mapMetrics?.firstRenderAt || 0);
	const styleLoadedAt = Number(profile?.mapMetrics?.styleLoadedAt || 0);
	const bootstrapMs = Number(profile?.vibecityPerf?.bootstrapMs || 0);

	if (harSummary.slowOver1sCount > ALERT_THRESHOLDS.networkSlowOver1sMax) {
		alerts.push({
			metric: "network.slow_over_1s_count",
			value: harSummary.slowOver1sCount,
			threshold: ALERT_THRESHOLDS.networkSlowOver1sMax,
			severity: "high",
		});
	}
	if (longTaskBlockedOver200 > ALERT_THRESHOLDS.longTaskBlockedOver200Max) {
		alerts.push({
			metric: "main_thread.long_tasks_blocked_over_200ms",
			value: longTaskBlockedOver200,
			threshold: ALERT_THRESHOLDS.longTaskBlockedOver200Max,
			severity: "critical",
		});
	}
	if (longTaskMaxMs > ALERT_THRESHOLDS.longTaskMaxMs) {
		alerts.push({
			metric: "main_thread.long_task_max_ms",
			value: longTaskMaxMs,
			threshold: ALERT_THRESHOLDS.longTaskMaxMs,
			severity: "critical",
		});
	}
	if (firstRenderAt && firstRenderAt > ALERT_THRESHOLDS.mapFirstRenderMaxMs) {
		alerts.push({
			metric: "map.first_render_ms",
			value: firstRenderAt,
			threshold: ALERT_THRESHOLDS.mapFirstRenderMaxMs,
			severity: "high",
		});
	}
	if (styleLoadedAt && styleLoadedAt > ALERT_THRESHOLDS.mapStyleLoadedMaxMs) {
		alerts.push({
			metric: "map.style_loaded_ms",
			value: styleLoadedAt,
			threshold: ALERT_THRESHOLDS.mapStyleLoadedMaxMs,
			severity: "high",
		});
	}
	if (bootstrapMs && bootstrapMs > ALERT_THRESHOLDS.hydrationBootstrapMaxMs) {
		alerts.push({
			metric: "hydration.bootstrap_ms",
			value: bootstrapMs,
			threshold: ALERT_THRESHOLDS.hydrationBootstrapMaxMs,
			severity: "high",
		});
	}
	return alerts;
};

const main = async () => {
	const latestProfilePath = path.resolve(
		ROOT,
		process.env.DAILY_PERF_PROFILE_PATH || DEFAULT_PROFILE_PATH,
	);
	const harPath = path.resolve(
		ROOT,
		process.env.DAILY_PERF_HAR_PATH || DEFAULT_HAR_PATH,
	);
	const profile = await readJsonIfExists(latestProfilePath);
	const harSummary = await parseHarSummary(harPath);
	const styleStats = await mapStyleStats();
	const alerts = buildAlerts({ profile, harSummary });

	const payload = {
		generated_at: new Date().toISOString(),
		thresholds: ALERT_THRESHOLDS,
		source: {
			profile_path: path
				.relative(ROOT, latestProfilePath)
				.replaceAll("\\", "/"),
			har_path: harSummary.path,
			map_style_path: styleStats?.path || null,
		},
		target: {
			url: profile?.url || null,
			device: profile?.device || null,
		},
		network_waterfall: {
			total_resources: profile?.resourceSummary?.totalResources ?? null,
			slow_over_1s_count: profile?.resourceSummary?.slowOver1sCount ?? null,
			render_blocking_candidates_count:
				profile?.resourceSummary?.renderBlockingCandidatesCount ?? null,
			slow_over_1s: profile?.resourceSummary?.slowOver1s ?? [],
			render_blocking_candidates:
				profile?.resourceSummary?.renderBlocking ?? [],
			har_total_requests: harSummary.total,
			har_slow_over_1s_count: harSummary.slowOver1sCount,
			har_slow_over_1s: harSummary.slowOver1s,
			har_blocking_top: harSummary.blockingTop,
		},
		main_thread: {
			long_tasks_count: profile?.longTaskSummary?.count ?? null,
			long_tasks_blocked_over_200ms:
				profile?.longTaskSummary?.blockedOver200ms ?? null,
			long_tasks_max_ms: profile?.longTaskSummary?.maxDuration ?? null,
			top_long_tasks: profile?.longTaskSummary?.topEntries ?? [],
			event_slow_count: profile?.slowEventSummary?.count ?? null,
			event_slow_max_ms: profile?.slowEventSummary?.maxDuration ?? null,
			top_slow_events: profile?.slowEventSummary?.topEntries ?? [],
		},
		map_style_resources: {
			style: styleStats,
			runtime: profile?.mapMetrics || null,
		},
		hydration_cost: {
			bootstrap_ms: profile?.vibecityPerf?.bootstrapMs ?? null,
			dom_content_loaded_ms: profile?.navigation?.domContentLoadedMs ?? null,
			load_ms: profile?.navigation?.loadMs ?? null,
		},
		alerts: {
			total: alerts.length,
			has_breach: alerts.length > 0,
			items: alerts,
		},
	};

	await writeJson(OUTPUT_PATH, payload);
	console.log(JSON.stringify({ output: OUTPUT_PATH, payload }, null, 2));
	if (alerts.length > 0) {
		process.exitCode = 2;
	}
};

await main();
