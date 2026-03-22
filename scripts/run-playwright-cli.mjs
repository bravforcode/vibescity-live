#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cliPath = "";
try {
	cliPath = require.resolve("@playwright/test/cli");
} catch (error) {
	console.error(
		`[playwright-cli] Unable to resolve @playwright/test/cli from this repo: ${error?.message || error}`,
	);
	process.exit(1);
}

const result = spawnSync(
	process.execPath,
	[cliPath, ...process.argv.slice(2)],
	{
		cwd: process.cwd(),
		env: process.env,
		stdio: "inherit",
	},
);

if (result.error) {
	console.error(
		`[playwright-cli] Failed to execute project-local Playwright CLI: ${result.error.message}`,
	);
	process.exit(1);
}

if (typeof result.status === "number") {
	process.exit(result.status);
}

process.exit(1);
