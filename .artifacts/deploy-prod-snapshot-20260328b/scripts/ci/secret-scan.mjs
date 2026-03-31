#!/usr/bin/env node
/**
 * CI Guard: Prevent committed Stripe secrets.
 *
 * Scans git-tracked files (git ls-files) for common Stripe secret formats:
 * - sk_test_ / sk_live_ (secret API keys)
 * - rk_test_ / rk_live_ (restricted keys)
 * - whsec_ (webhook signing secret)
 *
 * Safety: Never prints the secret value (only file + line + rule name).
 */

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const MAX_FILE_BYTES = 2_000_000; // 2MB per file (keeps CI fast; secrets should not live in huge blobs)

const RULES = [
  { name: "stripe_secret_key", regex: /sk_(?:test|live)_[0-9A-Za-z]{10,}/ },
  { name: "stripe_restricted_key", regex: /rk_(?:test|live)_[0-9A-Za-z]{10,}/ },
  { name: "stripe_webhook_secret", regex: /whsec_[0-9A-Za-z]{10,}/ },
];

const getTrackedFiles = () => {
  const out = execSync("git ls-files -z", {
    stdio: ["ignore", "pipe", "ignore"],
  });
  return out
    .toString("utf8")
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
};

const isProbablyText = (buf) => !buf.includes(0);

const scanFile = (filePath) => {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return [];
  }

  if (!stat.isFile()) return [];
  if (stat.size > MAX_FILE_BYTES) return [];

  let buf;
  try {
    buf = readFileSync(filePath);
  } catch {
    return [];
  }

  if (!isProbablyText(buf)) return [];

  const text = buf.toString("utf8");
  if (!text) return [];

  // Fast precheck: avoid line splitting if nothing matches.
  const matchedRules = RULES.filter((r) => r.regex.test(text));
  if (matchedRules.length === 0) return [];

  const lines = text.split(/\r?\n/);
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of matchedRules) {
      if (rule.regex.test(line)) {
        findings.push({ filePath, line: i + 1, rule: rule.name });
      }
    }
  }

  return findings;
};

const main = () => {
  const files = getTrackedFiles();
  const findings = [];

  for (const filePath of files) {
    findings.push(...scanFile(filePath));
  }

  if (findings.length > 0) {
    console.error("❌ Secret scan failed: Stripe secret patterns found in tracked files.");
    console.error("   Remove the secret(s) from git history and rotate the key(s) immediately.");
    for (const f of findings.slice(0, 50)) {
      console.error(`- ${f.filePath}:${f.line} (${f.rule})`);
    }
    if (findings.length > 50) {
      console.error(`...and ${findings.length - 50} more finding(s).`);
    }
    process.exit(1);
  }

  console.log("✅ Secret scan passed: No Stripe secrets detected in tracked files.");
  process.exit(0);
};

main();

