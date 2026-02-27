#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const arg = (name, fallback = "") => {
	const hit = process.argv.find((x) => x.startsWith(`${name}=`));
	return hit ? hit.slice(name.length + 1) : fallback;
};
const flag = (name) => process.argv.includes(name);
const asNum = (value, fallback) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const cfg = {
	action: arg("--action", "list"), // list | apply
	limit: Math.max(asNum(arg("--limit", "200"), 200), 1),
	minConfidence: Math.max(Math.min(asNum(arg("--min-confidence", "0"), 0), 100), 0),
	status: arg("--status", "pending_review"),
	decisionsFile: arg("--decisions", ""),
	actor: arg("--actor", "video-review:manual"),
	applyApproved: flag("--apply-approved"),
	applyLimit: Math.max(asNum(arg("--apply-limit", "5000"), 5000), 0),
	minAutoApply: Math.max(Math.min(asNum(arg("--min-auto-apply", "90"), 90), 100), 0),
	json: flag("--json"),
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	process.env.SUPABASE_ANON_KEY ||
	process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const clean = (v) => String(v || "").trim();
const lower = (v) => clean(v).toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isSchemaCacheError = (errorLike) => {
	const code = String(errorLike?.code || "").toUpperCase();
	const message = lower(errorLike?.message || "");
	return code === "PGRST002" || message.includes("schema cache");
};

const withSchemaRetry = async (fn, { attempts = 4, baseDelayMs = 250 } = {}) => {
	let lastError = null;
	for (let i = 0; i < attempts; i += 1) {
		const res = await fn();
		if (!res?.error) return res;
		if (!isSchemaCacheError(res.error)) return res;
		lastError = res.error;
		if (i < attempts - 1) {
			await sleep(baseDelayMs * (i + 1));
		}
	}
	return { data: null, error: lastError || new Error("schema cache unavailable") };
};

const fetchQueue = async () => {
	let query = supabase
		.from("venue_video_candidates")
		.select(
			"id,venue_id,video_url,platform,source_type,source_url,source_verified,match_score,confidence_score,quality_score,status,discovered_at,review_note,venues(name,slug,category,province)",
		)
		.eq("status", cfg.status)
		.gte("confidence_score", cfg.minConfidence)
		.order("confidence_score", { ascending: false })
		.order("discovered_at", { ascending: false })
		.limit(cfg.limit);

	const { data, error } = await withSchemaRetry(() => query, {
		attempts: 5,
		baseDelayMs: 300,
	});
	if (error) throw new Error(error.message || "failed to fetch review queue");
	return Array.isArray(data) ? data : [];
};

const loadDecisions = async () => {
	if (!cfg.decisionsFile) {
		throw new Error("--decisions=<path-to-json> is required for --action=apply");
	}
	const abs = path.isAbsolute(cfg.decisionsFile)
		? cfg.decisionsFile
		: path.resolve(process.cwd(), cfg.decisionsFile);
	let raw = "";
	try {
		raw = await fs.readFile(abs, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") {
			throw new Error(
				`decisions file not found: ${abs}\nCreate JSON array like: [{"id":123,"status":"approved","review_note":"ok"}]`,
			);
		}
		throw error;
	}
	const parsed = JSON.parse(raw);
	const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];

	const decisions = rows
		.map((row) => ({
			id: Number(row?.id),
			status: lower(row?.status),
			review_note: clean(row?.review_note || row?.note || ""),
			reviewed_by: clean(row?.reviewed_by || ""),
		}))
		.filter(
			(row) =>
				Number.isFinite(row.id) &&
				["approved", "rejected", "pending_review", "invalid"].includes(row.status),
		);

	return decisions;
};

const applyDecisions = async (rows) => {
	if (!rows.length) return 0;
	const { data, error } = await withSchemaRetry(
		() =>
			supabase.rpc("review_venue_video_candidates", {
				p_rows: rows,
				p_actor: cfg.actor,
			}),
		{ attempts: 5, baseDelayMs: 300 },
	);
	if (error) throw new Error(error.message || "review_venue_video_candidates failed");
	return Number(data || 0);
};

const applyApproved = async () => {
	const { data, error } = await withSchemaRetry(
		() =>
			supabase.rpc("apply_approved_venue_videos", {
				p_limit: cfg.applyLimit,
				p_min_confidence: cfg.minAutoApply,
				p_actor: cfg.actor,
			}),
		{ attempts: 5, baseDelayMs: 300 },
	);
	if (error) throw new Error(error.message || "apply_approved_venue_videos failed");
	const row = Array.isArray(data) ? data[0] : data;
	return {
		applied_count: Number(row?.applied_count || 0),
		candidate_count: Number(row?.candidate_count || 0),
	};
};

const printList = (rows) => {
	if (cfg.json) {
		console.log(JSON.stringify(rows, null, 2));
		return;
	}
	for (const row of rows) {
		const venue = row?.venues || {};
		console.log(
			[
				`id=${row.id}`,
				`venue=${row.venue_id}`,
				`name=${clean(venue?.name || "-")}`,
				`confidence=${row.confidence_score}`,
				`verified=${row.source_verified}`,
				`platform=${clean(row.platform)}`,
				`status=${clean(row.status)}`,
				`url=${clean(row.video_url)}`,
			].join(" | "),
		);
	}
	console.log(`total=${rows.length}`);
};

const main = async () => {
	if (cfg.action === "list") {
		const rows = await fetchQueue();
		printList(rows);
		return;
	}

	if (cfg.action === "apply") {
		const decisions = await loadDecisions();
		const reviewed = await applyDecisions(decisions);
		let applied = null;
		if (cfg.applyApproved) {
			applied = await applyApproved();
		}
		console.log(
			JSON.stringify(
				{
					mode: "review-venue-video-candidates",
					decisions_received: decisions.length,
					rows_reviewed: reviewed,
					apply: applied,
				},
				null,
				2,
			),
		);
		return;
	}

	throw new Error(`Unsupported --action=${cfg.action}`);
};

main().catch((err) => {
	console.error(err?.stack || err?.message || err);
	process.exit(1);
});
