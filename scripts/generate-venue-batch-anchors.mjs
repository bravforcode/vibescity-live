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
const asNum = (value, fallback) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const cfg = {
	chunkSize: Math.max(asNum(arg("--chunk-size", "5000"), 5000), 100),
	pageSize: Math.max(asNum(arg("--page-size", "1000"), 1000), 100),
	maxRows: Math.max(asNum(arg("--max-rows", "0"), 0), 0),
	output: arg("--output", "scripts/venue-batch-anchors.json"),
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

const withSchemaRetry = async (fn, { attempts = 5, baseDelayMs = 300 } = {}) => {
	let lastError = null;
	for (let i = 0; i < attempts; i += 1) {
		const res = await fn();
		if (!res?.error) return res;
		if (!isSchemaCacheError(res.error)) return res;
		lastError = res.error;
		if (i < attempts - 1) await sleep(baseDelayMs * (i + 1));
	}
	return { data: null, error: lastError || new Error("schema cache unavailable") };
};

const main = async () => {
	console.log(JSON.stringify({ mode: "generate-venue-batch-anchors", ...cfg }));
	const anchors = [];
	let scanned = 0;
	let lastSeenId = "";
	let chunkRows = 0;
	let chunkMissing = 0;
	let chunkStartOffset = 0;
	let chunkStartAfterId = "";
	let totalMissing = 0;
	let dynamicPageSize = cfg.pageSize;
	let minPageTimeoutRetries = 0;
	let schemaCacheRetries = 0;

	const flushChunk = () => {
		if (!chunkRows) return;
		anchors.push({
			offset: chunkStartOffset,
			start_after_id: chunkStartAfterId || null,
			rows: chunkRows,
			missing_video_rows: chunkMissing,
		});
		chunkStartOffset += chunkRows;
		chunkRows = 0;
		chunkMissing = 0;
		chunkStartAfterId = lastSeenId || "";
	};

	while (true) {
		if (cfg.maxRows > 0 && scanned >= cfg.maxRows) break;
		let rows = null;
		while (rows === null) {
			let query = supabase
				.from("venues")
				.select('id,video_url,"Video_URL"')
				.order("id", { ascending: true })
				.limit(dynamicPageSize);
			if (lastSeenId) query = query.gt("id", lastSeenId);

			const { data, error } = await withSchemaRetry(() => query, { attempts: 6, baseDelayMs: 300 });
			if (!error) {
				rows = Array.isArray(data) ? data : [];
				minPageTimeoutRetries = 0;
				schemaCacheRetries = 0;
				break;
			}
			const message = lower(error?.message || "");
			if (message.includes("schema cache")) {
				if (schemaCacheRetries < 10) {
					schemaCacheRetries += 1;
					await sleep(250 * schemaCacheRetries);
					continue;
				}
			}
			if (
				(message.includes("statement timeout") || message.includes("upstream request timeout")) &&
				dynamicPageSize > 50
			) {
				dynamicPageSize = Math.max(50, Math.floor(dynamicPageSize / 2));
				continue;
			}
			if (message.includes("statement timeout") || message.includes("upstream request timeout")) {
				if (minPageTimeoutRetries < 4) {
					minPageTimeoutRetries += 1;
					await sleep(250 * minPageTimeoutRetries);
					continue;
				}
			}
			throw new Error(error.message || "failed to fetch venues");
		}
		if (!rows.length) break;

		for (const row of rows) {
			if (cfg.maxRows > 0 && scanned >= cfg.maxRows) break;
			const prevLastSeen = lastSeenId;
			lastSeenId = clean(row?.id) || lastSeenId;
			if (!chunkRows) {
				chunkStartAfterId = prevLastSeen;
			}
			chunkRows += 1;
			scanned += 1;
			const hasVideo = clean(row?.video_url || row?.Video_URL);
			if (!hasVideo) {
				chunkMissing += 1;
				totalMissing += 1;
			}
			if (chunkRows >= cfg.chunkSize) {
				flushChunk();
			}
		}
	}

	flushChunk();

	const payload = {
		generated_at: new Date().toISOString(),
		chunk_size: cfg.chunkSize,
		page_size: cfg.pageSize,
		max_rows: cfg.maxRows,
		total_rows_scanned: scanned,
		total_missing_video_rows: totalMissing,
		anchors,
	};

	const outPath = path.isAbsolute(cfg.output)
		? cfg.output
		: path.resolve(process.cwd(), cfg.output);
	await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
	console.log(JSON.stringify({ output: outPath, anchors: anchors.length, scanned, totalMissing }, null, 2));
};

main().catch((err) => {
	console.error(err?.stack || err?.message || err);
	process.exit(1);
});
