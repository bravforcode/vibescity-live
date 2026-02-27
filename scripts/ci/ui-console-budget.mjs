import { existsSync, readFileSync } from "node:fs";

const inputPath =
	process.argv[2] ||
	process.env.UI_CONSOLE_EVENTS_PATH ||
	"test-results/ui-console-events.ndjson";
const requireInput = process.env.UI_CONSOLE_REQUIRE_INPUT === "1";
const unexpectedBudget = Number(process.env.UI_CONSOLE_UNEXPECTED_BUDGET ?? "0");

const FORBIDDEN_PATTERNS = [
	/Not found 'app\.brand' key/i,
	/Not found 'app\.syncing' key/i,
	/Invalid prop: type check failed for prop "currentTime"/i,
	/window\.__currentAd/i,
];

if (!existsSync(inputPath)) {
	const message = `[ui-console-budget] Console dump not found at ${inputPath}.`;
	if (requireInput) {
		console.error(message);
		process.exit(1);
	}
	console.warn(`${message} Skipping budget check.`);
	process.exit(0);
}

const lines = readFileSync(inputPath, "utf8")
	.split(/\r?\n/)
	.map((line) => line.trim())
	.filter(Boolean);

const entries = [];
for (const line of lines) {
	try {
		entries.push(JSON.parse(line));
	} catch {
		console.warn(`[ui-console-budget] Skipping malformed JSON line: ${line}`);
	}
}

const warningOrError = entries.filter(
	(entry) => entry?.severity === "warning" || entry?.severity === "error",
);
const unexpectedEntries = warningOrError.filter((entry) => !entry?.ruleId);
const forbiddenEntries = warningOrError.filter((entry) =>
	FORBIDDEN_PATTERNS.some((pattern) => pattern.test(String(entry?.text || ""))),
);

if (forbiddenEntries.length > 0) {
	console.error(
		`[ui-console-budget] Forbidden regression logs found (${forbiddenEntries.length}):`,
	);
	for (const entry of forbiddenEntries) {
		console.error(`- [${entry.severity}] ${entry.text}`);
	}
	process.exit(1);
}

if (unexpectedEntries.length > unexpectedBudget) {
	console.error(
		`[ui-console-budget] Unexpected warning/error count ${unexpectedEntries.length} exceeds budget ${unexpectedBudget}.`,
	);
	for (const entry of unexpectedEntries) {
		console.error(
			`- [${entry.severity}] ${entry.text} @ ${entry.source || "<inline>"}`,
		);
	}
	process.exit(1);
}

console.log(
	`[ui-console-budget] PASS: ${warningOrError.length} warnings/errors (${unexpectedEntries.length} unexpected, budget ${unexpectedBudget}).`,
);
