#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTEXTS =
	"Dashboard Canary Promotion Gates / dashboard-canary-e2e,Dashboard Canary Promotion Gates / dashboard-visual-regression";

const hasOption = (args, names) =>
	args.some((arg) => names.includes(String(arg || "").trim()));

const main = () => {
	const scriptPath = fileURLToPath(
		new URL("./set-map-fps-required-check.mjs", import.meta.url),
	);
	const args = process.argv.slice(2);

	if (!hasOption(args, ["--context", "--contexts"])) {
		args.push("--contexts", DEFAULT_CONTEXTS);
	}
	if (!hasOption(args, ["--branch"])) {
		args.push("--branch", process.env.BRANCH_PROTECTION_BRANCH || "main");
	}

	const child = spawnSync(process.execPath, [scriptPath, ...args], {
		stdio: "inherit",
		env: process.env,
	});

	if (child.error) {
		console.error("Failed to execute required status check setter:", child.error);
		process.exit(1);
	}
	if (typeof child.status === "number") {
		process.exit(child.status);
	}
	process.exit(1);
};

main();
