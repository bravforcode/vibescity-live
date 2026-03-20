#!/usr/bin/env node

import { spawn } from "node:child_process";

const commands = [
	["npm", ["run", "perf:fps:mobile"]],
	["npm", ["run", "ci:map-fps-guardrail"]],
	["npm", ["run", "ci:perf-budget"]],
	["npm", ["run", "ci:bundle-budget"]],
];

const run = (cmd, args) =>
	new Promise((resolve) => {
		const child = spawn(cmd, args, {
			stdio: "inherit",
			shell: process.platform === "win32",
		});
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});

const main = async () => {
	for (const [cmd, args] of commands) {
		console.log(`\n▶ Running: ${cmd} ${args.join(" ")}`);
		const code = await run(cmd, args);
		if (code !== 0) {
			console.error(`❌ Command failed (${code}): ${cmd} ${args.join(" ")}`);
			process.exit(code);
		}
	}
	console.log("\n✅ perf:all passed");
};

main().catch((error) => {
	console.error("perf:all failed:", error);
	process.exit(1);
});

