#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices, webkit } from "playwright";

const DEFAULT_URL = process.env.MAP_FPS_BENCHMARK_URL || "http://127.0.0.1:5808";
const DEFAULT_OUTPUT =
	process.env.MAP_FPS_BENCHMARK_OUTPUT ||
	"reports/performance/map-fps-benchmark.json";
const DEFAULT_PROFILES = ["android"];
const DEFAULT_SCENARIOS = [
	"baseline",
	"thermal-high",
	"network-3g",
];

const PROFILE_PRESETS = {
	android: {
		browser: "chromium",
		deviceName: "Pixel 7",
		label: "android",
	},
	ios: {
		browser: "webkit",
		deviceName: "iPhone 14",
		label: "ios",
	},
};

const NETWORK_PRESETS = {
	"network-4g": {
		downloadThroughput: (10 * 1024 * 1024) / 8,
		uploadThroughput: (5 * 1024 * 1024) / 8,
		latency: 40,
		fallbackDelayMs: 35,
	},
	"network-3g": {
		downloadThroughput: (1.6 * 1024 * 1024) / 8,
		uploadThroughput: (750 * 1024) / 8,
		latency: 150,
		fallbackDelayMs: 120,
	},
	"network-2g": {
		downloadThroughput: (280 * 1024) / 8,
		uploadThroughput: (150 * 1024) / 8,
		latency: 420,
		fallbackDelayMs: 360,
	},
	"provincial-3bb": {
		downloadThroughput: (30 * 1024 * 1024) / 8,
		uploadThroughput: (12 * 1024 * 1024) / 8,
		latency: 80,
		fallbackDelayMs: 70,
	},
	"cat-rural": {
		downloadThroughput: (5 * 1024 * 1024) / 8,
		uploadThroughput: (2 * 1024 * 1024) / 8,
		latency: 150,
		fallbackDelayMs: 140,
	},
	"nt-gov": {
		downloadThroughput: (10 * 1024 * 1024) / 8,
		uploadThroughput: (4 * 1024 * 1024) / 8,
		latency: 120,
		fallbackDelayMs: 110,
	},
};

const SCENARIO_PRESETS = {
	baseline: {},
	"thermal-moderate": { cpuThrottlingRate: 2 },
	"thermal-high": { cpuThrottlingRate: 4 },
	"battery-low": {
		battery: { level: 0.15, charging: false, chargingTime: Infinity },
	},
	"network-4g": { networkPreset: "network-4g" },
	"network-3g": { networkPreset: "network-3g" },
	"network-2g": { networkPreset: "network-2g" },
	"provincial-3bb": { networkPreset: "provincial-3bb" },
	"cat-rural": { networkPreset: "cat-rural" },
	"nt-gov": { networkPreset: "nt-gov" },
};

const toNumber = (value, fallback) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : fallback;
};

const percentile = (values, p) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
	return sorted[idx];
};

const average = (values) => {
	if (!values.length) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toCsvList = (value, fallback) => {
	const raw = String(value ?? "").trim();
	if (!raw) return fallback;
	return raw
		.split(",")
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		url: DEFAULT_URL,
		output: DEFAULT_OUTPUT,
		durationMs: toNumber(process.env.MAP_FPS_DURATION_MS, 15000),
		warmupMs: toNumber(process.env.MAP_FPS_WARMUP_MS, 3500),
		profiles: toCsvList(process.env.MAP_FPS_PROFILES, DEFAULT_PROFILES),
		scenarios: toCsvList(process.env.MAP_FPS_SCENARIOS, DEFAULT_SCENARIOS),
		headless: String(process.env.MAP_FPS_HEADLESS ?? "true") !== "false",
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--url":
				options.url = String(next || options.url).trim();
				i += 1;
				break;
			case "--output":
				options.output = String(next || options.output).trim();
				i += 1;
				break;
			case "--duration-ms":
				options.durationMs = toNumber(next, options.durationMs);
				i += 1;
				break;
			case "--warmup-ms":
				options.warmupMs = toNumber(next, options.warmupMs);
				i += 1;
				break;
			case "--profiles":
				options.profiles = toCsvList(next, options.profiles);
				i += 1;
				break;
			case "--scenarios":
				options.scenarios = toCsvList(next, options.scenarios);
				i += 1;
				break;
			case "--headed":
				options.headless = false;
				break;
			case "--headless":
				options.headless = true;
				break;
			default:
				break;
		}
	}

	options.profiles = options.profiles.filter((profile) => PROFILE_PRESETS[profile]);
	options.scenarios = options.scenarios.filter((scenario) => SCENARIO_PRESETS[scenario]);
	if (!options.profiles.length) options.profiles = [...DEFAULT_PROFILES];
	if (!options.scenarios.length) options.scenarios = [...DEFAULT_SCENARIOS];

	return options;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const applyBatteryOverride = async (context, batteryPreset) => {
	if (!batteryPreset) return;
	await context.addInitScript((payload) => {
		const batteryState = {
			charging: Boolean(payload?.charging),
			level: Math.max(0, Math.min(1, Number(payload?.level ?? 1))),
			chargingTime: Number(payload?.chargingTime ?? Infinity),
			dischargingTime: Number(payload?.dischargingTime ?? 3600),
			addEventListener: () => {},
			removeEventListener: () => {},
		};

		Object.defineProperty(navigator, "getBattery", {
			configurable: true,
			value: async () => batteryState,
		});
	}, batteryPreset);
};

const applyNetworkConstraints = async ({ context, cdpSession, networkPreset }) => {
	if (!networkPreset) return;
	const profile = NETWORK_PRESETS[networkPreset];
	if (!profile) return;

	if (cdpSession) {
		await cdpSession.send("Network.enable");
		await cdpSession.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: profile.latency,
			downloadThroughput: Math.max(1, Math.floor(profile.downloadThroughput)),
			uploadThroughput: Math.max(1, Math.floor(profile.uploadThroughput)),
		});
		return;
	}

	await context.route("**/*", async (route) => {
		await wait(profile.fallbackDelayMs);
		await route.continue();
	});
};

const applyThermalConstraints = async ({ cdpSession, cpuThrottlingRate }) => {
	if (!cdpSession || !Number.isFinite(Number(cpuThrottlingRate))) return;
	await cdpSession.send("Emulation.setCPUThrottlingRate", {
		rate: Math.max(1, Number(cpuThrottlingRate)),
	});
};

const waitForMapReady = async (page) => {
	await page.waitForSelector('[data-testid="map-shell"]', { timeout: 60000 });
	try {
		await page.waitForFunction(() => {
			const shell = document.querySelector('[data-testid="map-shell"]');
			return shell?.getAttribute("data-map-ready") === "true";
		}, undefined, { timeout: 45000 });
	} catch {
		// Fail-open: map can still be interactive enough for FPS sampling.
	}
};

const collectFrameSamples = async (page, durationMs) => {
	return page.evaluate(async (duration) => {
		return await new Promise((resolve) => {
			const frameTimes = [];
			let startedAt = 0;
			let last = 0;

			const tick = (now) => {
				if (!startedAt) {
					startedAt = now;
					last = now;
					requestAnimationFrame(tick);
					return;
				}
				const dt = now - last;
				last = now;
				if (dt > 0 && dt < 1000) {
					frameTimes.push(dt);
				}
				if (now - startedAt >= duration) {
					resolve({ frameTimes, durationMs: now - startedAt });
					return;
				}
				requestAnimationFrame(tick);
			};

			requestAnimationFrame(tick);
		});
	}, durationMs);
};

const runInteractionLoop = async (page, durationMs) => {
	const endAt = Date.now() + durationMs;
	let box = null;
	for (const selector of ["[data-testid='map-canvas']", ".maplibregl-canvas"]) {
		const element = page.locator(selector).first();
		if ((await element.count()) > 0) {
			box = await element.boundingBox();
			if (box) break;
		}
	}
	if (!box) {
		await wait(durationMs);
		return;
	}

	while (Date.now() < endAt) {
		if (typeof page.isClosed === "function" && page.isClosed()) break;
		const centerX = box.x + box.width * 0.5;
		const centerY = box.y + box.height * 0.5;
		const sweep = Math.min(Math.max(60, box.width * 0.28), 180);
		try {
			await page.mouse.move(centerX - sweep, centerY);
			await page.mouse.down();
			await page.mouse.move(centerX + sweep, centerY - 20, { steps: 16 });
			await page.mouse.up();
			await page.mouse.wheel(0, -240);
			await page.mouse.wheel(0, 240);
		} catch {
			break;
		}
		await wait(220);
	}
};

const summarizeFrames = ({ frameTimes, durationMs }) => {
	const safeTimes = Array.isArray(frameTimes)
		? frameTimes.filter((value) => Number.isFinite(value) && value > 0)
		: [];
	const fpsSamples = safeTimes.map((dt) => 1000 / dt);
	const p95FrameMs = percentile(safeTimes, 0.95);
	const p99FrameMs = percentile(safeTimes, 0.99);
	const avgFrameMs = average(safeTimes);
	const avgFps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;
	const p95Fps = p95FrameMs > 0 ? 1000 / p95FrameMs : 0;
	const p99Fps = p99FrameMs > 0 ? 1000 / p99FrameMs : 0;
	const lowFrames = safeTimes.filter((dt) => dt > 16.7).length;

	return {
		samples: safeTimes.length,
		duration_ms: Math.round(durationMs || 0),
		frame_ms: {
			avg: Number(avgFrameMs.toFixed(2)),
			p95: Number(p95FrameMs.toFixed(2)),
			p99: Number(p99FrameMs.toFixed(2)),
		},
		fps: {
			avg: Number(avgFps.toFixed(2)),
			p95: Number(p95Fps.toFixed(2)),
			p99: Number(p99Fps.toFixed(2)),
			p50: Number(percentile(fpsSamples, 0.5).toFixed(2)),
			min: Number((Math.min(...fpsSamples) || 0).toFixed(2)),
			max: Number((Math.max(...fpsSamples) || 0).toFixed(2)),
		},
		slow_frame_ratio: safeTimes.length
			? Number((lowFrames / safeTimes.length).toFixed(4))
			: 1,
	};
};

const runSingleScenario = async ({
	url,
	profile,
	scenario,
	durationMs,
	warmupMs,
	headless,
}) => {
	const profilePreset = PROFILE_PRESETS[profile];
	const scenarioPreset = SCENARIO_PRESETS[scenario] || {};
	const browserType = profilePreset.browser === "webkit" ? webkit : chromium;
	const launchOptions = { headless };
	if (profilePreset.browser === "chromium") {
		launchOptions.args = [
			"--disable-background-timer-throttling",
			"--disable-backgrounding-occluded-windows",
			"--disable-renderer-backgrounding",
			"--disable-features=CalculateNativeWinOcclusion",
		];
	}
	const browser = await browserType.launch(launchOptions);

	let context = null;
	let page = null;
	let cdpSession = null;
	let frameCapturePromise = null;
	const startedAt = Date.now();
	try {
		const devicePreset = devices[profilePreset.deviceName] || {};
		context = await browser.newContext({
			...devicePreset,
			serviceWorkers: "block",
			ignoreHTTPSErrors: true,
		});

		await applyBatteryOverride(context, scenarioPreset.battery);
		page = await context.newPage();

		if (profilePreset.browser === "chromium") {
			cdpSession = await context.newCDPSession(page);
		}

		await applyNetworkConstraints({
			context,
			cdpSession,
			networkPreset: scenarioPreset.networkPreset,
		});
		await applyThermalConstraints({
			cdpSession,
			cpuThrottlingRate: scenarioPreset.cpuThrottlingRate,
		});

		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
		await waitForMapReady(page);
		if (warmupMs > 0) {
			await wait(warmupMs);
		}
		const primingMs = Math.max(750, Math.min(2500, Math.round(durationMs * 0.15)));
		await runInteractionLoop(page, primingMs);
		await wait(120);

		frameCapturePromise = collectFrameSamples(page, durationMs).catch((error) => ({
			error: String(error?.message || error),
		}));
		await runInteractionLoop(page, durationMs);
		const frameCapture = await frameCapturePromise;
		if (frameCapture?.error) {
			throw new Error(`frame_capture_failed: ${frameCapture.error}`);
		}
		const summary = summarizeFrames(frameCapture);

		return {
			ok: true,
			profile,
			scenario,
			device: profilePreset.deviceName,
			browser: profilePreset.browser,
			started_at: new Date(startedAt).toISOString(),
			finished_at: new Date().toISOString(),
			settings: {
				duration_ms: durationMs,
				warmup_ms: warmupMs,
				cpu_throttling_rate: scenarioPreset.cpuThrottlingRate || 1,
				network: scenarioPreset.networkPreset || "none",
				battery_mode: scenarioPreset.battery ? "low" : "normal",
			},
			metrics: summary,
		};
	} catch (error) {
		return {
			ok: false,
			profile,
			scenario,
			device: profilePreset.deviceName,
			browser: profilePreset.browser,
			started_at: new Date(startedAt).toISOString(),
			finished_at: new Date().toISOString(),
			error: String(error?.message || error),
		};
	} finally {
		if (frameCapturePromise) {
			await frameCapturePromise.catch(() => {});
		}
		if (cdpSession) {
			try {
				await cdpSession.detach();
			} catch {
				// Ignore detach race.
			}
		}
		if (context) {
			await context.close().catch(() => {});
		}
		await browser.close().catch(() => {});
	}
};

const writeJson = async (filePath, payload) => {
	const abs = path.resolve(process.cwd(), filePath);
	await mkdir(path.dirname(abs), { recursive: true });
	await writeFile(abs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return abs;
};

const main = async () => {
	const options = parseArgs();
	const results = [];

	for (const profile of options.profiles) {
		for (const scenario of options.scenarios) {
			// eslint-disable-next-line no-console
			console.log(`▶ Running FPS benchmark: profile=${profile} scenario=${scenario}`);
			const result = await runSingleScenario({
				url: options.url,
				profile,
				scenario,
				durationMs: options.durationMs,
				warmupMs: options.warmupMs,
				headless: options.headless,
			});
			results.push(result);
			if (result.ok) {
				// eslint-disable-next-line no-console
				console.log(
					`✓ ${profile}/${scenario} p95=${result.metrics.fps.p95} avg=${result.metrics.fps.avg} samples=${result.metrics.samples}`,
				);
			} else {
				// eslint-disable-next-line no-console
				console.error(`✗ ${profile}/${scenario} error=${result.error}`);
			}
		}
	}

	const payload = {
		version: 1,
		generated_at: new Date().toISOString(),
		config: {
			url: options.url,
			duration_ms: options.durationMs,
			warmup_ms: options.warmupMs,
			profiles: options.profiles,
			scenarios: options.scenarios,
			headless: options.headless,
		},
		results,
	};

	const outputPath = await writeJson(options.output, payload);
	const failures = results.filter((item) => !item.ok).length;
	// eslint-disable-next-line no-console
	console.log(`Benchmark report saved: ${outputPath}`);
	if (failures > 0) {
		process.exitCode = 2;
	}
};

main().catch((error) => {
	console.error("Failed to run mobile FPS benchmark:", error);
	process.exit(1);
});
