#!/usr/bin/env node
/**
 * Thai Locale Edge Case Checker
 * bun run i18n:validate-thai
 *
 * Checks:
 * - Key coverage: missing keys in th.json vs en.json, extra keys in th.json
 * - Thai numerals: values should use Arabic (0-9) not Thai (๐-๙)
 * - Currency: ฿ symbol should be used (not THB or $ in Thai strings)
 * - Text length ratio: Thai length should be 30%-300% of English (warns outside)
 * - Unicode normalization: all Thai strings should be NFC-normalized
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const EN_PATH = path.join(ROOT, "src/locales/en.json");
const TH_PATH = path.join(ROOT, "src/locales/th.json");
const REPORT_PATH = path.join(ROOT, "reports/ci/thai-locale.json");

const checks = [];
const add = (ok, name, detail = "") => checks.push({ ok, name, detail });

// Flatten nested JSON to dot-notation paths
function flattenKeys(obj, prefix = "") {
	const result = {};
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === "object" && !Array.isArray(v)) {
			Object.assign(result, flattenKeys(v, key));
		} else {
			result[key] = String(v ?? "");
		}
	}
	return result;
}

// Thai numeral codepoints: ๐ (0x0E50) through ๙ (0x0E59)
const THAI_NUMERAL_RE = /[\u0E50-\u0E59]/;

// Western currency in Thai context (should use ฿ instead)
const WESTERN_CURRENCY_RE = /\bTHB\b|\$\d|\bUSD\b/;
const THAI_BAHT_SYMBOL = "\u0E3F"; // ฿

const main = async () => {
	const enRaw = await fs.readFile(EN_PATH, "utf8").catch(() => null);
	const thRaw = await fs.readFile(TH_PATH, "utf8").catch(() => null);

	if (!enRaw) {
		console.error("ERROR: src/locales/en.json not found");
		process.exit(1);
	}
	if (!thRaw) {
		console.error("ERROR: src/locales/th.json not found");
		process.exit(1);
	}

	const en = flattenKeys(JSON.parse(enRaw));
	const th = flattenKeys(JSON.parse(thRaw));

	const enKeys = new Set(Object.keys(en));
	const thKeys = new Set(Object.keys(th));

	// 1. Key coverage
	const missingInThai = [...enKeys].filter((k) => !thKeys.has(k));
	const extraInThai = [...thKeys].filter((k) => !enKeys.has(k));

	add(
		missingInThai.length === 0,
		"thai.keys.complete",
		missingInThai.length > 0
			? `${missingInThai.length} keys missing in th.json: ${missingInThai.slice(0, 5).join(", ")}${missingInThai.length > 5 ? ` +${missingInThai.length - 5} more` : ""}`
			: "All en.json keys present in th.json",
	);

	add(
		extraInThai.length === 0,
		"thai.keys.no-extra",
		extraInThai.length > 0
			? `${extraInThai.length} extra keys in th.json not in en.json: ${extraInThai.slice(0, 5).join(", ")}`
			: "No extra keys in th.json",
	);

	// 2. Thai numeral check (should use Arabic numerals for consistency)
	const thaiNumeralKeys = Object.entries(th)
		.filter(([, v]) => THAI_NUMERAL_RE.test(v))
		.map(([k]) => k);

	add(
		thaiNumeralKeys.length === 0,
		"thai.numerals.arabic-only",
		thaiNumeralKeys.length > 0
			? `${thaiNumeralKeys.length} values contain Thai numerals ๐-๙: ${thaiNumeralKeys.slice(0, 5).join(", ")}`
			: "All values use Arabic numerals (consistent with UX standard)",
	);

	// 3. Currency symbol check: Thai strings with western currency (THB/USD/$) should use ฿
	const currencyViolations = Object.entries(th)
		.filter(([, v]) => WESTERN_CURRENCY_RE.test(v) && !v.includes(THAI_BAHT_SYMBOL))
		.map(([k]) => k);

	add(
		currencyViolations.length === 0,
		"thai.currency.baht-symbol",
		currencyViolations.length > 0
			? `${currencyViolations.length} values use THB/$ instead of ฿: ${currencyViolations.slice(0, 5).join(", ")}`
			: "Currency correctly uses ฿ symbol in Thai strings",
	);

	// 4. Text length ratio (Thai tends to be concise)
	const ratioViolations = [];
	for (const key of enKeys) {
		if (!thKeys.has(key)) continue;
		const enLen = en[key].length;
		const thLen = th[key].length;
		if (enLen < 3) continue; // skip very short strings
		const ratio = thLen / enLen;
		if (ratio < 0.3 || ratio > 3.0) {
			ratioViolations.push({
				key,
				enLen,
				thLen,
				ratio: Math.round(ratio * 100) / 100,
			});
		}
	}

	const sharedKeyCount = [...enKeys].filter((k) => thKeys.has(k)).length;
	add(
		ratioViolations.length < sharedKeyCount * 0.05,
		"thai.length-ratio",
		`${ratioViolations.length}/${sharedKeyCount} values outside 30%-300% length ratio (threshold: <5% of keys)`,
	);

	// 5. NFC normalization (Thai combining characters can cause display issues if not normalized)
	const nfcViolations = Object.entries(th)
		.filter(([, v]) => v !== v.normalize("NFC"))
		.map(([k]) => k);

	add(
		nfcViolations.length === 0,
		"thai.encoding.nfc-normalized",
		nfcViolations.length > 0
			? `${nfcViolations.length} values not NFC-normalized: ${nfcViolations.slice(0, 3).join(", ")}`
			: "All Thai strings are NFC-normalized",
	);

	// Print summary
	const coveragePct = Math.round((thKeys.size / enKeys.size) * 100);
	console.log(
		`\ni18n coverage: ${thKeys.size}/${enKeys.size} keys (${coveragePct}%)\n`,
	);

	for (const row of checks) {
		console.log(
			`${row.ok ? "PASS" : "FAIL"} ${row.name}${row.detail ? ` :: ${row.detail}` : ""}`,
		);
	}

	if (missingInThai.length) {
		const show = missingInThai.slice(0, 20);
		console.log(`\nMissing in th.json (first ${show.length}):`);
		show.forEach((k) => console.log(`  - ${k}`));
		if (missingInThai.length > 20)
			console.log(`  ... and ${missingInThai.length - 20} more`);
	}

	// Write report
	await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
	await fs.writeFile(
		REPORT_PATH,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				coverage: {
					en: enKeys.size,
					th: thKeys.size,
					percent: coveragePct,
				},
				missingInThai: missingInThai.slice(0, 200),
				extraInThai,
				thaiNumeralKeys,
				currencyViolations,
				ratioViolations: ratioViolations.slice(0, 50),
				nfcViolations,
			},
			null,
			2,
		),
	);
	console.log(`\nReport: reports/ci/thai-locale.json`);

	const failed = checks.filter((r) => !r.ok);
	if (failed.length) process.exit(1);
};

main().catch((err) => {
	console.error("[validate-thai-locale] Failed:", err?.message || err);
	process.exit(1);
});
