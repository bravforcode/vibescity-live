#!/usr/bin/env node
/**
 * Repair pass for earlier i18n codemod output.
 * - Fix escaped quote usage inside template $t calls: $t(\"k\") -> $t('k')
 * - Remove duplicated first opening tag within <template> content
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

const ROOT = process.cwd();

const extractOpeningTag = (input) => {
	if (!input.startsWith("<") || input.startsWith("</")) return "";
	let quote = "";
	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];
		if ((ch === '"' || ch === "'") && input[i - 1] !== "\\") {
			if (!quote) quote = ch;
			else if (quote === ch) quote = "";
			continue;
		}
		if (ch === ">" && !quote) return input.slice(0, i + 1);
	}
	return "";
};

const dedupeLeadingOpenTag = (templateContent) => {
	let content = templateContent;
	let changed = false;

	for (let guard = 0; guard < 4; guard += 1) {
		const leading = content.match(/^\s*/)?.[0] ?? "";
		const rest = content.slice(leading.length);
		if (!rest.startsWith("<") || rest.startsWith("</")) break;

		const firstTag = extractOpeningTag(rest);
		if (!firstTag) break;

		const afterFirst = rest.slice(firstTag.length);
		const gap = afterFirst.match(/^\s*/)?.[0] ?? "";
		const afterGap = afterFirst.slice(gap.length);
		if (!afterGap.startsWith(firstTag)) break;

		content = `${leading}${firstTag}${afterFirst.slice(gap.length + firstTag.length)}`;
		changed = true;
	}

	return { content, changed };
};

const main = async () => {
	const files = await glob("src/**/*.vue", { cwd: ROOT, nodir: true });
	let changedFiles = 0;

	for (const rel of files) {
		const abs = path.join(ROOT, rel);
		const original = await fs.readFile(abs, "utf8");
		let next = original;
		let changed = false;

		const escapedFixed = next.replace(/\$t\\\("([^"]+)"\\\)/g, "$t('$1')");
		if (escapedFixed !== next) {
			next = escapedFixed;
			changed = true;
		}

		const tplMatch = next.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
		if (tplMatch) {
			const full = tplMatch[0];
			const content = tplMatch[1];
			const repaired = dedupeLeadingOpenTag(content);
			if (repaired.changed) {
				const rebuilt = full.replace(content, repaired.content);
				next = next.replace(full, rebuilt);
				changed = true;
			}
		}

		if (changed && next !== original) {
			await fs.writeFile(abs, next);
			changedFiles += 1;
		}
	}

	console.log(`[repair-i18n-codemod] Updated files: ${changedFiles}`);
};

main().catch((err) => {
	console.error("[repair-i18n-codemod] Fatal:", err?.message || err);
	process.exit(1);
});

