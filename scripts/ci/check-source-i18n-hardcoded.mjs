#!/usr/bin/env node
/**
 * Comprehensive i18n hardcoded string detector
 * - Recursive scan of src/**\/*.{vue,js,ts}
 * - Smart heuristics: exclude t() calls, comments, interpolations
 * - Output: JSON report + summary
 * - Fail: STRICT mode if violations > MAX_HARDCODED
 */

import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { NodeTypes, parse as parseTemplate } from "@vue/compiler-dom";

const ROOT = process.cwd();
const STRICT = String(process.env.I18N_STRICT || "false").toLowerCase() === "true";
const MAX_HARDCODED = Number(process.env.I18N_HARDCODED_MAX || 0);
const OUTPUT_JSON = process.env.I18N_JSON_OUTPUT || "";
const VERBOSE = String(process.env.I18N_VERBOSE || "false").toLowerCase() === "true";

// Patterns to IGNORE (safe strings)
const IGNORE_PATTERNS = [
	/^(true|false|null|undefined)$/i,
	/^[\d\s.,:;!?()[\]{}\-+/*"'`~|\\]+$/, // numbers, punctuation only
	/^#[0-9a-f]{3,6}$/i, // colors
	/^data:/, // data URIs
	/^[a-z][a-z0-9+.-]*:\/\//i, // any URI scheme, e.g. chrome://
	/^\//, // paths/URLs
	/^https?:/, // URLs
	/^@/, // decorators, scoped slots
];

const SAFE_PREFIXES = [
	"v-", // Vue directives
	":", // Vue bindings
	".", // class binding shorthand
];

/**
 * Extract Vue template content
 */
const extractVueTemplate = (content) => {
	const match = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
	return match?.[1] || "";
};

/**
 * Extract Vue script content
 */
const extractVueScript = (content) => {
	const match = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
	return match?.[1] || "";
};

/**
 * Normalize whitespace
 */
const normalizeText = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.replace(/&nbsp;/g, " ")
		.trim();

/**
 * Check if text looks like a hardcoded user-facing string
 */
const looksLikeHardcodedText = (text) => {
	if (!text || text.length < 2) return false;

	// Must contain letters (Latin or Thai)
	if (!/[A-Za-z\u0E00-\u0E7F]/.test(text)) return false;

	// Ignore patterns
	for (const pattern of IGNORE_PATTERNS) {
		if (pattern.test(text)) return false;
	}

	// Skip if looks like code (camelCase, snake_case, CONSTANT_CASE)
	if (/^[a-zA-Z0-9_$]+$/.test(text)) return false;
	// Skip machine slugs / event ids, e.g. coin-lottie-player-missing
	if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(text)) return false;

	return true;
};

const looksLikeExpression = (value) => {
	if (!value) return false;
	if (value.includes("${")) return true;
	if (/[?].+[:]/.test(value)) return true;
	if (/\b[a-zA-Z_$][\w$]*\s*\(/.test(value)) return true;
	if (/\|\|/.test(value)) return true;
	return false;
};

/**
 * Extract potential hardcoded strings from Vue template
 * Looks for: >text< (between tags), but excludes {{ }} and v-directives
 */
const extractTemplateStrings = (template) => {
	const findings = [];
	const attrNames = new Set([
		"title",
		"placeholder",
		"alt",
		"aria-label",
		"data-test",
	]);

	let ast;
	try {
		ast = parseTemplate(template, {
			comments: false,
			onError: () => {},
		});
	} catch {
		return findings;
	}

	const walk = (node) => {
		if (!node) return;

		if (node.type === NodeTypes.TEXT) {
			const text = normalizeText(node.content);
			if (looksLikeHardcodedText(text)) {
				findings.push({
					type: "template_literal",
					text: text.slice(0, 150),
					length: text.length,
				});
			}
			return;
		}

		if (node.type === NodeTypes.ELEMENT) {
			for (const prop of node.props || []) {
				if (prop.type !== NodeTypes.ATTRIBUTE) continue;
				if (!attrNames.has(prop.name)) continue;
				if (!prop.value?.content) continue;

				const value = normalizeText(prop.value.content);
				if (value.startsWith("$t(") || value.startsWith("t(")) continue;
				if (looksLikeExpression(value)) continue;

				if (looksLikeHardcodedText(value)) {
					findings.push({
						type: `attribute_${prop.name}`,
						text: value.slice(0, 150),
						length: value.length,
					});
				}
			}

			for (const child of node.children || []) {
				walk(child);
			}
			return;
		}

		if (Array.isArray(node.children)) {
			for (const child of node.children) {
				walk(child);
			}
		}
	};

	walk(ast);

	return findings;
};

/**
 * Extract potential hardcoded strings from JS/TS script
 * Look for console.log, error messages, not i18n keys
 */
const extractScriptStrings = (script) => {
	const findings = [];

	// Pattern: t('key') or i18n('key') → SAFE (skip)
	// Pattern: "hardcoded" in console.log('hardcoded') → RISKY
	// For now, we focus on common patterns like:
	// - throw new Error("message")
	// - console.log("message") without t()
	// - return "message" statements

	// Error messages (should be localized)
	const errorRegex = /throw\s+new\s+\w+\s*\(\s*["'`]([^"'`]{10,})["'`]/g;
	let match;

	while ((match = errorRegex.exec(script))) {
		const msg = normalizeText(match[1]);
		if (looksLikeHardcodedText(msg)) {
			findings.push({
				type: "error_message",
				text: msg.slice(0, 150),
				length: msg.length,
			});
		}
	}

	// Alert/confirm (should use i18n)
	const alertRegex = /(alert|confirm)\s*\(\s*["'`]([^"'`]{5,})["'`]/g;

	while ((match = alertRegex.exec(script))) {
		const msg = normalizeText(match[2]);
		if (looksLikeHardcodedText(msg)) {
			findings.push({
				type: `${match[1]}_message`,
				text: msg.slice(0, 150),
				length: msg.length,
			});
		}
	}

	return findings;
};

/**
 * Process single file
 */
const scanFile = async (filePath) => {
	const relativePath = path.relative(ROOT, filePath);

	try {
		const content = await fs.readFile(filePath, "utf8");

		const findings = {
			file: relativePath,
			template: [],
			script: [],
		};

		// Vue files: scan both template and script
		if (filePath.endsWith(".vue")) {
			const template = extractVueTemplate(content);
			if (template) {
				findings.template = extractTemplateStrings(template);
			}

			const script = extractVueScript(content);
			if (script) {
				findings.script = extractScriptStrings(script);
			}
		}

		// JS/TS files: scan for script patterns
		if (filePath.endsWith(".js") || filePath.endsWith(".ts")) {
			findings.script = extractScriptStrings(content);
		}

		// Return only if has findings
		const total = findings.template.length + findings.script.length;
		if (total > 0) {
			return { ...findings, total };
		}
	} catch (err) {
		console.error(`[source-i18n] Error reading ${relativePath}:`, err.message);
	}

	return null;
};

/**
 * Main execution
 */
const main = async () => {
	const patterns = ["src/**/*.vue", "src/**/*.js", "src/**/*.ts"];

	const allFiles = (
		await Promise.all(patterns.map((p) => glob(p, { cwd: ROOT })))
	).flat();

	// Exclude test files, old files, index files
	const sourceFiles = allFiles.filter(
		(f) =>
			!f.includes(".spec.") &&
			!f.includes(".test.") &&
			!f.includes("_old") &&
			!f.includes("/i18n/") && // Exclude i18n config folder
			!f.endsWith("i18n.js"),
	);

	if (VERBOSE) {
		console.log(`[source-i18n] Scanning ${sourceFiles.length} files...`);
	}

	const results = [];

	for (const filePath of sourceFiles) {
		const result = await scanFile(path.join(ROOT, filePath));
		if (result) {
			results.push(result);
		}
	}

	// Aggregate findings
	const templateTotal = results.reduce((sum, r) => sum + r.template.length, 0);
	const scriptTotal = results.reduce((sum, r) => sum + r.script.length, 0);
	const totalViolations = templateTotal + scriptTotal;

	// Output: Summary
	console.log("");
	console.log("[source-i18n] REPORT");
	console.log("=".repeat(60));
	console.log(`Total violations: ${totalViolations}`);
	console.log(`  Template literals: ${templateTotal}`);
	console.log(`  Script messages: ${scriptTotal}`);
	console.log(`  Files affected: ${results.length}`);
	console.log("");

	// Output: Detailed findings
	if (results.length > 0) {
		for (const res of results) {
			console.log(`📄 ${res.file} (${res.total})`);

			if (res.template.length > 0) {
				console.log(`   Template (${res.template.length}):`);
				for (const item of res.template.slice(0, 3)) {
					console.log(`     • [${item.type}] "${item.text}"`);
				}
				if (res.template.length > 3) {
					console.log(`     ... and ${res.template.length - 3} more`);
				}
			}

			if (res.script.length > 0) {
				console.log(`   Script (${res.script.length}):`);
				for (const item of res.script.slice(0, 3)) {
					console.log(`     • [${item.type}] "${item.text}"`);
				}
				if (res.script.length > 3) {
					console.log(`     ... and ${res.script.length - 3} more`);
				}
			}
		}
	}

	// Output: JSON report
	if (OUTPUT_JSON) {
		const report = {
			timestamp: new Date().toISOString(),
			totalViolations,
			breakdown: {
				template: templateTotal,
				script: scriptTotal,
			},
			filesAffected: results.length,
			details: results,
		};

		await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2));
		console.log(`\n📊 JSON report: ${OUTPUT_JSON}`);
	}

	// STRICT mode: fail if > threshold
	if (STRICT && totalViolations > MAX_HARDCODED) {
		console.error("");
		console.error(`❌ STRICT FAIL: ${totalViolations} violations > ${MAX_HARDCODED} max`);
		console.error("   Run: I18N_JSON_OUTPUT=report.json I18N_VERBOSE=true node scripts/ci/check-source-i18n-hardcoded.mjs");
		console.error("   Then wrap remaining strings with: t('namespace.key')");
		process.exit(1);
	} else if (totalViolations > 0) {
		console.log(
			`ℹ️  To enable STRICT mode: I18N_STRICT=true I18N_HARDCODED_MAX=0 npm run ci:source-i18n`,
		);
	}

	process.exit(totalViolations > 0 && STRICT ? 1 : 0);
};

main().catch((err) => {
	console.error("[source-i18n] Fatal error:", err?.message || err);
	process.exit(1);
});
