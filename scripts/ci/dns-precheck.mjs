#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import dns from "node:dns/promises";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function resolveHost(hostname) {
  const [v4, v6] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);

  const ipv4 = v4.status === "fulfilled" ? v4.value : [];
  const ipv6 = v6.status === "fulfilled" ? v6.value : [];

  return {
    ipv4,
    ipv6,
    v4Error: v4.status === "rejected" ? String(v4.reason?.message || v4.reason) : null,
    v6Error: v6.status === "rejected" ? String(v6.reason?.message || v6.reason) : null,
  };
}

async function main() {
  const hostname = process.argv[2] || process.env.DNS_PRECHECK_HOST || "vibecity-api.fly.dev";
  const retries = toInt(process.env.DNS_PRECHECK_RETRIES, 4);
  const delayMs = toInt(process.env.DNS_PRECHECK_DELAY_MS, 2000);

  let lastResult = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    lastResult = await resolveHost(hostname);

    if (lastResult.ipv4.length > 0 || lastResult.ipv6.length > 0) {
      const lines = [
        "## DNS Precheck",
        "- Status: PASS",
        `- Host: ${hostname}`,
        `- Attempt: ${attempt}/${retries}`,
        `- IPv4: ${lastResult.ipv4.join(", ") || "none"}`,
        `- IPv6: ${lastResult.ipv6.join(", ") || "none"}`,
      ];
      console.log(lines.join("\n"));
      await writeSummary(lines);
      return;
    }

    if (attempt < retries) {
      await sleep(delayMs);
    }
  }

  const lines = [
    "## DNS Precheck",
    "- Status: FAIL",
    `- Host: ${hostname}`,
    `- Attempts: ${retries}`,
    `- Last IPv4 error: ${lastResult?.v4Error || "unknown"}`,
    `- Last IPv6 error: ${lastResult?.v6Error || "unknown"}`,
    "- Classification: INFRA (DNS resolution failure before API route checks)",
  ];

  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
}

main().catch(async (error) => {
  const lines = [
    "## DNS Precheck",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
    "- Classification: INFRA (precheck execution error)",
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
});
