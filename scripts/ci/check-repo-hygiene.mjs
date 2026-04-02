#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function runGit(args, { allowFailure = false } = {}) {
	try {
		return execFileSync("git", args, {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (error) {
		if (allowFailure) {
			return "";
		}

		const stderr = error?.stderr?.toString?.().trim();
		throw new Error(stderr || error.message);
	}
}

function listLines(text) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

const failures = [];

const unmergedFiles = listLines(
	runGit(["diff", "--name-only", "--diff-filter=U"], { allowFailure: true }),
);

if (unmergedFiles.length > 0) {
	failures.push(
		[
			"Repository has unmerged files:",
			...unmergedFiles.map((file) => `  - ${file}`),
		].join("\n"),
	);
}

const conflictMarkers = listLines(
	runGit(
		[
			"grep",
			"-n",
			"-I",
			"-E",
			"^(<<<<<<< .*$|=======$|>>>>>>> .*$)",
			"--exclude-dir=.artifacts",
			"--exclude-dir=.vercel_python_packages",
			"--",
			".",
		],
		{ allowFailure: true },
	),
);

if (conflictMarkers.length > 0) {
	failures.push(
		[
			"Repository contains merge-conflict markers:",
			...conflictMarkers.slice(0, 50).map((entry) => `  - ${entry}`),
			conflictMarkers.length > 50
				? `  - ... ${conflictMarkers.length - 50} more`
				: "",
		]
			.filter(Boolean)
			.join("\n"),
	);
}

const entrypointPath = path.join(repoRoot, "api", "index.py");
const entrypointExists = fs.existsSync(entrypointPath);

if (!entrypointExists) {
	failures.push("Missing required Vercel entrypoint: api/index.py");
} else {
	const entrypointSource = fs.readFileSync(entrypointPath, "utf8");
	const hasMeaningfulEntrypoint =
		/\bfrom\s+app\.main\s+import\s+app\b/.test(entrypointSource) ||
		/\bapp\s*=/.test(entrypointSource);

	if (!hasMeaningfulEntrypoint) {
		failures.push(
			"api/index.py does not appear to expose a real ASGI app entrypoint.",
		);
	}
}

if (failures.length > 0) {
	console.error("Repo hygiene check failed.\n");
	for (const failure of failures) {
		console.error(failure);
		console.error("");
	}
	process.exit(1);
}

console.log("Repo hygiene check passed.");
