#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const results = [];

const addResult = (status, name, detail = "") => {
	results.push({ status, name, detail });
	const icon = status === "PASS" ? "PASS" : status === "WARN" ? "WARN" : "FAIL";
	console.log(`${icon} ${name}${detail ? ` :: ${detail}` : ""}`);
};

const run = (command, args, options = {}) =>
	new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: options.cwd || ROOT,
			stdio: "inherit",
			shell: process.platform === "win32",
			env: { ...process.env, ...(options.env || {}) },
		});
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});

const readText = async (relativePath) =>
	fs.readFile(path.join(ROOT, relativePath), "utf8");

const hasEnv = (key) => Boolean(String(process.env[key] || "").trim());

async function checkStaticContracts() {
	const homeView = await readText("src/views/HomeView.vue");
	const mapboxContainer = await readText("src/components/map/MapboxContainer.vue");

	if (homeView.includes('href="#main-content"')) {
		addResult("PASS", "frontend.skip-link");
	} else {
		addResult("FAIL", "frontend.skip-link", "missing href=\"#main-content\"");
	}

	if (/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(mapboxContainer)) {
		addResult("PASS", "frontend.reduced-motion");
	} else {
		addResult("FAIL", "frontend.reduced-motion", "no reduced-motion guard");
	}

	if (mapboxContainer.includes("HARDCODED_MAPBOX_TOKEN")) {
		addResult("FAIL", "frontend.mapbox-token", "hardcoded token constant found");
	} else {
		addResult("PASS", "frontend.mapbox-token");
	}
}

async function runFrontendChecks() {
	const checkCode = await run("bun", ["run", "check"]);
	addResult(
		checkCode === 0 ? "PASS" : "FAIL",
		"frontend.check",
		checkCode === 0 ? "" : `exit=${checkCode}`,
	);

	const buildCode = await run("bun", ["run", "build"]);
	addResult(
		buildCode === 0 ? "PASS" : "FAIL",
		"frontend.build",
		buildCode === 0 ? "" : `exit=${buildCode}`,
	);

	const e2eCode = await run("bun", ["run", "test:e2e:map-preflight"]);
	addResult(
		e2eCode === 0 ? "PASS" : "FAIL",
		"frontend.e2e-map-preflight",
		e2eCode === 0 ? "" : `exit=${e2eCode}`,
	);
}

async function runBackendChecks() {
	const pytestCode = await run("python", [
		"-m",
		"pytest",
		"backend/tests/test_metrics.py",
		"backend/tests/test_health_contract.py",
	]);
	addResult(
		pytestCode === 0 ? "PASS" : "FAIL",
		"backend.pytest",
		pytestCode === 0 ? "" : `exit=${pytestCode}`,
	);
}

async function runDatabaseChecks() {
	const migrationSafetyCode = await run("node", [
		"scripts/ci/validate-migrations-safety.mjs",
	]);
	addResult(
		migrationSafetyCode === 0 ? "PASS" : "FAIL",
		"db.migration-safety",
		migrationSafetyCode === 0 ? "" : `exit=${migrationSafetyCode}`,
	);

	const hasSupabaseCreds =
		(hasEnv("VITE_SUPABASE_URL") || hasEnv("SUPABASE_URL")) &&
		(hasEnv("VITE_SUPABASE_ANON_KEY") || hasEnv("SUPABASE_ANON_KEY"));
	if (!hasSupabaseCreds) {
		addResult(
			"WARN",
			"db.compat-smoke",
			"skip (missing Supabase credentials)",
		);
		return;
	}

	const compatCode = await run("node", ["scripts/smoke-db-compat.mjs"]);
	addResult(
		compatCode === 0 ? "PASS" : "FAIL",
		"db.compat-smoke",
		compatCode === 0 ? "" : `exit=${compatCode}`,
	);
}

async function main() {
	await checkStaticContracts();
	await runFrontendChecks();
	await runBackendChecks();
	await runDatabaseChecks();

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
