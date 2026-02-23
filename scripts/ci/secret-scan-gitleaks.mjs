#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, ".gitleaks.toml");

if (!existsSync(configPath)) {
	console.error("❌ Missing .gitleaks.toml at repo root.");
	process.exit(1);
}

const run = (cmd, args) =>
	spawnSync(cmd, args, {
		stdio: "inherit",
	});

const resolveGitleaksBinary = () => {
	if (process.env.GITLEAKS_BIN) {
		return process.env.GITLEAKS_BIN;
	}

	if (process.platform === "win32") {
		const winGetLink = path.join(
			process.env.LOCALAPPDATA || "",
			"Microsoft",
			"WinGet",
			"Links",
			"gitleaks.exe"
		);
		if (existsSync(winGetLink)) {
			return winGetLink;
		}

		const programFilesPath = path.join(
			process.env.ProgramFiles || "C:\\Program Files",
			"Gitleaks",
			"gitleaks.exe"
		);
		if (existsSync(programFilesPath)) {
			return programFilesPath;
		}
	}

	return "gitleaks";
};

const mode = (process.env.GITLEAKS_MODE || "dir").toLowerCase();

let detectArgs;
if (mode === "staged") {
	detectArgs = ["git", "--staged", "--redact", "--config", ".gitleaks.toml"];
} else if (mode === "pre-commit") {
	detectArgs = ["git", "--pre-commit", "--redact", "--config", ".gitleaks.toml"];
} else {
	detectArgs = [
		"dir",
		".",
		"--redact",
		"--config",
		".gitleaks.toml",
		"--max-target-megabytes",
		"5",
	];
}

const gitleaksBin = resolveGitleaksBinary();
const result = run(gitleaksBin, detectArgs);
if (result.error) {
	if (result.error.code === "ENOENT") {
		console.error("❌ gitleaks not found in PATH.");
		console.error(
			"   Install: https://github.com/gitleaks/gitleaks#installing"
		);
		console.error(
			"   Or set GITLEAKS_BIN to the full executable path."
		);
		process.exit(1);
	}
	console.error(`❌ Failed to execute gitleaks: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status ?? 1);
