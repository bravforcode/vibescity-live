import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

export const DEFAULT_CONFIG_PATH = ".agent/config/autonomy.json";
export const REPORTS_DIR = "reports/agents";
export const RISK_LEVELS = ["low", "medium", "high", "critical"];
const INITIAL_ENV_KEYS = new Set(Object.keys(process.env));
const LOADED_ENV_ROOTS = new Set();

export function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

export function unique(values) {
  return [...new Set(asArray(values).map((value) => String(value)).filter(Boolean))];
}

export function toPosixPath(filePath) {
  return String(filePath).replace(/\\/g, "/");
}

export function toRepoRelative(root, filePath) {
  return toPosixPath(path.relative(root, path.resolve(root, filePath)));
}

export function slugify(value) {
  const normalized = String(value || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || "event";
}

export function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function createStableEventId(seed) {
  return `${slugify(seed).slice(0, 40)}-${hashValue(seed).slice(0, 10)}`;
}

export async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath, data) {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeText(filePath, text) {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, text, "utf8");
}

export async function readTextIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export function parseJsonLoose(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const fencedMatch = text.match(/```json\s*([\s\S]+?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch {}
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }

  return null;
}

export async function readJsonIfExists(filePath) {
  const text = await readTextIfExists(filePath);
  if (!text) return null;
  return parseJsonLoose(text);
}

export function loadRuntimeEnv(root = process.cwd()) {
  const resolvedRoot = path.resolve(root);
  if (LOADED_ENV_ROOTS.has(resolvedRoot)) return;

  const envPath = path.join(resolvedRoot, ".env");
  if (existsSync(envPath)) {
    const parsed = dotenv.parse(readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  const localEnvPath = path.join(resolvedRoot, ".env.local");
  if (existsSync(localEnvPath)) {
    const parsed = dotenv.parse(readFileSync(localEnvPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (INITIAL_ENV_KEYS.has(key)) continue;
      process.env[key] = value;
    }
  }

  LOADED_ENV_ROOTS.add(resolvedRoot);
}

export async function loadAutonomyConfig(root = process.cwd()) {
  loadRuntimeEnv(root);
  const configPath = path.join(root, DEFAULT_CONFIG_PATH);
  const config = await readJsonIfExists(configPath);
  if (!config) {
    throw new Error(`Missing autonomy config: ${configPath}`);
  }
  return config;
}

export function globToRegExp(glob) {
  const normalized = toPosixPath(glob);
  const placeholders = {
    doubleStar: "__DOUBLE_STAR__",
    singleStar: "__SINGLE_STAR__",
    question: "__QUESTION__",
  };

  const staged = normalized
    .replace(/\*\*/g, placeholders.doubleStar)
    .replace(/\*/g, placeholders.singleStar)
    .replace(/\?/g, placeholders.question);

  const escaped = staged.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  return new RegExp(
    `^${escaped
      .replaceAll(placeholders.doubleStar, ".*")
      .replaceAll(placeholders.singleStar, "[^/]*")
      .replaceAll(placeholders.question, ".")}$`,
  );
}

export function matchesAnyGlobs(patterns, candidate) {
  const normalizedCandidate = toPosixPath(candidate);
  return asArray(patterns).some((pattern) => globToRegExp(pattern).test(normalizedCandidate));
}

export function collectHighRiskMatches({ paths = [], text = "" }, config) {
  const normalizedPaths = unique(paths.map((value) => toPosixPath(value)));
  const haystack = String(text || "").toLowerCase();
  const hits = [];

  for (const rule of asArray(config.high_risk_rules)) {
    const matchedPaths = normalizedPaths.filter((candidate) =>
      matchesAnyGlobs(rule.paths || [], candidate),
    );
    const matchedKeywords = unique(
      asArray(rule.keywords).filter((keyword) => haystack.includes(String(keyword).toLowerCase())),
    );

    if (matchedPaths.length > 0 || matchedKeywords.length > 0) {
      hits.push({
        id: rule.id,
        reason: rule.reason,
        matched_paths: matchedPaths,
        matched_keywords: matchedKeywords,
      });
    }
  }

  return hits;
}

export function isDeclaredWriteAllowed(writeTargets, config) {
  const targets = unique(writeTargets.map((value) => toPosixPath(value)));
  const denied = targets.filter((target) => matchesAnyGlobs(config.deny_write_paths || [], target));
  const notAllowlisted = targets.filter(
    (target) => !matchesAnyGlobs(config.allow_write_paths || [], target),
  );

  return {
    ok: denied.length === 0 && notAllowlisted.length === 0,
    denied,
    not_allowlisted: notAllowlisted,
  };
}

export function normalizeRiskLevel(value) {
  const normalized = String(value || "medium").trim().toLowerCase();
  return RISK_LEVELS.includes(normalized) ? normalized : "medium";
}

export function maxRiskLevel(left, right) {
  const leftRank = RISK_LEVELS.indexOf(normalizeRiskLevel(left));
  const rightRank = RISK_LEVELS.indexOf(normalizeRiskLevel(right));
  return leftRank >= rightRank ? normalizeRiskLevel(left) : normalizeRiskLevel(right);
}

export function getReportFilePaths(root, eventId, suffix = "") {
  const stem = `${eventId}${suffix}`;
  return {
    jsonPath: path.join(root, REPORTS_DIR, `${stem}.json`),
    markdownPath: path.join(root, REPORTS_DIR, `${stem}.md`),
  };
}

export function renderMarkdownReport(report) {
  const artifacts = asArray(report.artifacts).map((artifact) => {
    if (typeof artifact === "string") return `- \`${artifact}\``;
    return `- ${artifact.kind}: \`${artifact.path}\``;
  });

  const rerunCommands = asArray(report.rerun_commands).map((command) => `- \`${command}\``);
  const highRisk = asArray(report.high_risk_matches).map(
    (match) => `- ${match.id}: ${match.reason}`,
  );
  const issueLine = report.issue?.number
    ? `- Issue: #${report.issue.number}${report.issue.url ? ` (${report.issue.url})` : ""}`
    : null;

  return [
    `# Agent Report: ${report.classification}`,
    "",
    `- Event ID: \`${report.event_id}\``,
    `- Source: \`${report.source}\``,
    `- Risk Level: \`${report.risk_level}\``,
    `- Status: \`${report.status}\``,
    `- Approval Required: ${report.approval_required ? "yes" : "no"}`,
    `- Occurrences: ${report.occurrences ?? 1}`,
    `- Auto Action Taken: ${report.auto_action_taken || "none"}`,
    issueLine,
    "",
    "## Recommended Action",
    "",
    report.recommended_action || "No recommendation recorded.",
    "",
    "## Rerun Commands",
    "",
    ...(rerunCommands.length > 0 ? rerunCommands : ["- none"]),
    "",
    "## Artifacts",
    "",
    ...(artifacts.length > 0 ? artifacts : ["- none"]),
    "",
    "## High-Risk Matches",
    "",
    ...(highRisk.length > 0 ? highRisk : ["- none"]),
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function writeAgentReport(root, report, suffix = "") {
  const filePaths = getReportFilePaths(root, report.event_id, suffix);
  const markdown = renderMarkdownReport(report);
  await writeJson(filePaths.jsonPath, report);
  await writeText(filePaths.markdownPath, `${markdown}\n`);
  return {
    ...filePaths,
    jsonRelative: toRepoRelative(root, filePaths.jsonPath),
    markdownRelative: toRepoRelative(root, filePaths.markdownPath),
  };
}

export async function loadSignalInputs(root, inputs) {
  const records = [];

  for (const candidate of unique(inputs)) {
    const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(root, candidate);
    const raw = await readTextIfExists(absolutePath);
    if (!raw) continue;

    const relativePath = toRepoRelative(root, absolutePath);
    records.push({
      absolutePath,
      relativePath,
      raw,
      parsed: parseJsonLoose(raw),
    });
  }

  return records;
}

export async function appendStepSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

export async function setGithubOutputs(entries) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`);
  if (lines.length === 0) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

export async function listAgentReports(root = process.cwd()) {
  const dir = path.join(root, REPORTS_DIR);
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const reports = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const report = await readJsonIfExists(path.join(dir, entry));
    if (report) reports.push(report);
  }

  return reports.sort((left, right) =>
    String(right.updated_at || right.created_at || "").localeCompare(
      String(left.updated_at || left.created_at || ""),
    ),
  );
}

export function summarizeReports(reports) {
  const counts = {
    total: reports.length,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    approval_required: 0,
  };

  for (const report of reports) {
    counts[normalizeRiskLevel(report.risk_level)] += 1;
    if (report.approval_required) counts.approval_required += 1;
  }

  return counts;
}
