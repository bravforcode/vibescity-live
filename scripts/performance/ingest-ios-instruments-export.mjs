#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUTPUT =
	process.env.IOS_INSTRUMENTS_INGEST_OUTPUT ||
	"reports/performance/map-fps-ios-instruments-ingested.json";

const FPS_KEYWORDS = [
	"fps",
	"frame_rate",
	"framerate",
	"frames_per_second",
	"frames per second",
	"renderedfps",
	"displayfps",
	"compositorfps",
];

const FRAME_MS_KEYWORDS = [
	"frame_ms",
	"frame time",
	"frametime",
	"frame_time",
	"frame duration",
	"frameduration",
	"ms per frame",
	"ms_per_frame",
	"vsync",
	"displaylink",
];

const toNumber = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
};

const normalizeKey = (value) =>
	String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const keyMatches = (key, keywords) => {
	const normalized = normalizeKey(key);
	if (!normalized) return false;
	return keywords.some((keyword) => normalized.includes(normalizeKey(keyword)));
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

const splitCsvLine = (line, delimiter) => {
	const out = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (!inQuotes && ch === delimiter) {
			out.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	out.push(current);
	return out.map((item) => item.trim());
};

const sanitizeFpsSamples = (values) =>
	values
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0 && value < 500);

const sanitizeFrameMsSamples = (values) =>
	values
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0 && value < 1000);

const deriveFramesAndFps = ({ fpsSamples, frameMsSamples }) => {
	const fps = sanitizeFpsSamples(fpsSamples);
	const frameMs = sanitizeFrameMsSamples(frameMsSamples);

	if (!fps.length && frameMs.length) {
		for (const value of frameMs) {
			fps.push(1000 / value);
		}
	}
	if (!frameMs.length && fps.length) {
		for (const value of fps) {
			frameMs.push(1000 / value);
		}
	}

	return {
		fpsSamples: sanitizeFpsSamples(fps),
		frameMsSamples: sanitizeFrameMsSamples(frameMs),
	};
};

const extractFromJson = (input) => {
	const fpsSamples = [];
	const frameMsSamples = [];
	const signals = new Set();

	const visit = (value, pathParts = []) => {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i += 1) {
				visit(value[i], [...pathParts, `[${i}]`]);
			}
			return;
		}
		if (!value || typeof value !== "object") {
			return;
		}

		for (const [key, raw] of Object.entries(value)) {
			const pathLabel = [...pathParts, key].join(".");
			if (typeof raw === "number") {
				if (keyMatches(pathLabel, FPS_KEYWORDS)) {
					fpsSamples.push(raw);
					signals.add(`fps:${pathLabel}`);
				} else if (keyMatches(pathLabel, FRAME_MS_KEYWORDS)) {
					frameMsSamples.push(raw);
					signals.add(`frame_ms:${pathLabel}`);
				}
				continue;
			}
			if (typeof raw === "string") {
				const num = toNumber(raw.replace(/[^0-9.+-]/g, ""));
				if (!Number.isFinite(num)) continue;
				if (keyMatches(pathLabel, FPS_KEYWORDS)) {
					fpsSamples.push(num);
					signals.add(`fps:${pathLabel}`);
				} else if (keyMatches(pathLabel, FRAME_MS_KEYWORDS)) {
					frameMsSamples.push(num);
					signals.add(`frame_ms:${pathLabel}`);
				}
				continue;
			}
			visit(raw, [...pathParts, key]);
		}
	};

	visit(input, []);
	return { fpsSamples, frameMsSamples, detectedSignals: [...signals] };
};

const detectDelimiter = (headerLine) => {
	const candidates = [",", "\t", ";"];
	let best = ",";
	let maxColumns = 1;
	for (const delimiter of candidates) {
		const cols = splitCsvLine(headerLine, delimiter).length;
		if (cols > maxColumns) {
			maxColumns = cols;
			best = delimiter;
		}
	}
	return best;
};

const extractFromCsv = (text) => {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length < 2) {
		return { fpsSamples: [], frameMsSamples: [], detectedSignals: [] };
	}

	const delimiter = detectDelimiter(lines[0]);
	const headers = splitCsvLine(lines[0], delimiter);
	const fpsIndexes = [];
	const frameIndexes = [];
	for (let i = 0; i < headers.length; i += 1) {
		const header = headers[i];
		if (keyMatches(header, FPS_KEYWORDS)) fpsIndexes.push(i);
		if (keyMatches(header, FRAME_MS_KEYWORDS)) frameIndexes.push(i);
	}

	const fpsSamples = [];
	const frameMsSamples = [];
	for (let i = 1; i < lines.length; i += 1) {
		const row = splitCsvLine(lines[i], delimiter);
		for (const idx of fpsIndexes) {
			const num = toNumber(row[idx]);
			if (Number.isFinite(num)) fpsSamples.push(num);
		}
		for (const idx of frameIndexes) {
			const num = toNumber(row[idx]);
			if (Number.isFinite(num)) frameMsSamples.push(num);
		}
	}

	const detectedSignals = [
		...fpsIndexes.map((idx) => `fps:${headers[idx]}`),
		...frameIndexes.map((idx) => `frame_ms:${headers[idx]}`),
	];
	return { fpsSamples, frameMsSamples, detectedSignals };
};

const extractFromXmlOrText = (text) => {
	const fpsSamples = [];
	const frameMsSamples = [];
	const detectedSignals = [];

	const keyValueRegex = /<key>([^<]+)<\/key>\s*<(?:real|integer|string)>([^<]+)<\/(?:real|integer|string)>/gi;
	for (const match of text.matchAll(keyValueRegex)) {
		const key = String(match[1] || "").trim();
		const valueRaw = String(match[2] || "").trim();
		const num = toNumber(valueRaw.replace(/[^0-9.+-]/g, ""));
		if (!Number.isFinite(num)) continue;
		if (keyMatches(key, FPS_KEYWORDS)) {
			fpsSamples.push(num);
			detectedSignals.push(`fps:${key}`);
		} else if (keyMatches(key, FRAME_MS_KEYWORDS)) {
			frameMsSamples.push(num);
			detectedSignals.push(`frame_ms:${key}`);
		}
	}

	const lineRegex = /(fps|frame\s*rate|frames\s*per\s*second|frame\s*time|frame\s*duration|ms\s*per\s*frame)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/gi;
	for (const match of text.matchAll(lineRegex)) {
		const key = String(match[1] || "");
		const num = toNumber(match[2]);
		if (!Number.isFinite(num)) continue;
		if (keyMatches(key, FPS_KEYWORDS)) {
			fpsSamples.push(num);
			detectedSignals.push(`fps:${key}`);
		} else if (keyMatches(key, FRAME_MS_KEYWORDS)) {
			frameMsSamples.push(num);
			detectedSignals.push(`frame_ms:${key}`);
		}
	}

	return { fpsSamples, frameMsSamples, detectedSignals };
};

const summarize = ({ fpsSamples, frameMsSamples }) => {
	const samples = Math.min(fpsSamples.length, frameMsSamples.length);
	const fps = fpsSamples.slice(0, samples);
	const frame = frameMsSamples.slice(0, samples);
	const slowFrames = frame.filter((value) => value > 16.7).length;

	return {
		samples,
		fps: {
			avg: Number(average(fps).toFixed(2)),
			p50: Number(percentile(fps, 0.5).toFixed(2)),
			p95: Number(percentile(fps, 0.95).toFixed(2)),
			p99: Number(percentile(fps, 0.99).toFixed(2)),
			min: Number((Math.min(...fps) || 0).toFixed(2)),
			max: Number((Math.max(...fps) || 0).toFixed(2)),
		},
		frame_ms: {
			avg: Number(average(frame).toFixed(2)),
			p50: Number(percentile(frame, 0.5).toFixed(2)),
			p95: Number(percentile(frame, 0.95).toFixed(2)),
			p99: Number(percentile(frame, 0.99).toFixed(2)),
			min: Number((Math.min(...frame) || 0).toFixed(2)),
			max: Number((Math.max(...frame) || 0).toFixed(2)),
		},
		slow_frame_ratio: samples > 0 ? Number((slowFrames / samples).toFixed(4)) : 1,
	};
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		input: process.env.IOS_INSTRUMENTS_EXPORT_PATH || "",
		output: DEFAULT_OUTPUT,
		profile: String(process.env.IOS_INSTRUMENTS_PROFILE || "ios").toLowerCase(),
		scenario: String(process.env.IOS_INSTRUMENTS_SCENARIO || "baseline").toLowerCase(),
		deviceName: process.env.IOS_DEVICE_NAME || "",
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--input":
				options.input = String(next || options.input);
				i += 1;
				break;
			case "--output":
				options.output = String(next || options.output);
				i += 1;
				break;
			case "--profile":
				options.profile = String(next || options.profile).toLowerCase();
				i += 1;
				break;
			case "--scenario":
				options.scenario = String(next || options.scenario).toLowerCase();
				i += 1;
				break;
			case "--device-name":
				options.deviceName = String(next || options.deviceName);
				i += 1;
				break;
			default:
				break;
		}
	}

	if (!options.input) {
		throw new Error("--input is required (IOS_INSTRUMENTS_EXPORT_PATH)");
	}

	return options;
};

const detectFormat = (inputPath, text) => {
	const ext = path.extname(inputPath).toLowerCase();
	if (ext === ".json") return "json";
	if (ext === ".csv" || ext === ".tsv") return "csv";
	if (ext === ".trace") return "trace";
	if (text.trim().startsWith("{") || text.trim().startsWith("[")) return "json";
	if (text.includes(",") || text.includes("\t")) return "csv";
	if (text.includes("<plist") || text.includes("<key>")) return "plist-xml";
	return "text";
};

const writeJson = async (filePath, payload) => {
	const abs = path.resolve(process.cwd(), filePath);
	await mkdir(path.dirname(abs), { recursive: true });
	await writeFile(abs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return abs;
};

const main = async () => {
	const options = parseArgs();
	const absInput = path.resolve(process.cwd(), options.input);
	const raw = await readFile(absInput, "utf8");
	const format = detectFormat(absInput, raw);

	let extracted = { fpsSamples: [], frameMsSamples: [], detectedSignals: [] };
	if (format === "json") {
		const parsed = JSON.parse(raw);
		extracted = extractFromJson(parsed);
	} else if (format === "csv") {
		extracted = extractFromCsv(raw);
	} else {
		extracted = extractFromXmlOrText(raw);
	}

	const normalized = deriveFramesAndFps(extracted);
	const hasSamples = normalized.fpsSamples.length > 0 && normalized.frameMsSamples.length > 0;

	const result = hasSamples
		? {
				ok: true,
				profile: options.profile,
				scenario: options.scenario,
				mode: "real-device-instruments-ingest",
				device: options.deviceName || "ios-physical-device",
				metrics: summarize(normalized),
				instrumentation: {
					format,
					detectedSignals: extracted.detectedSignals,
					sourceFile: options.input,
				},
			}
		: {
				ok: false,
				profile: options.profile,
				scenario: options.scenario,
				mode: "real-device-instruments-ingest",
				error:
					"No parsable FPS/frame-time samples found in iOS Instruments export. Expected JSON/CSV/plist-like export with fps or frame-time metrics.",
				instrumentation: {
					format,
					detectedSignals: extracted.detectedSignals,
					sourceFile: options.input,
				},
			};

	const payload = {
		version: 1,
		generated_at: new Date().toISOString(),
		config: {
			input: options.input,
			format,
			profile: options.profile,
			scenario: options.scenario,
			device: options.deviceName || "",
		},
		results: [result],
	};

	const outputPath = await writeJson(options.output, payload);
	console.log(`iOS Instruments ingestion report saved: ${outputPath}`);
	if (!result.ok) {
		process.exit(2);
	}
};

main().catch((error) => {
	console.error("Failed to ingest iOS Instruments export:", error);
	process.exit(1);
});
