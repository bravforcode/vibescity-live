#!/usr/bin/env node

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
const flag = (name) => process.argv.includes(name);

const cfg = {
	limit: Math.max(asNum(arg("--limit", "50000"), 50000), 1),
	offset: Math.max(asNum(arg("--offset", "0"), 0), 0),
	startId: arg("--start-id", ""),
	pageSize: Math.max(asNum(arg("--page-size", "1000"), 1000), 100),
	rpcChunk: Math.max(asNum(arg("--rpc-chunk", "500"), 500), 1),
	onlyMissing: !flag("--include-with-video"),
	includeExistingVideoAsSource: flag("--include-existing-video"),
	dryRun: flag("--dry-run"),
	verbose: flag("--verbose"),
	actor: arg("--actor", "official-source-catalog:auto"),
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
const unique = (arr) => [...new Set((arr || []).map(clean).filter(Boolean))];
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
		if (i < attempts - 1) await sleep(baseDelayMs * (i + 1));
	}
	return { data: null, error: lastError || new Error("schema cache unavailable") };
};

const isUrl = (value) => /^https?:\/\//i.test(clean(value));

const safeUrl = (value) => {
	try {
		return new URL(clean(value));
	} catch {
		return null;
	}
};

const normalizeHostname = (hostname) =>
	lower(hostname).replace(/^www\./, "").replace(/^m\./, "");

const platformFromHost = (host) => {
	if (!host) return "unknown";
	if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
	if (host.includes("instagram.com")) return "instagram";
	if (host.includes("tiktok.com")) return "tiktok";
	if (host.includes("facebook.com") || host.includes("fb.watch")) return "facebook";
	if (host.includes("vimeo.com")) return "vimeo";
	return "website";
};

const normalizeSourceUrl = (value) => {
	const raw = clean(value);
	if (!raw) return "";
	const withProtocol = isUrl(raw) ? raw : `https://${raw}`;
	const url = safeUrl(withProtocol);
	if (!url) return "";
	const host = normalizeHostname(url.hostname);
	const pathName = clean(url.pathname);

	if (host.includes("youtu.be")) {
		const id = pathName.replace(/^\/+/, "").split("/")[0];
		return id ? `https://youtube.com/watch?v=${id}` : "";
	}
	if (host.includes("youtube.com") && pathName.startsWith("/watch")) {
		const id = clean(url.searchParams.get("v"));
		return id ? `https://youtube.com/watch?v=${id}` : "";
	}
	if (host.includes("youtube.com") && pathName.startsWith("/shorts/")) {
		const id = pathName.split("/").filter(Boolean)[1] || "";
		return id ? `https://youtube.com/shorts/${id}` : "";
	}
	if (host.includes("facebook.com") && pathName.startsWith("/watch")) {
		const id = clean(url.searchParams.get("v"));
		return id ? `https://facebook.com/watch?v=${id}` : "";
	}

	url.search = "";
	url.hash = "";
	return `https://${host}${url.pathname.replace(/\/+$/, "")}`;
};

const extractHandle = (urlValue, platformHint = "") => {
	const url = safeUrl(urlValue);
	if (!url) return "";
	const host = normalizeHostname(url.hostname);
	const platform = platformHint || platformFromHost(host);
	const parts = url.pathname.split("/").filter(Boolean);
	if (!parts.length) return "";
	if (platform === "instagram") {
		const first = parts[0] || "";
		if (first && !["p", "reel", "reels", "explore", "tv"].includes(lower(first))) return lower(first.replace(/^@/, ""));
	}
	if (platform === "tiktok") {
		const at = parts.find((p) => p.startsWith("@")) || "";
		return lower(at.replace(/^@/, ""));
	}
	if (platform === "youtube") {
		if (parts[0]?.startsWith("@")) return lower(parts[0].replace(/^@/, ""));
		if (["channel", "c", "user"].includes(parts[0])) return lower(parts[1] || "");
	}
	if (platform === "facebook") {
		if (parts[0] && !["watch", "video", "videos", "reel"].includes(lower(parts[0]))) return lower(parts[0]);
	}
	return "";
};

const parseMissingColumnName = (errorLike) => {
	const text = [
		errorLike?.message,
		errorLike?.details,
		errorLike?.hint,
		errorLike?.error_description,
	]
		.map((x) => clean(x))
		.filter(Boolean)
		.join(" | ");
	if (!text) return "";
	const patterns = [
		/column\s+[^.]+\.(["`]?[\w_]+"?)\s+does not exist/i,
		/column\s+(["`]?[\w_]+"?)\s+does not exist/i,
		/could not find the ['"`]?([\w_]+)['"`]?\s+column/i,
	];
	for (const re of patterns) {
		const match = text.match(re);
		if (match?.[1]) return clean(match[1]).replace(/^["'`]|["'`]$/g, "");
	}
	return "";
};

const parseSocialLinks = (raw) => {
	if (!raw) return [];
	if (typeof raw === "object" && !Array.isArray(raw)) {
		return Object.entries(raw)
			.map(([key, value]) => ({ key: lower(key), value: clean(value) }))
			.filter((x) => x.value);
	}
	const str = clean(raw);
	if (!str) return [];
	try {
		const parsed = JSON.parse(str);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return Object.entries(parsed)
				.map(([key, value]) => ({ key: lower(key), value: clean(value) }))
				.filter((x) => x.value);
		}
	} catch {}
	return [{ key: "social", value: str }];
};

const isRetryableVenueFetchError = (errorLike) => {
	const message = lower(errorLike?.message || errorLike);
	return (
		message.includes("schema cache") ||
		message.includes("could not query the database for the schema cache") ||
		message.includes("statement timeout") ||
		message.includes("upstream request timeout") ||
		message.includes("fetch failed")
	);
};

const normalizeSocialValueToUrl = (key, value) => {
	const v = clean(value);
	if (!v) return "";
	if (isUrl(v)) return v;
	if (["website", "site", "web"].includes(key)) {
		if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`;
		return "";
	}
	if (["instagram", "ig"].includes(key)) {
		const handle = v.replace(/^@/, "");
		return handle ? `https://instagram.com/${handle}` : "";
	}
	if (["tiktok", "tt"].includes(key)) {
		const handle = v.replace(/^@/, "");
		return handle ? `https://tiktok.com/@${handle}` : "";
	}
	if (["facebook", "fb"].includes(key)) {
		const handle = v.replace(/^@/, "");
		return handle ? `https://facebook.com/${handle}` : "";
	}
	if (["youtube", "yt"].includes(key)) {
		const handle = v.replace(/^@/, "");
		return handle ? `https://youtube.com/@${handle}` : "";
	}
	return "";
};

const buildOfficialSources = (venue) => {
	const venueId = clean(venue?.id);
	if (!venueId) return [];
	const rows = [];
	const seen = new Set();
	const add = (url, { key = "", sourceKind = "profile", priority = 80 } = {}) => {
		const normalized = normalizeSourceUrl(url);
		if (!normalized || seen.has(normalized)) return;
		seen.add(normalized);
		const u = safeUrl(normalized);
		const host = normalizeHostname(u?.hostname || "");
		const platform = platformFromHost(host);
		rows.push({
			venue_id: venueId,
			source_url: normalized,
			normalized_source_url: normalized,
			platform,
			source_kind: sourceKind,
			source_handle: extractHandle(normalized, platform) || null,
			verification_status: "verified",
			verification_method: "venue_profile",
			confidence: 90,
			is_active: true,
			priority,
			discovered_from: "build-venue-official-sources",
			metadata: {
				actor: cfg.actor,
				link_key: key || null,
			},
		});
	};

	if (clean(venue?.website)) add(venue.website, { key: "website", sourceKind: "website", priority: 95 });

	for (const link of parseSocialLinks(venue?.social_links)) {
		const url = normalizeSocialValueToUrl(link.key, link.value);
		if (!url) continue;
		add(url, { key: link.key, sourceKind: link.key === "website" ? "website" : "profile", priority: 85 });
	}

	if (cfg.includeExistingVideoAsSource) {
		const existing = clean(venue?.video_url || venue?.Video_URL);
		if (existing) add(existing, { key: "existing_video", sourceKind: "video", priority: 70 });
	}

	return rows;
};

const fetchVenues = async () => {
	const out = [];
	const selectColumns = [
		"id",
		"name",
		"website",
		"social_links",
		"video_url",
		'"Video_URL"',
	];
	let lastSeenId = clean(cfg.startId);
	let skipRemaining = lastSeenId ? 0 : cfg.offset;
	let dynamicPageSize = cfg.pageSize;
	let minPageTimeoutRetries = 0;
	let schemaCacheRetries = 0;

	while (out.length < cfg.limit) {
		let rows = null;
		while (rows === null) {
			const selectExpr = selectColumns.join(",");
			let query = supabase.from("venues").select(selectExpr).order("id", { ascending: true });
			if (lastSeenId) query = query.gt("id", lastSeenId);
			query = query.limit(dynamicPageSize);

			const { data, error } = await withSchemaRetry(() => query, { attempts: 5, baseDelayMs: 300 });
			if (!error) {
				rows = Array.isArray(data) ? data : [];
				minPageTimeoutRetries = 0;
				schemaCacheRetries = 0;
				break;
			}
			if (isSchemaCacheError(error)) {
				if (schemaCacheRetries < 8) {
					schemaCacheRetries += 1;
					await sleep(250 * schemaCacheRetries);
					continue;
				}
			}
			const missingColumn = parseMissingColumnName(error);
			if (missingColumn) {
				const target = lower(missingColumn);
				const idx = selectColumns.findIndex((x) => lower(clean(x).replace(/^["'`]|["'`]$/g, "")) === target);
				if (idx >= 0 && target !== "id") {
					selectColumns.splice(idx, 1);
					continue;
				}
			}
			const message = lower(error?.message || "");
			if (
				(message.includes("statement timeout") || message.includes("upstream request timeout")) &&
				dynamicPageSize > 50
			) {
				dynamicPageSize = Math.max(50, Math.floor(dynamicPageSize / 2));
				continue;
			}
			if (
				message.includes("statement timeout") ||
				message.includes("upstream request timeout")
			) {
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
			lastSeenId = clean(row?.id) || lastSeenId;
			if (skipRemaining > 0) {
				skipRemaining -= 1;
				continue;
			}
			out.push(row);
			if (out.length >= cfg.limit) break;
		}
		if (rows.length < dynamicPageSize || !lastSeenId) break;
	}
	return out;
};

const upsertSourcesChunk = async (rows) => {
	if (!rows.length) return 0;
	const { data, error } = await withSchemaRetry(
		() =>
			supabase.rpc("upsert_venue_official_sources", {
				p_rows: rows,
			}),
		{ attempts: 5, baseDelayMs: 300 },
	);
	if (error) {
		if (lower(error?.message || "").includes("upsert_venue_official_sources")) {
			throw new Error(
				`upsert_venue_official_sources RPC not found. Run migration 20260226180000_venue_official_sources_catalog.sql first.`,
			);
		}
		throw new Error(error.message || "upsert_venue_official_sources failed");
	}
	return Number(data || 0);
};

const main = async () => {
	console.log(JSON.stringify({ mode: "build-venue-official-sources", ...cfg }));
	let venues = [];
	let fetchError = null;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			venues = await fetchVenues();
			fetchError = null;
			break;
		} catch (err) {
			fetchError = err;
			if (!isRetryableVenueFetchError(err) || attempt >= 4) break;
			await sleep((attempt + 1) * 400);
		}
	}
	if (fetchError) throw fetchError;

	let venuesEligible = 0;
	let venuesSkippedHasVideo = 0;
	let prepared = 0;
	let upserted = 0;
	const platformStats = {};
	const buffer = [];

	for (let i = 0; i < venues.length; i += 1) {
		const venue = venues[i];
		if (cfg.onlyMissing) {
			const hasVideo = clean(venue?.video_url || venue?.Video_URL);
			if (hasVideo) {
				venuesSkippedHasVideo += 1;
				continue;
			}
		}
		venuesEligible += 1;
		const rows = buildOfficialSources(venue);
		for (const row of rows) {
			buffer.push(row);
			prepared += 1;
			platformStats[row.platform] = (platformStats[row.platform] || 0) + 1;
			if (!cfg.dryRun && buffer.length >= cfg.rpcChunk) {
				upserted += await upsertSourcesChunk(buffer.splice(0, buffer.length));
			}
		}
		if (cfg.verbose && (i + 1) % 1000 === 0) {
			console.log(`processed=${i + 1}/${venues.length} prepared=${prepared} upserted=${upserted}`);
		}
	}

	if (!cfg.dryRun && buffer.length) {
		upserted += await upsertSourcesChunk(buffer.splice(0, buffer.length));
	}

	console.log(
		JSON.stringify(
			{
				venues_scanned: venues.length,
				venues_eligible: venuesEligible,
				venues_skipped_has_video: venuesSkippedHasVideo,
				sources_prepared: prepared,
				sources_upserted: cfg.dryRun ? 0 : upserted,
				platform_stats: platformStats,
				dry_run: cfg.dryRun,
			},
			null,
			2,
		),
	);
};

main().catch((err) => {
	console.error(err?.stack || err?.message || err);
	process.exit(1);
});
