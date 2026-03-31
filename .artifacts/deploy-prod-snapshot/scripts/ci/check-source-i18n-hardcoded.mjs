#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, "src");
const I18N_CONFIG_PATH = path.join(SOURCE_ROOT, "i18n.js");
const LOCALE_FILES = {
	en: path.join(SOURCE_ROOT, "locales", "en.json"),
	th: path.join(SOURCE_ROOT, "locales", "th.json"),
};

const SOURCE_EXTENSIONS = new Set([".js", ".ts", ".vue"]);
const SKIP_SEGMENTS = new Set([
	"node_modules",
	"dist",
	"coverage",
	"playwright-report",
	"test-results",
	"locales",
]);

const TRANSLATION_PATTERNS = [
	/\bt\(\s*["'`]([^"'`]+)["'`]/g,
	/\$t\(\s*["'`]([^"'`]+)["'`]/g,
	/\bi18n\.global\.t\(\s*["'`]([^"'`]+)["'`]/g,
];

function flattenLocale(obj, prefix = "", target = new Map()) {
	for (const [key, value] of Object.entries(obj)) {
		const nextKey = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object" && !Array.isArray(value)) {
			flattenLocale(value, nextKey, target);
			continue;
		}
		target.set(nextKey, String(value ?? ""));
	}
	return target;
}

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (SKIP_SEGMENTS.has(entry.name)) continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(fullPath)));
			continue;
		}
		if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(fullPath);
		}
	}
	return files;
}

function collectTranslationKeys(content) {
	const keys = [];
	for (const pattern of TRANSLATION_PATTERNS) {
		for (const match of content.matchAll(pattern)) {
			const key = match[1]?.trim();
			if (!key || key.includes("${")) continue;
			keys.push(key);
		}
	}
	return keys;
}

function extractInlineMessagesObject(content) {
	const marker = "const inlineMessages =";
	const markerIndex = content.indexOf(marker);
	if (markerIndex === -1) return null;

	const start = content.indexOf("{", markerIndex);
	if (start === -1) return null;

	let depth = 0;
	let quote = null;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = start; index < content.length; index += 1) {
		const char = content[index];
		const next = content[index + 1];

		if (inLineComment) {
			if (char === "\n") inLineComment = false;
			continue;
		}

		if (inBlockComment) {
			if (char === "*" && next === "/") {
				inBlockComment = false;
				index += 1;
			}
			continue;
		}

		if (quote) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === "/" && next === "/") {
			inLineComment = true;
			index += 1;
			continue;
		}

		if (char === "/" && next === "*") {
			inBlockComment = true;
			index += 1;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			continue;
		}

		if (char === "{") {
			depth += 1;
			continue;
		}

		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return content.slice(start, index + 1);
			}
		}
	}

	return null;
}

async function loadLocale(locale) {
	const raw = await fs.readFile(LOCALE_FILES[locale], "utf8");
	return flattenLocale(JSON.parse(raw));
}

async function main() {
	const [en, th, i18nConfigRaw] = await Promise.all([
		loadLocale("en"),
		loadLocale("th"),
		fs.readFile(I18N_CONFIG_PATH, "utf8"),
	]);
	const inlineMessagesSource = extractInlineMessagesObject(i18nConfigRaw);
	if (!inlineMessagesSource) {
		throw new Error("Could not extract inlineMessages from src/i18n.js");
	}
	const inlineMessages = Function(
		`"use strict"; return (${inlineMessagesSource});`,
	)();
	if (inlineMessages?.en) flattenLocale(inlineMessages.en, "", en);
	if (inlineMessages?.th) flattenLocale(inlineMessages.th, "", th);

	const enKeys = new Set(en.keys());
	const thKeys = new Set(th.keys());

	const missingInThai = [...enKeys].filter((key) => !thKeys.has(key));
	const extraInThai = [...thKeys].filter((key) => !enKeys.has(key));

	const sourceFiles = await walk(SOURCE_ROOT);
	const referenced = new Map();

	for (const file of sourceFiles) {
		const content = await fs.readFile(file, "utf8");
		for (const key of collectTranslationKeys(content)) {
			if (!referenced.has(key)) referenced.set(key, []);
			referenced.get(key).push(path.relative(ROOT, file));
		}
	}

	const missingSourceKeys = [];
	for (const [key, files] of referenced.entries()) {
		const missingLocales = [];
		if (!enKeys.has(key)) missingLocales.push("en");
		if (!thKeys.has(key)) missingLocales.push("th");
		if (missingLocales.length === 0) continue;
		missingSourceKeys.push({
			key,
			locales: missingLocales,
			files: [...new Set(files)].slice(0, 5),
		});
	}

	console.log(
		`Checked ${sourceFiles.length} source files for translation keys.`,
	);
	console.log(`Found ${referenced.size} referenced translation keys.`);
	console.log(
		`Locale coverage: en=${enKeys.size} keys, th=${thKeys.size} keys.`,
	);

	if (missingInThai.length === 0 && extraInThai.length === 0) {
		console.log(
			"PASS locale parity :: en.json and th.json expose the same key set",
		);
	} else {
		if (missingInThai.length > 0) {
			console.error(
				`FAIL locale parity :: th.json is missing ${missingInThai.length} keys`,
			);
		}
		if (extraInThai.length > 0) {
			console.error(
				`FAIL locale parity :: th.json has ${extraInThai.length} extra keys`,
			);
		}
	}

	if (missingSourceKeys.length === 0) {
		console.log(
			"PASS source translations :: all referenced translation keys exist",
		);
		process.exit(0);
	}

	console.error(
		`FAIL source translations :: ${missingSourceKeys.length} referenced keys are missing`,
	);
	for (const issue of missingSourceKeys.slice(0, 20)) {
		console.error(
			`  - ${issue.key} missing in [${issue.locales.join(", ")}], referenced by ${issue.files.join(", ")}`,
		);
	}
	if (missingSourceKeys.length > 20) {
		console.error(`  ... and ${missingSourceKeys.length - 20} more`);
	}
	process.exit(1);
}

main().catch((error) => {
	console.error("[check-source-i18n-hardcoded] Failed:", error);
	process.exit(1);
});
