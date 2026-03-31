#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_FILES = [
	".env",
	".env.local",
	".env.e2e",
	".env.example",
	".env.production",
	".env.production.local",
];

const SAFE_NAME_PATTERNS = [
	/^VITE_API_URL$/,
	/^VITE_WS_URL$/,
	/^VITE_E2E$/,
	/^VITE_ADMIN_EMAIL_ALLOWLIST$/,
	/^VITE_ENABLE_[A-Z0-9_]+$/,
	/^VITE_VIBE_[A-Z0-9_]+$/,
	/^VITE_PII_AUDIT_[A-Z0-9_]+$/,
	/^VITE_SUPABASE_(URL|ANON_KEY|EDGE_URL)$/,
	/^VITE_MAPBOX_TOKEN$/,
	/^VITE_MAP_STYLE(_FALLBACK)?_URL$/,
	/^VITE_GOOGLE_(PLACES_API_KEY|SHEET_URL_[A-Z0-9_]+)$/,
	/^VITE_YOUTUBE_API_KEY$/,
	/^VITE_CLARITY_PROJECT_ID$/,
	/^VITE_SENTRY_[A-Z0-9_]+$/,
];

const DANGEROUS_NAME_PATTERN =
	/(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|JWT|WEBHOOK|ACCESS_TOKEN)/i;
const DANGEROUS_VALUE_PATTERNS = [
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
	/\bsb_secret_[A-Za-z0-9_-]+\b/,
	/\bservice_role\b/i,
	/\bsk_(live|test)_[A-Za-z0-9]+\b/,
];

const stripWrappingQuotes = (value) => {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

const failures = [];

for (const envFile of ENV_FILES) {
	const filePath = path.join(ROOT, envFile);
	if (!fs.existsSync(filePath)) {
		continue;
	}

	const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
	for (const [index, rawLine] of lines.entries()) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}

		const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
		if (!match) {
			continue;
		}

		const [, key, rawValue] = match;
		if (!key.startsWith("VITE_")) {
			continue;
		}

		const value = stripWrappingQuotes(rawValue);
		const isSafeName = SAFE_NAME_PATTERNS.some((pattern) => pattern.test(key));
		if (!isSafeName && DANGEROUS_NAME_PATTERN.test(key)) {
			failures.push(
				`${envFile}:${index + 1} exposes suspicious public env name ${key}`,
			);
		}

		for (const pattern of DANGEROUS_VALUE_PATTERNS) {
			if (pattern.test(value)) {
				failures.push(
					`${envFile}:${index + 1} exposes a server-side secret shape in ${key}`,
				);
				break;
			}
		}
	}
}

if (failures.length > 0) {
	console.error("VITE public secret scan failed.\n");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	process.exit(1);
}

console.log("VITE public secret scan passed.");
