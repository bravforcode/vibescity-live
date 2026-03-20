import { asArray, collectHighRiskMatches, unique } from "./runtime.mjs";

function lowerJoined(values) {
  return asArray(values)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function inferTriggerKey(context) {
  if (context.triggerKey) return context.triggerKey;

  const joined = lowerJoined([
    context.workflowName,
    context.source,
    ...context.inputFiles,
  ]);

  if (joined.includes("map-preflight")) return "map-preflight";
  if (joined.includes("map-required")) return "map-required";
  if (joined.includes("smoke")) return "smoke";
  if (joined.includes("route-slo")) return "route-slo";
  if (
    joined.includes("perf-budget") ||
    joined.includes("lighthouse") ||
    joined.includes("map-fps")
  ) {
    return "perf-budget";
  }
  if (joined.includes("i18n")) return "i18n";
  if (joined.includes("healthcheck") || joined.includes("postdeploy")) return "healthcheck";
  if (joined.includes("security") || joined.includes("pii")) return "security";
  if (joined.includes("advisor") || joined.includes("weekly-quality-trend")) {
    return "scheduled_advisor";
  }

  return "workflow_failure";
}

function extractRouteSloStats(inputRecords) {
  const stats = {
    breached: 0,
    required: 0,
  };

  for (const record of inputRecords) {
    const signals = asArray(record?.parsed?.signals);
    for (const signal of signals) {
      if (signal?.breached === true) {
        stats.breached += 1;
        if ((signal?.severity || "required") !== "optional") {
          stats.required += 1;
        }
      }
    }
  }

  return stats;
}

function extractTrendBreaches(inputRecords) {
  for (const record of inputRecords) {
    const payload = record?.parsed;
    const lanes = payload?.lanes || {};
    const thresholds = payload?.thresholds || {};

    const strict = Number(lanes?.strict_map_required?.pass_rate);
    const strictThreshold = Number(thresholds?.strict_min_pass_rate);
    if (Number.isFinite(strict) && Number.isFinite(strictThreshold) && strict < strictThreshold) {
      return true;
    }

    const synthetic = Number(lanes?.synthetic_overall?.pass_rate);
    const syntheticThreshold = Number(thresholds?.synthetic_overall_min_pass_rate);
    if (
      Number.isFinite(synthetic) &&
      Number.isFinite(syntheticThreshold) &&
      synthetic < syntheticThreshold
    ) {
      return true;
    }
  }

  return false;
}

function hasI18nDrift(inputRecords) {
  return inputRecords.some((record) => {
    const relative = String(record.relativePath || "").toLowerCase();
    return relative.includes("i18n") || relative.includes("locale");
  });
}

function firstHighRiskClassification(highRiskMatches) {
  const ruleIds = unique(highRiskMatches.map((match) => match.id));

  if (ruleIds.includes("schema") || ruleIds.includes("destructive")) {
    return {
      classification: "schema-approval",
      riskLevel: "critical",
    };
  }

  if (ruleIds.includes("payment") || ruleIds.includes("auth") || ruleIds.includes("rls")) {
    return {
      classification: "security-gate",
      riskLevel: "critical",
    };
  }

  return null;
}

function recommendedActionFor(classification, routeStats) {
  switch (classification) {
    case "schema-approval":
      return "Stop automation, build an approval packet, and require a human review before touching any schema, migration, or destructive surface.";
    case "security-gate":
      return "Freeze auto-remediation, capture the exact failing signal, and require a human security review before any privileged action is attempted.";
    case "route-slo-breach":
      return `Re-run route SLO evaluation, inspect the breached endpoints from the latest route report, and escalate if required endpoints continue failing (${routeStats.required} required breach(es)).`;
    case "quality-trend-breach":
      return "Review the recent trend artifact, confirm whether the drop is persistent, and open follow-up work for the failing lane instead of making broad automatic code changes.";
    case "i18n-drift":
      return "Run the i18n autopilot, sync locale parity, and re-check untranslated or orphaned keys before publishing the remediation result.";
    case "performance-budget":
      return "Re-run the perf budget checks and inspect the associated artifact to determine whether this is a regression, a budget change, or an environment-specific variance.";
    case "e2e-regression":
      return "Re-run the affected Playwright lane, inspect the artifact bundle, and keep remediation scoped to safe-surface checks or content fixes.";
    case "healthcheck-regression":
      return "Re-run the postdeploy healthcheck and route SLO evaluation, then compare the latest report against the prior release health snapshot.";
    case "advisory-scan":
      return "Publish the advisory summary and keep the run read-only unless a later operator explicitly promotes it into a remediation lane.";
    default:
      return "Capture the failure, re-run the lowest-risk diagnostic command, and keep any code changes behind an explicit remediation or approval workflow.";
  }
}

function rerunCommandsFor(classification, triggerKey, config) {
  const triggerCommands = asArray(config.trigger_matrix?.[triggerKey]?.rerun_commands);
  if (triggerCommands.length > 0) return triggerCommands;

  switch (classification) {
    case "route-slo-breach":
      return ["node scripts/ci/evaluate-route-slo.mjs"];
    case "i18n-drift":
      return ["bun run i18n:autopilot", "bun run i18n:sync"];
    case "performance-budget":
      return ["node scripts/ci/check-perf-budget.mjs --budget perf-budget.json"];
    case "e2e-regression":
      return ["npm run test:e2e:smoke"];
    case "healthcheck-regression":
      return ["npm run healthcheck:postdeploy"];
    default:
      return ["python .agent/scripts/checklist.py ."];
  }
}

function remediationProfileFor(classification, triggerKey) {
  if (classification === "schema-approval" || classification === "security-gate") {
    return null;
  }

  if (classification === "i18n-drift") return "i18n-autopilot";
  if (classification === "performance-budget") return "performance-recheck";
  if (classification === "route-slo-breach") return "route-slo-recheck";
  if (classification === "healthcheck-regression") return "healthcheck-rerun";
  if (classification === "quality-trend-breach") return "diagnostic-checklist";
  if (classification === "advisory-scan") return "diagnostic-checklist";

  if (classification === "e2e-regression") {
    if (triggerKey === "map-preflight") return "map-preflight-rerun";
    if (triggerKey === "map-required") return "map-required-rerun";
    return "playwright-smoke-rerun";
  }

  return "diagnostic-checklist";
}

export function classifySignalContext(context, config) {
  const inputFiles = unique(context.inputFiles || []);
  const triggerKey = inferTriggerKey(context);
  const routeStats = extractRouteSloStats(context.inputRecords || []);
  const trendBreach = extractTrendBreaches(context.inputRecords || []);
  const highRiskMatches = collectHighRiskMatches(
    {
      paths: inputFiles,
      text: lowerJoined([
        context.workflowName,
        context.source,
        context.conclusion,
        ...(context.inputRecords || []).map((record) => record.raw?.slice(0, 1000)),
      ]),
    },
    config,
  );

  const explicitHighRisk = firstHighRiskClassification(highRiskMatches);
  let classification = explicitHighRisk?.classification || "general-ci-failure";
  let riskLevel = explicitHighRisk?.riskLevel || "medium";

  if (!explicitHighRisk) {
    const joined = lowerJoined([
      context.workflowName,
      context.source,
      context.conclusion,
      ...inputFiles,
    ]);

    if (routeStats.breached > 0 || joined.includes("route-slo")) {
      classification = "route-slo-breach";
      riskLevel = routeStats.required > 0 ? "high" : "medium";
    } else if (trendBreach) {
      classification = "quality-trend-breach";
      riskLevel = "medium";
    } else if (hasI18nDrift(context.inputRecords || []) || joined.includes("i18n")) {
      classification = "i18n-drift";
      riskLevel = "low";
    } else if (
      joined.includes("lighthouse") ||
      joined.includes("perf") ||
      joined.includes("map-fps")
    ) {
      classification = "performance-budget";
      riskLevel = "medium";
    } else if (
      joined.includes("playwright") ||
      joined.includes("e2e") ||
      joined.includes("smoke") ||
      joined.includes("map-preflight") ||
      joined.includes("map-required")
    ) {
      classification = "e2e-regression";
      riskLevel = "medium";
    } else if (
      joined.includes("healthcheck") ||
      joined.includes("postdeploy") ||
      joined.includes("synthetic")
    ) {
      classification = "healthcheck-regression";
      riskLevel = "medium";
    } else if (joined.includes("security") || joined.includes("pii")) {
      classification = "security-gate";
      riskLevel = "critical";
    } else if (triggerKey === "scheduled_advisor") {
      classification = "advisory-scan";
      riskLevel = "low";
    }
  }

  const approvalRequired =
    highRiskMatches.length > 0 ||
    classification === "security-gate" ||
    classification === "schema-approval";
  const status =
    String(context.conclusion || "").toLowerCase() === "success" ? "resolved" : "triaged";

  return {
    triggerKey,
    classification,
    riskLevel,
    approvalRequired,
    recommendedAction: recommendedActionFor(classification, routeStats),
    rerunCommands: rerunCommandsFor(classification, triggerKey, config),
    highRiskMatches,
    safeRemediationProfile: approvalRequired ? null : remediationProfileFor(classification, triggerKey),
    routeStats,
    trendBreach,
    summary: {
      route_breaches: routeStats.breached,
      required_route_breaches: routeStats.required,
      trend_breach: trendBreach,
    },
    status,
  };
}
