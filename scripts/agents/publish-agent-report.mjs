#!/usr/bin/env node

import path from "node:path";
import {
  appendStepSummary,
  asArray,
  unique,
  loadAutonomyConfig,
  readJsonIfExists,
  setGithubOutputs,
  toRepoRelative,
  writeAgentReport,
} from "./lib/runtime.mjs";

function parseArgs(argv) {
  const args = {
    prs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--report":
        args.report = argv[index + 1];
        index += 1;
        break;
      case "--pr":
        args.prs.push(argv[index + 1]);
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

function shouldPublishIssue(report, config) {
  const issues = config.report_sinks?.issues;
  if (!issues?.enabled) return false;
  if (report.approval_required && issues.create_for_approval_required) return true;
  return asArray(issues.create_for_risk_levels).includes(report.risk_level);
}

function shouldPublishPullRequest(report, config) {
  const pullRequests = config.report_sinks?.pull_requests;
  if (!pullRequests?.enabled) return false;
  if (report.approval_required && pullRequests.comment_for_approval_required) return true;
  if (asArray(pullRequests.comment_for_statuses).includes(report.status)) return true;
  return asArray(pullRequests.comment_for_risk_levels).includes(report.risk_level);
}

async function githubRequest({ token, repository, requestPath, method = "GET", body }) {
  const response = await fetch(`https://api.github.com/repos/${repository}${requestPath}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${method} ${requestPath} failed: ${response.status} ${text.slice(0, 200)}`,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

async function fetchOpenIssues({ token, repository, labels }) {
  return githubRequest({
    token,
    repository,
    requestPath: `/issues?state=open&labels=${encodeURIComponent(labels.join(","))}&per_page=100`,
  });
}

async function fetchIssueComments({ token, repository, issueNumber }) {
  return githubRequest({
    token,
    repository,
    requestPath: `/issues/${issueNumber}/comments?per_page=100`,
  });
}

function marker(report) {
  return `<!-- agent-event-id:${report.event_id} -->`;
}

function findExistingIssue(issues, report) {
  return asArray(issues).find((issue) => String(issue.body || "").includes(marker(report)));
}

function findExistingComment(comments, report) {
  return asArray(comments).find((comment) => String(comment.body || "").includes(marker(report)));
}

async function createIssue({ token, repository, title, body, labels }) {
  return githubRequest({
    token,
    repository,
    requestPath: "/issues",
    method: "POST",
    body: { title, body, labels },
  });
}

async function commentIssue({ token, repository, issueNumber, body }) {
  return githubRequest({
    token,
    repository,
    requestPath: `/issues/${issueNumber}/comments`,
    method: "POST",
    body: { body },
  });
}

async function updateComment({ token, repository, commentId, body }) {
  return githubRequest({
    token,
    repository,
    requestPath: `/issues/comments/${commentId}`,
    method: "PATCH",
    body: { body },
  });
}

async function closeIssue({ token, repository, issueNumber }) {
  return githubRequest({
    token,
    repository,
    requestPath: `/issues/${issueNumber}`,
    method: "PATCH",
    body: { state: "closed" },
  });
}

function issueBody(report, relativePath) {
  return [
    `Ops agent report for \`${report.classification}\`.`,
    "",
    `- Event ID: \`${report.event_id}\``,
    `- Risk level: \`${report.risk_level}\``,
    `- Approval required: ${report.approval_required ? "yes" : "no"}`,
    `- Status: \`${report.status}\``,
    `- Report: \`${relativePath}\``,
    "",
    "### Recommended action",
    report.recommended_action,
    "",
    "### Rerun commands",
    ...asArray(report.rerun_commands).map((command) => `- \`${command}\``),
    "",
    marker(report),
  ].join("\n");
}

function pullRequestCommentBody(report, relativePath) {
  return [
    "## Ops Agent Report",
    "",
    `- Event ID: \`${report.event_id}\``,
    `- Classification: \`${report.classification}\``,
    `- Risk level: \`${report.risk_level}\``,
    `- Approval required: ${report.approval_required ? "yes" : "no"}`,
    `- Status: \`${report.status}\``,
    `- Report: \`${relativePath}\``,
    report.issue?.number ? `- Linked issue: #${report.issue.number}` : "- Linked issue: none",
    "",
    "### Recommended action",
    report.recommended_action,
    "",
    "### Rerun commands",
    ...asArray(report.rerun_commands).map((command) => `- \`${command}\``),
    "",
    marker(report),
  ].join("\n");
}

async function resolvePullRequestNumbers(args) {
  const explicit = unique(
    asArray(args.prs).flatMap((value) =>
      String(value)
        .split(",")
        .map((part) => part.trim()),
    ),
  )
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (explicit.length > 0) return explicit;

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return [];

  const payload = await readJsonIfExists(eventPath);
  if (!payload) return [];

  const discovered = [];
  if (payload.pull_request?.number) {
    discovered.push(payload.pull_request.number);
  }
  for (const pullRequest of asArray(payload.workflow_run?.pull_requests)) {
    if (pullRequest?.number) discovered.push(pullRequest.number);
  }

  return unique(discovered)
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.report) {
    throw new Error("Missing --report <path>");
  }

  const root = process.cwd();
  const config = await loadAutonomyConfig(root);
  const reportPath = path.isAbsolute(args.report) ? args.report : path.join(root, args.report);
  const report = await readJsonIfExists(reportPath);
  if (!report) {
    throw new Error(`Report not found or invalid JSON: ${reportPath}`);
  }

  const relativePath = toRepoRelative(root, reportPath);
  const lines = [
    "## Ops Agent Publish",
    `- Event ID: \`${report.event_id}\``,
    `- Classification: \`${report.classification}\``,
    `- Risk: \`${report.risk_level}\``,
    `- Approval required: ${report.approval_required ? "yes" : "no"}`,
    `- Status: \`${report.status}\``,
    `- Report: \`${relativePath}\``,
  ];

  let issueNumber = null;
  let issueUrl = null;
  const publishedPullRequests = [];

  if (shouldPublishIssue(report, config) && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    const labels = asArray(config.report_sinks?.issues?.labels);
    const openIssues = await fetchOpenIssues({
      token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY,
      labels,
    });
    const existing = findExistingIssue(openIssues, report);

    if (existing && report.status === "resolved") {
      await commentIssue({
        token: process.env.GITHUB_TOKEN,
        repository: process.env.GITHUB_REPOSITORY,
        issueNumber: existing.number,
        body: `Recovery recorded for \`${report.event_id}\`.\n\n- Status: \`${report.status}\`\n- Report: \`${relativePath}\``,
      });
      await closeIssue({
        token: process.env.GITHUB_TOKEN,
        repository: process.env.GITHUB_REPOSITORY,
        issueNumber: existing.number,
      });
      issueNumber = existing.number;
      issueUrl = existing.html_url;
      lines.push(`- Issue closed: #${issueNumber}`);
    } else if (existing) {
      await commentIssue({
        token: process.env.GITHUB_TOKEN,
        repository: process.env.GITHUB_REPOSITORY,
        issueNumber: existing.number,
        body: `Update for \`${report.event_id}\`.\n\n- Status: \`${report.status}\`\n- Report: \`${relativePath}\``,
      });
      issueNumber = existing.number;
      issueUrl = existing.html_url;
      lines.push(`- Issue updated: #${issueNumber}`);
    } else {
      const created = await createIssue({
        token: process.env.GITHUB_TOKEN,
        repository: process.env.GITHUB_REPOSITORY,
        title: `[Ops Agent][${report.risk_level.toUpperCase()}] ${report.classification}`,
        body: issueBody(report, relativePath),
        labels,
      });
      issueNumber = created.number;
      issueUrl = created.html_url;
      lines.push(`- Issue created: #${issueNumber}`);
    }
  } else {
    lines.push("- Issue publishing: skipped");
  }

  if (
    shouldPublishPullRequest(report, config) &&
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_REPOSITORY
  ) {
    const prNumbers = await resolvePullRequestNumbers(args);
    if (prNumbers.length === 0) {
      lines.push("- PR publishing: skipped (no PR context)");
    } else {
      for (const prNumber of prNumbers) {
        const body = pullRequestCommentBody(report, relativePath);
        const comments = await fetchIssueComments({
          token: process.env.GITHUB_TOKEN,
          repository: process.env.GITHUB_REPOSITORY,
          issueNumber: prNumber,
        });
        const existingComment = findExistingComment(comments, report);
        const publishedComment = existingComment
          ? await updateComment({
              token: process.env.GITHUB_TOKEN,
              repository: process.env.GITHUB_REPOSITORY,
              commentId: existingComment.id,
              body,
            })
          : await commentIssue({
              token: process.env.GITHUB_TOKEN,
              repository: process.env.GITHUB_REPOSITORY,
              issueNumber: prNumber,
              body,
            });

        publishedPullRequests.push({
          number: prNumber,
          comment_url: publishedComment?.html_url || null,
          comment_id: publishedComment?.id || existingComment?.id || null,
        });
      }
      lines.push(`- PR comments upserted: ${publishedPullRequests.map((entry) => `#${entry.number}`).join(", ")}`);
    }
  } else {
    lines.push("- PR publishing: skipped");
  }

  if (issueNumber || publishedPullRequests.length > 0) {
    report.issue = {
      number: issueNumber,
      url: issueUrl,
    };
    if (publishedPullRequests.length > 0) {
      report.pull_requests = publishedPullRequests;
    }
    await writeAgentReport(root, report);
  }

  console.log(lines.join("\n"));
  await appendStepSummary(lines);
  await setGithubOutputs({
    published_report_path: relativePath,
    published_issue_number: issueNumber,
    published_issue_url: issueUrl,
    published_pr_numbers: publishedPullRequests.map((entry) => entry.number).join(","),
  });
}

main().catch((error) => {
  console.error(`Agent report publish failed: ${error?.message || error}`);
  process.exit(1);
});
