#!/usr/bin/env node

import process from "node:process";

const DEFAULT_API_BASE = process.env.GITHUB_API_URL || "https://api.github.com";

const parseBoolean = (value, fallback = false) => {
	if (value === undefined || value === null || value === "") return fallback;
	const normalized = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return fallback;
};

const parseInteger = (value, fallback) => {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	const options = {
		repo: process.env.GITHUB_REPOSITORY || "",
		token: process.env.GITHUB_TOKEN || "",
		apiBase: DEFAULT_API_BASE,
		branch: process.env.BRANCH_PROTECTION_BRANCH || "main",
		contexts: String(process.env.MAP_FPS_REQUIRED_CONTEXT || "map-fps-guardrail"),
		strict: undefined,
		appId: parseInteger(process.env.MAP_FPS_REQUIRED_APP_ID, -1),
		dryRun: parseBoolean(process.env.DRY_RUN, false),
		bootstrapUnprotected: parseBoolean(process.env.BRANCH_PROTECTION_BOOTSTRAP, false),
	};

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--repo":
				options.repo = String(next || options.repo);
				i += 1;
				break;
			case "--token":
				options.token = String(next || options.token);
				i += 1;
				break;
			case "--api-base":
				options.apiBase = String(next || options.apiBase);
				i += 1;
				break;
			case "--branch":
				options.branch = String(next || options.branch);
				i += 1;
				break;
			case "--context":
			case "--contexts":
				options.contexts = String(next || options.contexts);
				i += 1;
				break;
			case "--strict":
				options.strict = true;
				break;
			case "--no-strict":
				options.strict = false;
				break;
			case "--app-id":
				options.appId = parseInteger(next, options.appId);
				i += 1;
				break;
			case "--dry-run":
				options.dryRun = true;
				break;
			case "--bootstrap-unprotected":
				options.bootstrapUnprotected = true;
				break;
			default:
				break;
		}
	}

	return options;
};

const parseContexts = (value) =>
	String(value || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

const buildHeaders = (token, hasBody) => {
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (hasBody) {
		headers["Content-Type"] = "application/json";
	}
	return headers;
};

const ghRequest = async ({
	apiBase,
	repo,
	token,
	method = "GET",
	path,
	body,
	allow404 = false,
}) => {
	const url = `${apiBase}/repos/${repo}${path}`;
	const response = await fetch(url, {
		method,
		headers: buildHeaders(token, body !== undefined),
		body: body === undefined ? undefined : JSON.stringify(body),
	});

	if (allow404 && response.status === 404) {
		return null;
	}
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`${method} ${url} failed (${response.status}): ${text.slice(0, 400)}`);
	}

	if (response.status === 204) return {};
	const text = await response.text();
	if (!text.trim()) return {};
	return JSON.parse(text);
};

const extractChecks = ({ requiredStatusChecks, defaultAppId }) => {
	const map = new Map();
	const checks = Array.isArray(requiredStatusChecks?.checks) ? requiredStatusChecks.checks : [];
	for (const check of checks) {
		const context = String(check?.context || "").trim();
		if (!context) continue;
		const appId = Number.isInteger(check?.app_id)
			? check.app_id
			: parseInteger(check?.app_id, defaultAppId);
		map.set(context, { context, app_id: appId });
	}

	const contexts = Array.isArray(requiredStatusChecks?.contexts)
		? requiredStatusChecks.contexts
		: [];
	for (const contextRaw of contexts) {
		const context = String(contextRaw || "").trim();
		if (!context || map.has(context)) continue;
		map.set(context, { context, app_id: defaultAppId });
	}

	return map;
};

const toSortedChecks = (map) =>
	[...map.values()].sort((a, b) => a.context.localeCompare(b.context));

const main = async () => {
	const options = parseArgs();
	const targetContexts = parseContexts(options.contexts);

	if (!options.repo) {
		throw new Error("Missing repository. Provide --repo or set GITHUB_REPOSITORY.");
	}
	if (!options.token) {
		throw new Error("Missing token. Provide --token or set GITHUB_TOKEN.");
	}
	if (!targetContexts.length) {
		throw new Error("No required check context provided. Use --context map-fps-guardrail.");
	}

	const requiredStatusChecks = await ghRequest({
		apiBase: options.apiBase,
		repo: options.repo,
		token: options.token,
		path: `/branches/${options.branch}/protection/required_status_checks`,
		allow404: true,
	});

	if (!requiredStatusChecks && !options.bootstrapUnprotected) {
		throw new Error(
			`Branch '${options.branch}' is not protected. Re-run with --bootstrap-unprotected to create baseline protection first.`,
		);
	}

	if (!requiredStatusChecks && options.bootstrapUnprotected) {
		const bootstrapBody = {
			required_status_checks: {
				strict: options.strict ?? true,
				checks: targetContexts.map((context) => ({
					context,
					app_id: options.appId,
				})),
			},
			enforce_admins: false,
			required_pull_request_reviews: null,
			restrictions: null,
			required_linear_history: false,
			allow_force_pushes: false,
			allow_deletions: false,
			block_creations: false,
			required_conversation_resolution: false,
			lock_branch: false,
			allow_fork_syncing: false,
		};

		if (options.dryRun) {
			console.log("[dry-run] Would create branch protection with payload:");
			console.log(JSON.stringify(bootstrapBody, null, 2));
			return;
		}

		await ghRequest({
			apiBase: options.apiBase,
			repo: options.repo,
			token: options.token,
			method: "PUT",
			path: `/branches/${options.branch}/protection`,
			body: bootstrapBody,
		});

		console.log(
			`Branch protection created for ${options.repo}:${options.branch} with required checks: ${targetContexts.join(", ")}`,
		);
		return;
	}

	const mergedChecks = extractChecks({
		requiredStatusChecks,
		defaultAppId: options.appId,
	});
	for (const context of targetContexts) {
		if (!mergedChecks.has(context)) {
			mergedChecks.set(context, {
				context,
				app_id: options.appId,
			});
		}
	}

	const payload = {
		strict: options.strict ?? Boolean(requiredStatusChecks?.strict),
		checks: toSortedChecks(mergedChecks),
	};

	if (options.dryRun) {
		console.log("[dry-run] Existing required_status_checks:");
		console.log(JSON.stringify(requiredStatusChecks, null, 2));
		console.log("[dry-run] Would PATCH required_status_checks with:");
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	await ghRequest({
		apiBase: options.apiBase,
		repo: options.repo,
		token: options.token,
		method: "PATCH",
		path: `/branches/${options.branch}/protection/required_status_checks`,
		body: payload,
	});

	const after = await ghRequest({
		apiBase: options.apiBase,
		repo: options.repo,
		token: options.token,
		path: `/branches/${options.branch}/protection/required_status_checks`,
	});

	const afterContexts = extractChecks({
		requiredStatusChecks: after,
		defaultAppId: options.appId,
	});
	const isApplied = targetContexts.every((context) => afterContexts.has(context));

	console.log(`Branch protection updated for ${options.repo}:${options.branch}`);
	console.log(`Required check contexts now: ${toSortedChecks(afterContexts).map((x) => x.context).join(", ")}`);
	if (!isApplied) {
		throw new Error("Map FPS required check contexts were not found after update.");
	}
};

main().catch((error) => {
	console.error("Failed to set Map FPS required check:", error);
	process.exit(1);
});

