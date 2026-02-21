#!/usr/bin/env node

import { appendFile } from "node:fs/promises";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value, fallback) {
  const source = String(value ?? fallback ?? "");
  return source
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateHttpsUrl(raw) {
  if (!raw) {
    throw new Error(
      "SYNTHETIC_MAP_BASE_URL is required and must point to the deployed map app.",
    );
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `SYNTHETIC_MAP_BASE_URL must use https protocol. Got: ${parsed.protocol}`,
    );
  }

  return parsed.toString();
}

async function writeSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function fetchWithRedirects(startUrl, maxRedirects, timeoutMs) {
  const chain = [];
  let current = startUrl;
  let response = null;

  for (let i = 0; i <= maxRedirects; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    const location = response.headers.get("location");
    chain.push({ url: current, status, location: location || null });

    if (status >= 300 && status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }

    return { chain, finalUrl: current, response };
  }

  throw new Error(
    `Too many redirects (${maxRedirects}). Last URL: ${current}`,
  );
}

function validateHtmlSignature(html, mustContain, forbidTokens) {
  const missing = mustContain.filter((token) => !html.includes(token));
  if (missing.length > 0) {
    throw new Error(
      `Target page is missing required app markers: ${missing.join(", ")}`,
    );
  }

  const lower = html.toLowerCase();
  const forbidden = forbidTokens.filter((token) =>
    lower.includes(token.toLowerCase()),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Target page contains forbidden markers: ${forbidden.join(", ")}`,
    );
  }
}

async function main() {
  const rawTarget = process.env.SYNTHETIC_MAP_BASE_URL || process.argv[2];
  const target = validateHttpsUrl(rawTarget);
  const maxRedirects = toInt(process.env.SYNTHETIC_TARGET_MAX_REDIRECTS, 8);
  const timeoutMs = toInt(process.env.SYNTHETIC_TARGET_TIMEOUT_MS, 15000);
  const mustContain = parseList(
    process.env.SYNTHETIC_TARGET_MUST_CONTAIN,
    '<div id="app"',
  );
  const forbidTokens = parseList(process.env.SYNTHETIC_TARGET_FORBID, "");

  const { chain, finalUrl, response } = await fetchWithRedirects(
    target,
    maxRedirects,
    timeoutMs,
  );

  if (!response) {
    throw new Error("No HTTP response received from synthetic target.");
  }

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} returned by ${finalUrl}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(
      `Expected text/html content type, got "${contentType || "unknown"}"`,
    );
  }

  const html = await response.text();
  validateHtmlSignature(html, mustContain, forbidTokens);

  const lines = [
    "## Synthetic Target Validation",
    "- Status: PASS",
    `- Start URL: ${target}`,
    `- Final URL: ${finalUrl}`,
    `- Redirect hops: ${Math.max(chain.length - 1, 0)}`,
    `- Required markers: ${mustContain.join(", ")}`,
  ];

  console.log(lines.join("\n"));
  await writeSummary(lines);
}

main().catch(async (error) => {
  const lines = [
    "## Synthetic Target Validation",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
});
