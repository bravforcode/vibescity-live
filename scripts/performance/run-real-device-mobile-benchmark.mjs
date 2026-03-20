#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const DEFAULT_URL = process.env.MAP_FPS_BENCHMARK_URL || "http://127.0.0.1:5808";
const DEFAULT_OUTPUT =
	process.env.MAP_REAL_DEVICE_BENCHMARK_OUTPUT ||
	"reports/performance/map-fps-real-device.json";
const DEFAULT_IOS_INGEST_OUTPUT =
	process.env.IOS_INSTRUMENTS_INGEST_OUTPUT ||
	"reports/performance/map-fps-ios-instruments-ingested.json";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runCommand = (cmd, args, { timeoutMs = 120000 } = {}) => {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});
		let stdout = "";
		let stderr = "";
		let timeout = null;

		if (timeoutMs > 0) {
			timeout = setTimeout(() => {
				child.kill("SIGTERM");
				reject(new Error(`Command timeout after ${timeoutMs}ms: ${cmd} ${args.join(" ")}`));
			}, timeoutMs);
		}

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (timeout) clearTimeout(timeout);
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(new Error(`${cmd} ${args.join(" ")} failed (exit ${code}): ${stderr || stdout}`));
		});
	});
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		platform: String(process.env.REAL_DEVICE_PLATFORM || "both").toLowerCase(),
		url: DEFAULT_URL,
		output: DEFAULT_OUTPUT,
		androidPackage: process.env.ANDROID_BROWSER_PACKAGE || "com.android.chrome",
		androidSerial: process.env.ANDROID_SERIAL || "",
		durationMs: Number(process.env.REAL_DEVICE_BENCHMARK_DURATION_MS || 15000),
		scenario: String(process.env.REAL_DEVICE_SCENARIO || "baseline").toLowerCase(),
		iosInstrumentsExport: process.env.IOS_INSTRUMENTS_EXPORT_PATH || "",
		iosIngestOutput: DEFAULT_IOS_INGEST_OUTPUT,
		iosDeviceName: process.env.IOS_DEVICE_NAME || "",
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--platform":
				options.platform = String(next || options.platform).toLowerCase();
				i += 1;
				break;
			case "--url":
				options.url = String(next || options.url);
				i += 1;
				break;
			case "--output":
				options.output = String(next || options.output);
				i += 1;
				break;
			case "--android-package":
				options.androidPackage = String(next || options.androidPackage);
				i += 1;
				break;
			case "--android-serial":
				options.androidSerial = String(next || options.androidSerial);
				i += 1;
				break;
			case "--duration-ms":
				options.durationMs = Number(next || options.durationMs);
				i += 1;
				break;
			case "--scenario":
				options.scenario = String(next || options.scenario).toLowerCase();
				i += 1;
				break;
			case "--ios-instruments-export":
				options.iosInstrumentsExport = String(next || options.iosInstrumentsExport);
				i += 1;
				break;
			case "--ios-ingest-output":
				options.iosIngestOutput = String(next || options.iosIngestOutput);
				i += 1;
				break;
			case "--ios-device-name":
				options.iosDeviceName = String(next || options.iosDeviceName);
				i += 1;
				break;
			default:
				break;
		}
	}

	return options;
};

const parseAndroidFrames = (gfxInfoOutput) => {
	const readMetric = (pattern) => {
		const match = gfxInfoOutput.match(pattern);
		if (!match?.[1]) return null;
		const value = Number(match[1]);
		return Number.isFinite(value) ? value : null;
	};

	const totalFrames = readMetric(/Total frames rendered:\s*(\d+)/i);
	const jankyFrames = readMetric(/Janky frames:\s*(\d+)/i);
	const p50Ms = readMetric(/50th percentile:\s*([\d.]+)ms/i);
	const p90Ms = readMetric(/90th percentile:\s*([\d.]+)ms/i);
	const p95Ms = readMetric(/95th percentile:\s*([\d.]+)ms/i);
	const p99Ms = readMetric(/99th percentile:\s*([\d.]+)ms/i);

	const toFps = (frameMs) =>
		Number.isFinite(frameMs) && frameMs > 0 ? Number((1000 / frameMs).toFixed(2)) : null;

	return {
		total_frames: totalFrames,
		janky_frames: jankyFrames,
		janky_ratio:
			Number.isFinite(totalFrames) && totalFrames > 0 && Number.isFinite(jankyFrames)
				? Number((jankyFrames / totalFrames).toFixed(4))
				: null,
		frame_ms: {
			p50: p50Ms,
			p90: p90Ms,
			p95: p95Ms,
			p99: p99Ms,
		},
		fps: {
			p50: toFps(p50Ms),
			p90: toFps(p90Ms),
			p95: toFps(p95Ms),
			p99: toFps(p99Ms),
		},
	};
};

const resolveAndroidSerial = async (preferredSerial = "") => {
	const { stdout } = await runCommand("adb", ["devices"], { timeoutMs: 30000 });
	const lines = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => line.includes("\tdevice"));
	const serials = lines.map((line) => line.split("\t")[0]);
	if (preferredSerial && serials.includes(preferredSerial)) return preferredSerial;
	return serials[0] || "";
};

const runAndroidBenchmark = async ({ url, androidPackage, androidSerial, durationMs }) => {
	const serial = await resolveAndroidSerial(androidSerial);
	if (!serial) {
		return {
			ok: false,
			platform: "android",
			mode: "real-device",
			error: "No Android device connected (adb devices returned none).",
		};
	}

	const adb = (...args) => runCommand("adb", ["-s", serial, ...args]);
	await adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url, androidPackage);
	await wait(5000);

	await adb("shell", "dumpsys", "gfxinfo", androidPackage, "reset");

	const endAt = Date.now() + Math.max(5000, durationMs);
	while (Date.now() < endAt) {
		await adb("shell", "input", "swipe", "540", "1800", "540", "500", "220");
		await adb("shell", "input", "swipe", "540", "500", "540", "1800", "220");
		await wait(260);
	}

	const { stdout } = await adb("shell", "dumpsys", "gfxinfo", androidPackage);
	const metrics = parseAndroidFrames(stdout);
	if (!Number.isFinite(metrics?.fps?.p95)) {
		return {
			ok: false,
			platform: "android",
			mode: "real-device",
			device_serial: serial,
			error: "Failed to parse Android gfxinfo FPS percentiles.",
		};
	}

	return {
		ok: true,
		platform: "android",
		mode: "real-device",
		device_serial: serial,
		browser_package: androidPackage,
		metrics,
	};
};

const runIosProfileBenchmark = async ({ url, durationMs }) => {
	const tempPath = path.resolve(
		process.cwd(),
		"reports/performance/map-fps-ios-profile-temp.json",
	);
	await runCommand(
		"node",
		[
			"scripts/performance/run-mobile-fps-benchmark.mjs",
			"--url",
			url,
			"--profiles",
			"ios",
			"--scenarios",
			"baseline",
			"--duration-ms",
			String(durationMs),
			"--output",
			tempPath,
		],
		{ timeoutMs: 240000 },
	);
	const payload = JSON.parse(await readFile(tempPath, "utf8"));
	const baseline = (payload.results || []).find(
		(item) => item.profile === "ios" && item.scenario === "baseline",
	);
	if (!baseline?.ok) {
		return {
			ok: false,
			platform: "ios",
			mode: "profile-emulation",
			error: baseline?.error || "iOS profile benchmark failed",
		};
	}
	return {
		ok: true,
		platform: "ios",
		profile: "ios",
		scenario: "baseline",
		mode: "profile-emulation",
		device_profile: baseline.device,
		metrics: baseline.metrics,
		note:
			"Use IOS_REAL_DEVICE_WS_ENDPOINT or native Xcode Instruments trace ingestion for physical iOS hardware validation.",
	};
};

const runIosInstrumentsIngestion = async ({
	input,
	output,
	scenario,
	deviceName,
}) => {
	const args = [
		"scripts/performance/ingest-ios-instruments-export.mjs",
		"--input",
		input,
		"--output",
		output,
		"--profile",
		"ios",
		"--scenario",
		scenario || "baseline",
	];
	if (deviceName) {
		args.push("--device-name", deviceName);
	}

	await runCommand("node", args, { timeoutMs: 180000 });
	const payload = JSON.parse(await readFile(path.resolve(process.cwd(), output), "utf8"));
	const result = Array.isArray(payload?.results) ? payload.results[0] : null;
	if (!result) {
		return {
			ok: false,
			platform: "ios",
			profile: "ios",
			scenario: scenario || "baseline",
			mode: "real-device-instruments-ingest",
			error: "Ingested iOS Instruments report did not contain any result entries.",
		};
	}

	return {
		...result,
		platform: "ios",
		profile: String(result.profile || "ios"),
		scenario: String(result.scenario || scenario || "baseline"),
	};
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
	const includeAndroid = options.platform === "android" || options.platform === "both";
	const includeIos = options.platform === "ios" || options.platform === "both";

	if (includeAndroid) {
		console.log("▶ Running Android real-device benchmark...");
		results.push(await runAndroidBenchmark(options));
	}
	if (includeIos) {
		if (options.iosInstrumentsExport) {
			console.log("▶ Running iOS Instruments export ingestion...");
			results.push(
				await runIosInstrumentsIngestion({
					input: options.iosInstrumentsExport,
					output: options.iosIngestOutput,
					scenario: options.scenario,
					deviceName: options.iosDeviceName,
				}),
			);
		} else {
			console.log("▶ Running iOS profile benchmark (fallback)...");
			results.push(await runIosProfileBenchmark(options));
		}
	}

	const payload = {
		version: 1,
		generated_at: new Date().toISOString(),
		config: {
			url: options.url,
			platform: options.platform,
			duration_ms: options.durationMs,
			scenario: options.scenario,
			ios_instruments_export: options.iosInstrumentsExport || null,
		},
		results,
	};

	const outputPath = await writeJson(options.output, payload);
	console.log(`Real-device benchmark report saved: ${outputPath}`);

	if (results.some((item) => !item.ok)) {
		process.exitCode = 2;
	}
};

main().catch((error) => {
	console.error("Failed to run real-device mobile benchmark:", error);
	process.exit(1);
});
