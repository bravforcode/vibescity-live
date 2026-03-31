#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const results = [];
const ENV_FILE_CANDIDATES = [
	".env",
	".env.local",
	".env.production",
	".env.production.local",
];

const BACKEND_TEST_PATHS = [
	"backend/tests/test_metrics.py",
	"backend/tests/test_health_contract.py",
];

const PYTHON_CANDIDATES = [
	"backend/.venv/Scripts/python.exe",
	".venv/Scripts/python.exe",
	"backend/.venv/bin/python",
	".venv/bin/python",
];

const RSBUILD_BIN = path.join(
	ROOT,
	"node_modules",
	"@rsbuild",
	"core",
	"bin",
	"rsbuild.js",
);
const BIOME_BIN = path.join(
	ROOT,
	"node_modules",
	"@biomejs",
	"biome",
	"bin",
	"biome",
);
const PLAYWRIGHT_MAP_PREFLIGHT_ARGS = [
	"scripts/run-playwright-cli.mjs",
	"test",
	"--project=Desktop Chromium",
];
const PLAYWRIGHT_MAP_PREFLIGHT_PORT = String(
	process.env.PROD_READY_PLAYWRIGHT_PORT || "5517",
);
const PLAYWRIGHT_MAP_PREFLIGHT_ENV = {
	PW_LOW_MEM: "1",
	PW_GREP: "@map-preflight",
	E2E_MAP_REQUIRED: "1",
	PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${PLAYWRIGHT_MAP_PREFLIGHT_PORT}`,
	PLAYWRIGHT_WEB_SERVER_PORT: PLAYWRIGHT_MAP_PREFLIGHT_PORT,
};

const addResult = (status, name, detail = "") => {
	results.push({ status, name, detail });
	const icon = status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : "FAIL";
	console.log(`${icon} ${name}${detail ? ` :: ${detail}` : ""}`);
};

const run = (command, args, options = {}) =>
	new Promise((resolve) => {
		let output = "";

		const child = spawn(command, args, {
			cwd: options.cwd || ROOT,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			env: { ...process.env, ...(options.env || {}) },
		});

		child.stdout?.on("data", (chunk) => {
			const text = String(chunk);
			output += text;
			process.stdout.write(text);
		});
		child.stderr?.on("data", (chunk) => {
			const text = String(chunk);
			output += text;
			process.stderr.write(text);
		});

		child.on("close", (code) => resolve({ code: code ?? 1, output }));
		child.on("error", (error) =>
			resolve({ code: 1, output: `${output}\n${error?.message || error}` }),
		);
	});

const readText = async (relativePath) =>
	fsp.readFile(path.join(ROOT, relativePath), "utf8");

const loadRuntimeEnv = () => {
	const shellEnv = new Set(Object.keys(process.env));
	const mergedEnv = {};

	for (const envFile of ENV_FILE_CANDIDATES) {
		const fullPath = path.join(ROOT, envFile);
		if (!fs.existsSync(fullPath)) {
			continue;
		}

		try {
			Object.assign(mergedEnv, dotenv.parse(fs.readFileSync(fullPath, "utf8")));
		} catch (error) {
			addResult(
				"WARN",
				"env.load",
				`skip ${envFile} (${error?.message || error})`,
			);
		}
	}

	for (const [key, value] of Object.entries(mergedEnv)) {
		if (!shellEnv.has(key)) {
			process.env[key] = value;
		}
	}
};

const hasEnv = (key) => {
	const value = String(process.env[key] || "").trim();
	return Boolean(value) && !/<[^>]+>/.test(value);
};

const resolvePython = () => {
	for (const candidate of PYTHON_CANDIDATES) {
		const absolutePath = path.join(ROOT, candidate);
		if (fs.existsSync(absolutePath)) {
			return absolutePath;
		}
	}

	return process.platform === "win32" ? "python" : "python3";
};

async function checkStaticContracts() {
	const homeView = await readText("src/views/HomeView.vue");
	const mapContainer = await readText(
		"src/components/map/MapLibreContainer.vue",
	);

	if (homeView.includes('href="#main-content"')) {
		addResult("PASS", "frontend.skip-link");
	} else {
		addResult("FAIL", "frontend.skip-link", 'missing href="#main-content"');
	}

	if (/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(mapContainer)) {
		addResult("PASS", "frontend.reduced-motion");
	} else {
		addResult("FAIL", "frontend.reduced-motion", "no reduced-motion guard");
	}

	if (mapContainer.includes("HARDCODED_MAPBOX_TOKEN")) {
		addResult(
			"FAIL",
			"frontend.mapbox-token",
			"hardcoded token constant found",
		);
	} else {
		addResult("PASS", "frontend.mapbox-token");
	}
}

async function runStep(name, command, args, options = {}) {
	const { code, output } = await run(command, args, options);
	const warningDetail = options.warnOn?.(output);
	const status = code === 0 ? "PASS" : warningDetail ? "WARN" : "FAIL";
	addResult(status, name, code === 0 ? "" : warningDetail || `exit=${code}`);
	return code;
}

async function runFrontendChecks() {
	await runStep("repo.hygiene", "node", ["scripts/ci/check-repo-hygiene.mjs"]);
	await runStep("frontend.env-placeholders", "node", [
		"scripts/ci/check-env-placeholders.mjs",
	]);
	await runStep("frontend.vite-public-secrets", "node", [
		"scripts/ci/check-vite-public-secrets.mjs",
	]);
	await runStep("frontend.sw-contract", "node", [
		"scripts/ci/check-sw-contract.mjs",
	]);
	await runStep("frontend.source-console-budget", "node", [
		"scripts/ci/check-source-console-budget.mjs",
	]);
	await runStep("frontend.lint", "node", [BIOME_BIN, "lint", "src"], {
		warnOn: (output) =>
			/biome\.exe.*(EPERM|Access is denied)/is.test(output)
				? "skip (Biome binary access denied on current Windows host)"
				: "",
	});
	await runStep("frontend.source-i18n", "node", [
		"scripts/ci/check-source-i18n-hardcoded.mjs",
	]);
	const rsbuildCode = await runStep("frontend.rsbuild", "node", [
		RSBUILD_BIN,
		"build",
	]);
	const prerenderCode = await runStep("frontend.prerender", "node", [
		"scripts/prerender-venues.mjs",
	]);
	addResult(
		rsbuildCode === 0 && prerenderCode === 0 ? "PASS" : "FAIL",
		"frontend.build",
		rsbuildCode === 0 && prerenderCode === 0
			? ""
			: `rsbuild=${rsbuildCode} prerender=${prerenderCode}`,
	);
	await runStep("frontend.bundle-budget", "node", [
		"scripts/check-bundle-sizes.mjs",
	]);
	await runStep("frontend.seo-lint", "node", ["scripts/ci/seo-lint.mjs"]);
}

async function runBackendChecks() {
	const python = resolvePython();
	const { code: pytestCode } = await run(
		python,
		["-m", "pytest", ...BACKEND_TEST_PATHS, "-q"],
		{ cwd: ROOT },
	);

	addResult(
		pytestCode === 0 ? "PASS" : "FAIL",
		"backend.pytest-health-metrics",
		pytestCode === 0
			? path.relative(ROOT, python) || python
			: `exit=${pytestCode}`,
	);
}

async function runDatabaseChecks() {
	await runStep("db.migration-safety", "node", [
		"scripts/ci/validate-migrations-safety.mjs",
	]);

	const hasSupabaseCreds =
		(hasEnv("VITE_SUPABASE_URL") || hasEnv("SUPABASE_URL")) &&
		(hasEnv("VITE_SUPABASE_ANON_KEY") || hasEnv("SUPABASE_ANON_KEY"));

	if (!hasSupabaseCreds) {
		addResult(
			"WARN",
			"db.compat-smoke",
			"skip (missing Supabase public credentials)",
		);
		return;
	}

	await runStep("db.compat-smoke", "node", ["scripts/smoke-db-compat.mjs"]);
}

async function runBrowserChecks() {
	if (String(process.env.PROD_READY_SKIP_E2E || "") === "1") {
		addResult(
			"WARN",
			"frontend.e2e-map-preflight",
			"skip (PROD_READY_SKIP_E2E=1)",
		);
		return;
	}

	await runStep(
		"frontend.e2e-map-preflight",
		"node",
		PLAYWRIGHT_MAP_PREFLIGHT_ARGS,
		{
			env: PLAYWRIGHT_MAP_PREFLIGHT_ENV,
		},
	);
}

async function main() {
	loadRuntimeEnv();
	await checkStaticContracts();
	await runFrontendChecks();
	await runBackendChecks();
	await runDatabaseChecks();
	await runBrowserChecks();

	const failCount = results.filter((row) => row.status === "FAIL").length;
	const warnCount = results.filter((row) => row.status === "WARN").length;
	const passCount = results.filter((row) => row.status === "PASS").length;

	console.log(
		`Prod-ready gate summary: pass=${passCount} warn=${warnCount} fail=${failCount}`,
	);

	if (failCount > 0) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("prod-ready-gate failed:", error);
	process.exit(1);
});
