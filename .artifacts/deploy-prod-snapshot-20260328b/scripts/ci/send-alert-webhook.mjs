#!/usr/bin/env node

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

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

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  if (idx === -1) return ".";
  return path.slice(0, idx) || ".";
}

async function readDedupState(path) {
  if (!existsSync(path)) {
    return {};
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed;
}

async function writeDedupState(path, state) {
  await mkdir(getParentDir(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2));
}

async function postWithRetry(url, payload, retries, delayMs, timeoutMs) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
      }

      return { ok: true, attempt };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) {
        await sleep(delayMs * attempt);
      }
    }
  }

  return { ok: false, error: lastError };
}

async function main() {
  const url = process.env.SYNTHETIC_ALERT_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL || "";
  const type = process.env.ALERT_TYPE || "generic_alert";
  const text = process.env.ALERT_TEXT || "Synthetic alert";
  const lane = process.env.ALERT_LANE || "unknown";
  const runUrl = process.env.ALERT_RUN_URL || process.env.RUN_URL || "";
  const target = process.env.ALERT_TARGET || "";
  const host = process.env.ALERT_HOST || "";

  const retries = toInt(process.env.ALERT_MAX_RETRIES, 3);
  const delayMs = toInt(process.env.ALERT_RETRY_DELAY_MS, 2000);
  const timeoutMs = toInt(process.env.ALERT_TIMEOUT_MS, 10000);
  const dedupWindowMinutes = toInt(process.env.ALERT_DEDUP_WINDOW_MINUTES, 0);
  const dedupFile = process.env.ALERT_DEDUP_FILE || ".tmp/alert-dedup-state.json";
  const dedupKey =
    process.env.ALERT_DEDUP_KEY ||
    [type, lane, target || host || "none"].join("::");

  if (!url) {
    const lines = [
      "## Alert Dispatch",
      "- Status: SKIP",
      "- Reason: webhook URL is not configured",
      `- Type: ${type}`,
      `- Lane: ${lane}`,
    ];
    console.log(lines.join("\n"));
    await writeSummary(lines);
    return;
  }

  if (dedupWindowMinutes > 0) {
    const state = await readDedupState(dedupFile);
    const now = Date.now();
    const prevTs = Number(state[dedupKey] || 0);
    const windowMs = dedupWindowMinutes * 60 * 1000;

    if (Number.isFinite(prevTs) && prevTs > 0 && now - prevTs < windowMs) {
      const remainingMs = windowMs - (now - prevTs);
      const lines = [
        "## Alert Dispatch",
        "- Status: SKIP",
        "- Reason: deduplicated within configured window",
        `- Type: ${type}`,
        `- Lane: ${lane}`,
        `- Dedup key: ${dedupKey}`,
        `- Retry after: ${Math.ceil(remainingMs / 1000)}s`,
      ];
      console.log(lines.join("\n"));
      await writeSummary(lines);
      return;
    }
  }

  const payload = {
    text,
    type,
    lane,
    run_url: runUrl,
    target,
    host,
    timestamp: new Date().toISOString(),
  };

  const result = await postWithRetry(url, payload, retries, delayMs, timeoutMs);

  if (result.ok) {
    const lines = [
      "## Alert Dispatch",
      "- Status: PASS",
      `- Type: ${type}`,
      `- Lane: ${lane}`,
      `- Attempt: ${result.attempt}/${retries}`,
    ];
    console.log(lines.join("\n"));
    await writeSummary(lines);
    if (dedupWindowMinutes > 0) {
      const state = await readDedupState(dedupFile);
      state[dedupKey] = Date.now();
      await writeDedupState(dedupFile, state);
    }
    return;
  }

  const lines = [
    "## Alert Dispatch",
    "- Status: FAIL",
    `- Type: ${type}`,
    `- Lane: ${lane}`,
    `- Retries: ${retries}`,
    `- Error: ${result.error?.message || result.error || "unknown"}`,
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
}

main().catch(async (error) => {
  const lines = [
    "## Alert Dispatch",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await writeSummary(lines);
  process.exit(1);
});
