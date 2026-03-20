#!/usr/bin/env node
/**
 * Repair malformed templates created by bad codemod runs:
 * Removes duplicated consecutive opening tags when second tag is localized variant.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

const ROOT = process.cwd();
const TARGET_ATTRS = new Set([
	"aria-label",
	"placeholder",
	"alt",
	"title",
	"data-test",
]);

const TEMPLATE_RE = /<template[^>]*>([\s\S]*?)<\/template>/i;

const OPEN_TAG_RE = /<([A-Za-z][\w-]*)([\s\S]*?)>/y;
const ATTR_RE =
	/([:@]?[\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const parseAttrs = (tagRaw) => {
	const attrs = new Map();
	let m = ATTR_RE.exec(tagRaw);
	while (m) {
		const name = m[1];
		const value = m[2] ?? m[3] ?? m[4] ?? "";
		attrs.set(name, value);
		m = ATTR_RE.exec(tagRaw);
	}
	return attrs;
};

const hasLocalizedReplacement = (attrsA, attrsB) => {
	for (const attr of TARGET_ATTRS) {
		const staticValue = attrsA.get(attr);
		const dynamicValue = attrsB.get(`:${attr}`);
		if (!staticValue || !dynamicValue) continue;
		if (!/\$t\('auto\.[^']+'\)/.test(dynamicValue)) continue;
		return true;
	}
	return false;
};

const nonTargetAttrsEqual = (attrsA, attrsB) => {
	const isTarget = (name) =>
		TARGET_ATTRS.has(name) || (name.startsWith(":") && TARGET_ATTRS.has(name.slice(1)));

	for (const [name, value] of attrsA.entries()) {
		if (isTarget(name)) continue;
		if ((attrsB.get(name) ?? "") !== value) return false;
	}
	for (const [name, value] of attrsB.entries()) {
		if (isTarget(name)) continue;
		if ((attrsA.get(name) ?? "") !== value) return false;
	}
	return true;
};

const extractOpenTagAt = (content, index) => {
	OPEN_TAG_RE.lastIndex = index;
	const m = OPEN_TAG_RE.exec(content);
	if (!m) return null;
	const full = m[0];
	if (full.startsWith("</")) return null;
	if (full.startsWith("<!--")) return null;
	if (full.endsWith("/>")) return null;
	return {
		start: index,
		end: OPEN_TAG_RE.lastIndex,
		tagName: m[1],
		raw: full,
	};
};

const skipWhitespace = (content, index) => {
	let i = index;
	while (i < content.length && /\s/.test(content[i])) i += 1;
	return i;
};

const repairTemplateContent = (content) => {
	let i = 0;
	const edits = [];

	while (i < content.length) {
		const start = content.indexOf("<", i);
		if (start < 0) break;

		const first = extractOpenTagAt(content, start);
		if (!first) {
			i = start + 1;
			continue;
		}

		const nextStart = skipWhitespace(content, first.end);
		const second = extractOpenTagAt(content, nextStart);
		if (!second || second.tagName !== first.tagName) {
			i = first.end;
			continue;
		}

		const attrsA = parseAttrs(first.raw);
		const attrsB = parseAttrs(second.raw);

		const duplicateExact = first.raw === second.raw;
		const duplicateLocalized =
			hasLocalizedReplacement(attrsA, attrsB) && nonTargetAttrsEqual(attrsA, attrsB);

		if (duplicateExact || duplicateLocalized) {
			edits.push({ start: first.start, end: first.end });
			i = second.end;
		} else {
			i = first.end;
		}
	}

	if (!edits.length) return { content, changed: false };

	let out = content;
	for (const edit of edits.sort((a, b) => b.start - a.start)) {
		out = out.slice(0, edit.start) + out.slice(edit.end);
	}

	return { content: out, changed: true };
};

const main = async () => {
	const files = await glob("src/**/*.vue", { cwd: ROOT, nodir: true });
	let changedFiles = 0;

	for (const rel of files) {
		const abs = path.join(ROOT, rel);
		const original = await fs.readFile(abs, "utf8");
		let next = original;
		let changed = false;

		const tplMatch = next.match(TEMPLATE_RE);
		if (tplMatch) {
			const full = tplMatch[0];
			const content = tplMatch[1];
			const repaired = repairTemplateContent(content);
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

	console.log(`[repair-vue-duplicate-open-tags] Updated files: ${changedFiles}`);
};

main().catch((err) => {
	console.error("[repair-vue-duplicate-open-tags] Fatal:", err?.message || err);
	process.exit(1);
});

