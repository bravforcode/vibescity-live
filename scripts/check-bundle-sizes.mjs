#!/usr/bin/env node
/**
 * Bundle/asset budget guardrails (production safety).
 *
 * - Fails on obviously-wrong large static assets in `public/`
 * - Summarizes dist JS/CSS sizes (raw + gzip) after a build
 *
 * Configure via env:
 * - BUNDLE_DIST_DIR (default: dist)
 * - BUNDLE_PUBLIC_DIR (default: public)
 * - BUNDLE_BUDGET_PUBLIC_FILE_MB (default: 50)
 * - BUNDLE_BUDGET_JS_GZIP_KB (default: 800)
 * - BUNDLE_BUDGET_CSS_GZIP_KB (default: 200)
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const DIST_DIR = process.env.BUNDLE_DIST_DIR || "dist";
const PUBLIC_DIR = process.env.BUNDLE_PUBLIC_DIR || "public";

const MAX_PUBLIC_FILE_BYTES =
	Number(process.env.BUNDLE_BUDGET_PUBLIC_FILE_MB || 50) * 1024 * 1024;
const MAX_JS_GZIP_BYTES = Number(process.env.BUNDLE_BUDGET_JS_GZIP_KB || 800) * 1024;
const MAX_CSS_GZIP_BYTES = Number(process.env.BUNDLE_BUDGET_CSS_GZIP_KB || 200) * 1024;

const formatBytes = (bytes) => {
	if (!Number.isFinite(bytes)) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	let n = bytes;
	let i = 0;
	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i++;
	}
	return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const gzipSize = (buffer) => zlib.gzipSync(buffer, { level: 9 }).byteLength;

const walkFiles = async (dir) => {
	const out = [];
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkFiles(full)));
		} else if (entry.isFile()) {
			out.push(full);
		}
	}
	return out;
};

const sumSizes = async (files) => {
	let raw = 0;
	let gz = 0;
	for (const file of files) {
		const buf = await fs.readFile(file);
		raw += buf.byteLength;
		gz += gzipSize(buf);
	}
	return { raw, gz };
};

const rel = (p) => path.relative(process.cwd(), p).replaceAll("\\", "/");

const main = async () => {
	let failed = false;

	// 1) Guard against huge stray files in public/
	const publicPath = path.resolve(process.cwd(), PUBLIC_DIR);
	const publicFiles = (await walkFiles(publicPath)).filter((p) =>
		// Only enforce on real file types; ignore .map and small artifacts.
		!p.endsWith(".map"),
	);

	const hugePublic = [];
	for (const file of publicFiles) {
		const stat = await fs.stat(file);
		if (stat.size > MAX_PUBLIC_FILE_BYTES) {
			hugePublic.push({ file, size: stat.size });
		}
	}
	if (hugePublic.length) {
		failed = true;
		console.error(
			`Public asset budget exceeded (> ${formatBytes(MAX_PUBLIC_FILE_BYTES)}):`,
		);
		for (const item of hugePublic.sort((a, b) => b.size - a.size)) {
			console.error(`- ${rel(item.file)}: ${formatBytes(item.size)}`);
		}
	}

	// 2) Summarize dist sizes (if dist exists)
	const distPath = path.resolve(process.cwd(), DIST_DIR);
	const distExists = await fs
		.stat(distPath)
		.then((s) => s.isDirectory())
		.catch(() => false);

	if (!distExists) {
		console.log(`dist not found (${DIST_DIR}). Skipping bundle size summary.`);
		process.exit(failed ? 1 : 0);
	}

	const jsDir = path.join(distPath, "static", "js");
	const cssDir = path.join(distPath, "static", "css");

	const jsFiles = (await walkFiles(jsDir))
		.filter((p) => p.endsWith(".js"))
		.filter((p) => !p.endsWith(".LICENSE.txt"))
		.filter((p) => !p.includes(`${path.sep}async${path.sep}`));

	const cssFiles = (await walkFiles(cssDir))
		.filter((p) => p.endsWith(".css"))
		.filter((p) => !p.includes(`${path.sep}async${path.sep}`));

	const js = await sumSizes(jsFiles);
	const css = await sumSizes(cssFiles);

	console.log("Bundle size summary (raw / gzip):");
	console.log(`- JS:  ${formatBytes(js.raw)} / ${formatBytes(js.gz)}`);
	console.log(`- CSS: ${formatBytes(css.raw)} / ${formatBytes(css.gz)}`);

	if (js.gz > MAX_JS_GZIP_BYTES) {
		failed = true;
		console.error(
			`JS gzip budget exceeded: ${formatBytes(js.gz)} > ${formatBytes(MAX_JS_GZIP_BYTES)}`,
		);
	}
	if (css.gz > MAX_CSS_GZIP_BYTES) {
		failed = true;
		console.error(
			`CSS gzip budget exceeded: ${formatBytes(css.gz)} > ${formatBytes(MAX_CSS_GZIP_BYTES)}`,
		);
	}

	process.exit(failed ? 1 : 0);
};

main().catch((err) => {
	console.error("bundle size check failed:", err?.message || err);
	process.exit(1);
});

