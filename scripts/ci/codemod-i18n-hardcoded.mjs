#!/usr/bin/env node
/**
 * Codemod: localize hardcoded user-facing strings.
 *
 * Scope:
 * - Vue template static text nodes: "Hello" -> {{ $t("auto.k_xxx") }}
 * - Vue template static attributes (title/placeholder/alt/aria-label/data-test)
 * - Script literals in throw/alert/confirm => i18n.global.t("auto.k_xxx")
 *
 * Notes:
 * - Keys are generated under locales.auto.*
 * - Values are mirrored to both en/th as a safe default.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { parse as parseSfc } from "@vue/compiler-sfc";
import { NodeTypes, parse as parseTemplate } from "@vue/compiler-dom";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const EN_PATH = path.join(SRC_DIR, "locales", "en.json");
const TH_PATH = path.join(SRC_DIR, "locales", "th.json");

const TARGET_ATTRS = new Set([
	"title",
	"placeholder",
	"alt",
	"aria-label",
	"data-test",
]);

const IGNORE_PATTERNS = [
	/^(true|false|null|undefined)$/i,
	/^[\d\s.,:;!?()[\]{}\-+/*"'`~|\\]+$/,
	/^#[0-9a-f]{3,6}$/i,
	/^data:/,
	/^\//,
	/^https?:/i,
	/^@/,
];

const normalizeText = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.replace(/&nbsp;/g, " ")
		.trim();

const looksLikeHardcodedText = (text) => {
	if (!text || text.length < 2) return false;
	if (!/[A-Za-z\u0E00-\u0E7F]/.test(text)) return false;

	for (const pattern of IGNORE_PATTERNS) {
		if (pattern.test(text)) return false;
	}

	// Likely identifiers / keys
	if (/^[a-zA-Z0-9_$.-]+$/.test(text)) return false;
	// Already i18n key-looking
	if (/^[a-z0-9_.-]+$/i.test(text) && text.includes(".")) return false;

	return true;
};

const fnv1a = (text) => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

const ensureAutoBucket = (localeObj) => {
	if (!localeObj.auto || typeof localeObj.auto !== "object") {
		localeObj.auto = {};
	}
};

const loadJson = async (filePath) =>
	JSON.parse(await fs.readFile(filePath, "utf8"));

const saveJson = async (filePath, data) => {
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
};

const buildExistingValueToKey = (autoBucket) => {
	const map = new Map();
	for (const [key, value] of Object.entries(autoBucket || {})) {
		if (typeof value === "string") {
			map.set(value, `auto.${key}`);
		}
	}
	return map;
};

const applyEdits = (content, edits) => {
	if (!edits.length) return content;
	const sorted = [...edits].sort((a, b) => b.start - a.start);
	let output = content;
	for (const edit of sorted) {
		output =
			output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
	}
	return output;
};

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
		if (ch === ">" && !quote) {
			return input.slice(0, i + 1);
		}
	}
	return "";
};

const dedupeLeadingOpenTag = (templateContent) => {
	let content = templateContent;
	let changed = false;

	for (let guard = 0; guard < 3; guard += 1) {
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

const ensureI18nImportInVue = (content) => {
	if (content.includes(`from "@/i18n.js"`)) return content;
	const scriptOpen = content.match(/<script\b[^>]*>/i);
	if (!scriptOpen) return content;
	const insertAt = scriptOpen.index + scriptOpen[0].length;
	return (
		content.slice(0, insertAt) +
		`\nimport i18n from "@/i18n.js";` +
		content.slice(insertAt)
	);
};

const ensureI18nImportInModule = (content) => {
	if (content.includes(`from "@/i18n.js"`)) return content;

	const importRegex = /^import[\s\S]*?;\r?\n/gm;
	let lastImportEnd = 0;
	let match = importRegex.exec(content);
	while (match) {
		lastImportEnd = match.index + match[0].length;
		match = importRegex.exec(content);
	}

	if (lastImportEnd > 0) {
		return (
			content.slice(0, lastImportEnd) +
			`import i18n from "@/i18n.js";\n` +
			content.slice(lastImportEnd)
		);
	}

	return `import i18n from "@/i18n.js";\n${content}`;
};

const replaceScriptMessages = (content, resolveKey) => {
	let changed = false;
	let output = content;

	output = output.replace(
		/throw\s+new\s+([A-Za-z_$][\w$]*)\s*\(\s*["'`]([^"'`]{10,})["'`]\s*\)/g,
		(full, errorType, rawText) => {
			const text = normalizeText(rawText);
			if (!looksLikeHardcodedText(text)) return full;
			changed = true;
			return `throw new ${errorType}(i18n.global.t("${resolveKey(text)}"))`;
		},
	);

	output = output.replace(
		/(alert|confirm)\s*\(\s*["'`]([^"'`]{5,})["'`]\s*\)/g,
		(full, fnName, rawText) => {
			const text = normalizeText(rawText);
			if (!looksLikeHardcodedText(text)) return full;
			changed = true;
			return `${fnName}(i18n.global.t("${resolveKey(text)}"))`;
		},
	);

	return { content: output, changed };
};

const walkTemplateAst = (node, onText, onAttr) => {
	if (!node) return;

	if (node.type === NodeTypes.TEXT) {
		onText(node);
		return;
	}

	if (node.type === NodeTypes.ELEMENT) {
		for (const prop of node.props || []) {
			onAttr(prop);
		}
		for (const child of node.children || []) {
			walkTemplateAst(child, onText, onAttr);
		}
		return;
	}

	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			walkTemplateAst(child, onText, onAttr);
		}
	}
};

const main = async () => {
	const [en, th] = await Promise.all([loadJson(EN_PATH), loadJson(TH_PATH)]);
	ensureAutoBucket(en);
	ensureAutoBucket(th);

	const valueToKey = buildExistingValueToKey(en.auto);

	const resolveKey = (text) => {
		const normalized = normalizeText(text);
		const existing = valueToKey.get(normalized);
		if (existing) return existing;

		const hashBase = `k_${fnv1a(normalized).toString(16)}`;
		let candidate = hashBase;
		let index = 1;
		while (Object.prototype.hasOwnProperty.call(en.auto, candidate)) {
			if (en.auto[candidate] === normalized) break;
			candidate = `${hashBase}_${index}`;
			index += 1;
		}

		en.auto[candidate] = normalized;
		th.auto[candidate] = normalized;
		const fullKey = `auto.${candidate}`;
		valueToKey.set(normalized, fullKey);
		return fullKey;
	};

	const vueFiles = await glob("src/**/*.vue", {
		cwd: ROOT,
		nodir: true,
	});

	let vueChanged = 0;
	let scriptChanged = 0;
	let totalReplacements = 0;

	for (const rel of vueFiles) {
		const abs = path.join(ROOT, rel);
		const original = await fs.readFile(abs, "utf8");
		let next = original;
		let fileChanged = false;

		const sfc = parseSfc(original, { filename: rel });
		const templateBlock = sfc.descriptor.template;

		if (templateBlock?.content) {
			const templateContent = templateBlock.content;
			const ast = parseTemplate(templateContent, { comments: true });
			const edits = [];

			walkTemplateAst(
				ast,
				(textNode) => {
					const raw = textNode.content ?? "";
					const normalized = normalizeText(raw);
					if (!looksLikeHardcodedText(normalized)) return;
					const key = resolveKey(normalized);
					const leading = raw.match(/^\s*/)?.[0] ?? "";
					const trailing = raw.match(/\s*$/)?.[0] ?? "";
					const replacement = `${leading}{{ $t("${key}") }}${trailing}`;

					edits.push({
						start: textNode.loc.start.offset,
						end: textNode.loc.end.offset,
						replacement,
					});
					totalReplacements += 1;
				},
				(prop) => {
					if (prop.type !== NodeTypes.ATTRIBUTE) return;
					if (!TARGET_ATTRS.has(prop.name)) return;
					if (!prop.value?.content) return;

					const normalized = normalizeText(prop.value.content);
					if (!looksLikeHardcodedText(normalized)) return;

					const key = resolveKey(normalized);
					const replacement = `:${prop.name}="$t('${key}')"`;
					edits.push({
						start: prop.loc.start.offset,
						end: prop.loc.end.offset,
						replacement,
					});
					totalReplacements += 1;
				},
			);

			if (edits.length > 0) {
				const replacedTemplate = applyEdits(templateContent, edits);
				const repaired = dedupeLeadingOpenTag(replacedTemplate);
				const templateStart = templateBlock.loc.start.offset;
				const templateEnd = templateBlock.loc.end.offset;
				next =
					next.slice(0, templateStart) +
					repaired.content +
					next.slice(templateEnd);
				fileChanged = true;
				vueChanged += 1;
			}
		}

		// Repair legacy escaped quotes from earlier runs.
		const escapedFixed = next.replace(/\$t\\\("([^"]+)"\\\)/g, "$t('$1')");
		if (escapedFixed !== next) {
			next = escapedFixed;
			fileChanged = true;
		}

		// Ensure duplicated leading opening tag in template is repaired.
		const reparsed = parseSfc(next, { filename: rel });
		const repairedTemplateBlock = reparsed.descriptor.template;
		if (repairedTemplateBlock?.content) {
			const repaired = dedupeLeadingOpenTag(repairedTemplateBlock.content);
			if (repaired.changed) {
				const start = repairedTemplateBlock.loc.start.offset;
				const end = repairedTemplateBlock.loc.end.offset;
				next = next.slice(0, start) + repaired.content + next.slice(end);
				fileChanged = true;
			}
		}

		const scriptPass = replaceScriptMessages(next, resolveKey);
		if (scriptPass.changed) {
			next = ensureI18nImportInVue(scriptPass.content);
			scriptChanged += 1;
			fileChanged = true;
		}

		if (fileChanged && next !== original) {
			await fs.writeFile(abs, next);
		}
	}

	const codeFiles = await glob("src/**/*.{js,ts}", {
		cwd: ROOT,
		nodir: true,
		ignore: ["src/i18n/**"],
	});

	for (const rel of codeFiles) {
		const abs = path.join(ROOT, rel);
		const original = await fs.readFile(abs, "utf8");
		const scriptPass = replaceScriptMessages(original, resolveKey);
		if (!scriptPass.changed) continue;
		const next = ensureI18nImportInModule(scriptPass.content);
		await fs.writeFile(abs, next);
		scriptChanged += 1;
	}

	await Promise.all([saveJson(EN_PATH, en), saveJson(TH_PATH, th)]);

	console.log("[codemod-i18n-hardcoded] Completed");
	console.log(`- Vue files updated: ${vueChanged}`);
	console.log(`- Script files updated: ${scriptChanged}`);
	console.log(`- Total template/attribute replacements: ${totalReplacements}`);
	console.log(`- Auto keys total: ${Object.keys(en.auto || {}).length}`);
};

main().catch((err) => {
	console.error("[codemod-i18n-hardcoded] Fatal:", err?.message || err);
	process.exit(1);
});
