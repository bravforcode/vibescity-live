#!/usr/bin/env node

import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";

const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

async function appendSummary(lines) {
  if (!STEP_SUMMARY) return;
  await appendFile(STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function toIso(date) {
  return date.toISOString();
}

function getParentDir(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "." : path.slice(0, idx) || ".";
}

async function fetchCount(adminClient, fromIso, toIso, action) {
  let query = adminClient
    .from("pii_audit_access_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  if (action) query = query.eq("action", action);

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function fetchLogsPaged(adminClient, fromIso, toIso, maxRows) {
  const pageSize = 1000;
  const pages = Math.ceil(maxRows / pageSize);
  const out = [];

  for (let page = 0; page < pages; page += 1) {
    const offset = page * pageSize;
    const { data, error } = await adminClient
      .from("pii_audit_access_log")
      .select("actor_user_id,action,created_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize || out.length >= maxRows) break;
  }

  return out.slice(0, maxRows);
}

function buildActorStats(rows) {
  const byActor = new Map();

  for (const row of rows) {
    const actor = typeof row.actor_user_id === "string" ? row.actor_user_id : "";
    if (!actor) continue;

    const action = typeof row.action === "string" ? row.action : "";
    const createdAt = typeof row.created_at === "string" ? row.created_at : "";

    const current = byActor.get(actor) || {
      actor_user_id: actor,
      views: 0,
      exports: 0,
      actions: 0,
      last_seen_at: createdAt,
    };

    current.actions += 1;
    if (action === "view") current.views += 1;
    if (action === "export") current.exports += 1;
    if (createdAt && (!current.last_seen_at || createdAt > current.last_seen_at)) {
      current.last_seen_at = createdAt;
    }

    byActor.set(actor, current);
  }

  const topActors = [...byActor.values()]
    .sort((a, b) => b.actions - a.actions)
    .slice(0, 10);

  return { byActor, topActors };
}

async function main() {
  const outputPath =
    process.env.PII_ACCESS_ALERT_OUTPUT_PATH ||
    "reports/ci/pii-access-anomaly-log.json";

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    await appendSummary([
      "## PII Access Anomaly Check",
      "- Status: SKIP",
      "- Reason: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    ]);
    return;
  }

  if (!toBool(process.env.PII_ACCESS_ALERT_ENABLED, true)) {
    await appendSummary([
      "## PII Access Anomaly Check",
      "- Status: SKIP",
      "- Reason: PII_ACCESS_ALERT_ENABLED is false",
    ]);
    return;
  }

  const windowMinutes = toInt(process.env.PII_ACCESS_ALERT_WINDOW_MINUTES, 60);
  const totalThreshold = toInt(process.env.PII_ACCESS_ALERT_TOTAL_THRESHOLD, 50);
  const exportThreshold = toInt(
    process.env.PII_ACCESS_ALERT_EXPORT_THRESHOLD,
    10,
  );
  const perActorThreshold = toInt(
    process.env.PII_ACCESS_ALERT_PER_ACTOR_THRESHOLD,
    25,
  );
  const maxRows = toInt(process.env.PII_ACCESS_ALERT_MAX_ROWS, 5000);

  const now = new Date();
  const from = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const fromIso = toIso(from);
  const toIsoValue = toIso(now);

  const adminClient = createClient(supabaseUrl, serviceKey);

  const totalCount = await fetchCount(adminClient, fromIso, toIsoValue, "");
  const exportCount = await fetchCount(adminClient, fromIso, toIsoValue, "export");
  const rows = await fetchLogsPaged(adminClient, fromIso, toIsoValue, maxRows);
  const truncated = rows.length >= maxRows;
  const { topActors } = buildActorStats(rows);

  const perActorBreaches = topActors.filter(
    (actor) => actor.actions >= perActorThreshold,
  );

  const reasons = [];
  if (totalCount >= totalThreshold) {
    reasons.push(`total_actions=${totalCount} >= ${totalThreshold}`);
  }
  if (exportCount >= exportThreshold) {
    reasons.push(`exports=${exportCount} >= ${exportThreshold}`);
  }
  if (perActorBreaches.length > 0) {
    reasons.push(
      `top_actor_actions>=${perActorThreshold} (${perActorBreaches
        .map((actor) => `${actor.actor_user_id}:${actor.actions}`)
        .join(", ")})`,
    );
  }

  const alert = reasons.length > 0;

  const payload = {
    generated_at: new Date().toISOString(),
    window_minutes: windowMinutes,
    range: { from: fromIso, to: toIsoValue },
    thresholds: {
      total_actions: totalThreshold,
      exports: exportThreshold,
      per_actor_actions: perActorThreshold,
      max_rows: maxRows,
    },
    counts: {
      total_actions: totalCount,
      exports: exportCount,
    },
    truncated,
    top_actors: topActors,
    alert,
    reasons,
  };

  await mkdir(getParentDir(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2));

  const lines = [
    "## PII Access Anomaly Check",
    `- Window: ${windowMinutes} minutes`,
    `- Total actions: ${totalCount} (threshold ${totalThreshold})`,
    `- Exports: ${exportCount} (threshold ${exportThreshold})`,
    `- Truncated: ${truncated ? "yes" : "no"}`,
    `- Alert: ${alert ? "yes" : "no"}`,
  ];
  if (reasons.length > 0) {
    lines.push("- Reasons:");
    lines.push(...reasons.map((reason) => `  - ${reason}`));
  }
  await appendSummary(lines);

  if (process.env.GITHUB_OUTPUT) {
    const outputLines = [
      `alert=${alert}`,
      `alert_text=${alert ? `PII access spike: ${reasons.join("; ")}` : ""}`,
    ];
    await appendFile(process.env.GITHUB_OUTPUT, `${outputLines.join("\n")}\n`);
  }
}

main().catch(async (error) => {
  const lines = [
    "## PII Access Anomaly Check",
    "- Status: FAIL",
    `- Error: ${error?.message || error}`,
  ];
  console.error(lines.join("\n"));
  await appendSummary(lines);
  process.exit(1);
});
