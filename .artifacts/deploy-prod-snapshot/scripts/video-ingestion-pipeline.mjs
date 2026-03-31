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
const flag = (name) => process.argv.includes(name);

const cfg = {
	limit: Math.max(asNum(arg("--limit", "10000"), 10000), 1),
	offset: Math.max(asNum(arg("--offset", "0"), 0), 0),
	startId: arg("--start-id", ""),
	pageSize: Math.max(asNum(arg("--page-size", "1000"), 1000), 100),
	rpcChunk: Math.max(asNum(arg("--rpc-chunk", "250"), 250), 1),
	minAutoApprove: Math.max(
		Math.min(asNum(arg("--min-auto-approve", "88"), 88), 100),
		0,
	),
	minPendingReview: Math.max(
		Math.min(asNum(arg("--min-pending-review", "55"), 55), 100),
		0,
	),
	minAutoApply: Math.max(
		Math.min(asNum(arg("--min-auto-apply", "90"), 90), 100),
		0,
	),
	applyLimit: Math.max(asNum(arg("--apply-limit", "5000"), 5000), 0),
	manifest: arg("--manifest", ""),
	onlyMissing: !flag("--include-with-video"),
	includeExistingSeed: flag("--include-existing-seed"),
	useOfficialSources: !flag("--no-official-sources"),
	applyApproved: flag("--apply-approved"),
	skipDiscovery: flag("--skip-discovery"),
	crawlEnabled: !flag("--no-crawl"),
	crawlMaxRequests: Math.max(
		asNum(arg("--crawl-max-requests", "1200"), 1200),
		0,
	),
	crawlConcurrency: Math.max(asNum(arg("--crawl-concurrency", "8"), 8), 1),
	crawlTimeoutMs: Math.max(asNum(arg("--crawl-timeout-ms", "6000"), 6000), 1000),
	crawlMaxLinksPerSource: Math.max(
		asNum(arg("--crawl-max-links-per-source", "8"), 8),
		1,
	),
	dryRun: flag("--dry-run"),
	verbose: flag("--verbose"),
	actor: arg("--actor", "video-pipeline:auto"),
};
cfg.includeExistingSeed = cfg.includeExistingSeed || cfg.onlyMissing;

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

const nowIso = new Date().toISOString();
const clean = (v) => String(v || "").trim();
const lower = (v) => clean(v).toLowerCase();
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const unique = (arr) => [...new Set((arr || []).map(clean).filter(Boolean))];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const crawlCache = new Map();
let crawlRequestsUsed = 0;
let crawlLinksDiscovered = 0;
const HEARTBEAT_MS = 30_000;

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
	return "hosted";
};

const isVideoLikeUrl = (value) => {
	const url = safeUrl(value);
	if (!url) return false;
	const host = normalizeHostname(url.hostname);
	const platform = platformFromHost(host);
	if (platform !== "hosted" && platform !== "unknown") return true;
	const pathName = lower(url.pathname);
	return /\.(mp4|webm|m3u8|mov|ogv)(\?|$)/i.test(pathName);
};

const isVideoPostUrl = (value) => {
	const url = safeUrl(value);
	if (!url) return false;
	const host = normalizeHostname(url.hostname);
	const pathName = lower(url.pathname);
	if (host.includes("youtube.com")) {
		if (pathName.includes("/watch")) return Boolean(clean(url.searchParams.get("v")));
		if (pathName.includes("/shorts/")) return clean(pathName.split("/").filter(Boolean)[1]).length > 0;
		return false;
	}
	if (host.includes("youtu.be")) return clean(pathName.replace(/^\/+/, "").split("/")[0]).length > 0;
	if (host.includes("tiktok.com")) return pathName.includes("/video/");
	if (host.includes("instagram.com"))
		return (
			pathName.includes("/reel/") ||
			pathName.includes("/tv/")
		);
	if (host.includes("facebook.com")) {
		if (pathName.includes("/videos/") || pathName.includes("/reel/")) return true;
		if (pathName.includes("/watch")) return Boolean(clean(url.searchParams.get("v")));
		return false;
	}
	if (host.includes("fb.watch"))
		return clean(pathName.replace(/^\/+/, "").split("/")[0]).length > 0;
	if (host.includes("youtube.com") && pathName.includes("/embed/")) return true;
	return /\.(mp4|webm|m3u8|mov|ogv)(\?|$)/i.test(pathName);
};

const isSpecificVideoUrl = (value) => {
	const url = safeUrl(value);
	if (!url) return false;
	const host = normalizeHostname(url.hostname);
	const pathName = lower(url.pathname);
	if (host.includes("youtube.com")) {
		if (pathName.includes("/watch")) return Boolean(clean(url.searchParams.get("v")));
		if (pathName.includes("/shorts/")) return clean(pathName.split("/").filter(Boolean)[1]).length > 0;
		if (pathName.includes("/embed/")) return clean(pathName.split("/").filter(Boolean)[1]).length > 0;
		return false;
	}
	if (host.includes("youtu.be"))
		return clean(pathName.replace(/^\/+/, "").split("/")[0]).length > 0;
	if (host.includes("tiktok.com")) return /\/video\/\d+/i.test(pathName);
	if (host.includes("instagram.com"))
		return (
			/\/reel\/[^/]+/i.test(pathName) ||
			/\/tv\/[^/]+/i.test(pathName)
		);
	if (host.includes("facebook.com")) {
		if (/\/videos\/[^/]+/i.test(pathName) || /\/reel\/[^/]+/i.test(pathName)) return true;
		if (pathName.includes("/watch")) return Boolean(clean(url.searchParams.get("v")));
		return false;
	}
	if (host.includes("fb.watch"))
		return clean(pathName.replace(/^\/+/, "").split("/")[0]).length > 0;
	if (host.includes("vimeo.com"))
		return clean(pathName.replace(/^\/+/, "").split("/")[0]).length > 0;
	return /\.(mp4|webm|m3u8|mov|ogv)(\?|$)/i.test(pathName);
};

const isWeakSocialVideoUrl = (value) => {
	const url = safeUrl(value);
	if (!url) return false;
	const host = normalizeHostname(url.hostname);
	const pathName = lower(url.pathname);
	if (host.includes("facebook.com")) {
		if (pathName === "/watch" || pathName === "/watch/") return !clean(url.searchParams.get("v"));
	}
	return false;
};

const shouldRejectCandidateUrl = (value) => {
	if (!isSpecificVideoUrl(value)) return true;
	if (isWeakSocialVideoUrl(value)) return true;
	return false;
};

const normalizeVideoUrl = (value) => {
	const url = safeUrl(value);
	if (!url) return "";
	const host = normalizeHostname(url.hostname);

	if (host.includes("youtu.be")) {
		const videoId = clean(url.pathname).replace(/^\/+/, "").split("/")[0];
		return videoId ? `https://youtube.com/watch?v=${videoId}` : "";
	}
	if (host.includes("youtube.com")) {
		const pathName = clean(url.pathname);
		if (pathName.startsWith("/watch")) {
			const videoId = clean(url.searchParams.get("v"));
			return videoId ? `https://youtube.com/watch?v=${videoId}` : "";
		}
		if (pathName.startsWith("/shorts/")) {
			const id = pathName.split("/").filter(Boolean)[1] || "";
			return id ? `https://youtube.com/shorts/${id}` : "";
		}
		url.search = "";
		url.hash = "";
		return `https://${host}${url.pathname.replace(/\/+$/, "")}`;
	}
	if (host.includes("facebook.com")) {
		const pathName = clean(url.pathname);
		if (pathName.startsWith("/watch")) {
			const videoId = clean(url.searchParams.get("v"));
			return videoId ? `https://${host}/watch?v=${videoId}` : "";
		}
		url.search = "";
		url.hash = "";
		return `https://${host}${url.pathname.replace(/\/+$/, "")}`;
	}

	url.search = "";
	url.hash = "";
	return `https://${host}${url.pathname.replace(/\/+$/, "")}`;
};

const extractHandle = (value) => {
	const url = safeUrl(value);
	if (!url) return { platform: "unknown", handle: "", host: "" };
	const host = normalizeHostname(url.hostname);
	const platform = platformFromHost(host);
	const parts = url.pathname.split("/").filter(Boolean);
	let handle = "";

	if (platform === "instagram") {
		const first = parts[0] || "";
		if (first && !["p", "reel", "reels", "explore", "tv"].includes(lower(first))) {
			handle = first.replace(/^@/, "");
		}
	}
	if (platform === "tiktok") {
		const at = parts.find((p) => p.startsWith("@")) || "";
		handle = at.replace(/^@/, "");
	}
	if (platform === "youtube") {
		if (parts[0] === "@" || parts[0]?.startsWith("@")) {
			handle = (parts[0] === "@" ? parts[1] : parts[0]).replace(/^@/, "");
		} else if (["channel", "c", "user"].includes(parts[0])) {
			handle = parts[1] || "";
		}
	}
	if (platform === "facebook") {
		if (parts[0] && !["watch", "reel", "video", "videos"].includes(lower(parts[0]))) {
			handle = parts[0];
		}
	}

	return {
		platform,
		handle: lower(handle),
		host,
	};
};

const normalizeTextTokens = (value) =>
	unique(
		lower(value)
			.replace(/[^a-z0-9ก-๙]+/g, " ")
			.split(" ")
			.filter((x) => x.length >= 3),
	);

const countTokenHits = (target, tokens) => {
	const hay = lower(target);
	let hits = 0;
	for (const token of tokens) {
		if (token && hay.includes(token)) hits += 1;
	}
	return hits;
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
		/unknown column\s+['"`]?([\w_]+)['"`]?/i,
	];
	for (const re of patterns) {
		const match = text.match(re);
		if (match?.[1]) {
			return clean(match[1]).replace(/^["'`]|["'`]$/g, "");
		}
	}
	return "";
};

const isMissingTableError = (errorLike, tableName) => {
	const text = [
		errorLike?.message,
		errorLike?.details,
		errorLike?.hint,
		errorLike?.error_description,
	]
		.map((x) => lower(x))
		.filter(Boolean)
		.join(" | ");
	if (!text) return false;
	return (
		text.includes(lower(tableName)) &&
		(text.includes("does not exist") ||
			text.includes("could not find the table") ||
			text.includes("relation"))
	);
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

const tokenToColumnName = (token) => clean(token).replace(/^["'`]|["'`]$/g, "");

const isProtectedSelectColumn = (columnName) => {
	const key = lower(columnName);
	return ["id", "name"].includes(key);
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
	return isUrl(str) ? [{ key: "url", value: str }] : [];
};

const manifestKeyList = (row) =>
	unique([row?.id, row?.venue_id, row?.slug, row?.short_code, lower(row?.name)]);

const loadManifestMap = async () => {
	if (!cfg.manifest) return new Map();
	const abs = path.isAbsolute(cfg.manifest)
		? cfg.manifest
		: path.resolve(process.cwd(), cfg.manifest);
	const raw = await fs.readFile(abs, "utf8");
	const parsed = JSON.parse(raw);
	const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
	const out = new Map();
	for (const row of rows) {
		for (const key of manifestKeyList(row)) {
			if (key) out.set(lower(key), row);
		}
	}
	return out;
};

const getManifestRow = (venue, map) => {
	if (!(map instanceof Map) || map.size === 0) return null;
	const keys = unique([venue?.id, venue?.slug, venue?.short_code, lower(venue?.name)]);
	for (const key of keys) {
		const found = map.get(lower(key));
		if (found) return found;
	}
	return null;
};

const buildOfficialSignals = (venue, officialRows = []) => {
	const links = parseSocialLinks(venue?.social_links);
	if (clean(venue?.website)) links.push({ key: "website", value: clean(venue.website) });
	for (const row of officialRows) {
		const url = clean(row?.normalized_source_url || row?.source_url);
		if (!url) continue;
		links.push({
			key: lower(row?.platform || "official"),
			value: url,
			handle: clean(row?.source_handle),
			domain: clean(row?.source_domain),
		});
	}

	const officialUrls = new Set();
	const handlesByPlatform = new Map();
	let websiteDomain = "";

	for (const link of links) {
		if (!isUrl(link.value)) continue;
		const normalized = normalizeVideoUrl(link.value);
		if (normalized) officialUrls.add(normalized);
		const info = extractHandle(link.value);
		const explicitHandle = lower(link?.handle || "");
		const resolvedHandle = explicitHandle || info.handle;
		if (info.platform && info.platform !== "unknown" && info.handle) {
			if (!handlesByPlatform.has(info.platform)) handlesByPlatform.set(info.platform, new Set());
			handlesByPlatform.get(info.platform).add(info.handle);
		}
		if (info.platform && info.platform !== "unknown" && resolvedHandle) {
			if (!handlesByPlatform.has(info.platform)) handlesByPlatform.set(info.platform, new Set());
			handlesByPlatform.get(info.platform).add(resolvedHandle);
		}
		if (link.key === "website") {
			const u = safeUrl(link.value);
			if (u) websiteDomain = normalizeHostname(u.hostname);
		}
		if (!websiteDomain && clean(link?.domain)) {
			const domain = normalizeHostname(link.domain);
			if (domain) websiteDomain = domain;
		}
	}

	return {
		officialUrls,
		handlesByPlatform,
		websiteDomain,
	};
};

const extractCandidateLinksFromHtml = (html, baseUrl) => {
	const out = new Set();
	const text = String(html || "");
	if (!text) return [];

	for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)) {
		const url = clean(match?.[0] || "");
		if (url) out.add(url);
	}

	for (const match of text.matchAll(/(?:href|src|content)\s*=\s*["']([^"']+)["']/gi)) {
		const raw = clean(match?.[1] || "");
		if (!raw) continue;
		if (/^(data:|javascript:|mailto:|tel:)/i.test(raw)) continue;
		try {
			const resolved = new URL(raw, baseUrl).toString();
			out.add(resolved);
		} catch {}
	}

	return unique(
		[...out].filter((url) => {
			if (!isUrl(url)) return false;
			if (shouldRejectCandidateUrl(url)) return false;
			return true;
		}),
	);
};

const fetchHtml = async (sourceUrl) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), cfg.crawlTimeoutMs);
	try {
		const response = await fetch(sourceUrl, {
			redirect: "follow",
			signal: controller.signal,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (compatible; VibeCityVideoIngestion/1.0; +https://vibecity.live)",
			},
		});
		if (!response.ok) return "";
		const contentType = lower(response.headers.get("content-type") || "");
		if (!contentType.includes("html") && !contentType.includes("xml")) return "";
		const html = await response.text();
		return String(html || "").slice(0, 2_500_000);
	} catch {
		return "";
	} finally {
		clearTimeout(timeout);
	}
};

const discoverFromSource = async (source) => {
	if (!cfg.crawlEnabled) return [];
	if (!source?.url || !isUrl(source.url)) return [];
	const normalizedSource = normalizeVideoUrl(source.url);
	if (!normalizedSource) return [];
	if (crawlCache.has(normalizedSource)) return crawlCache.get(normalizedSource);
	if (crawlRequestsUsed >= cfg.crawlMaxRequests) return [];
	crawlRequestsUsed += 1;

	const task = (async () => {
		const html = await fetchHtml(normalizedSource);
		if (!html) return [];
		const links = extractCandidateLinksFromHtml(html, normalizedSource).slice(
			0,
			cfg.crawlMaxLinksPerSource,
		);
		crawlLinksDiscovered += links.length;
		return links.map((videoUrl) => ({
			videoUrl,
			sourceType: `${source.sourceType || "source"}_crawl`,
			sourceUrl: normalizedSource,
			linkKey: source.linkKey || null,
		}));
	})();

	crawlCache.set(normalizedSource, task);
	return task;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
	if (!Array.isArray(items) || !items.length) return [];
	const maxConcurrency = Math.max(1, Math.min(concurrency, items.length));
	const out = new Array(items.length);
	let index = 0;
	const worker = async () => {
		while (true) {
			const current = index;
			index += 1;
			if (current >= items.length) return;
			out[current] = await mapper(items[current], current);
		}
	};
	await Promise.all(Array.from({ length: maxConcurrency }, () => worker()));
	return out;
};

const buildSeedList = (venue, manifestRow, officialRows = []) => {
	const seeds = [];
	const crawlSources = [];
	const add = (videoUrl, sourceType, sourceUrl = "", extra = {}) => {
		const cleaned = clean(videoUrl);
		if (!cleaned || !isUrl(cleaned)) return;
		seeds.push({
			videoUrl: cleaned,
			sourceType,
			sourceUrl: clean(sourceUrl) || cleaned,
			...extra,
		});
	};
	const addCrawlSource = (url, sourceType, extra = {}) => {
		const cleaned = clean(url);
		if (!cleaned || !isUrl(cleaned)) return;
		crawlSources.push({
			url: cleaned,
			sourceType,
			...extra,
		});
	};

	const links = parseSocialLinks(venue?.social_links);
	for (const link of links) {
		if (!isUrl(link.value)) continue;
		if (isVideoLikeUrl(link.value) && isVideoPostUrl(link.value)) {
			add(link.value, "social_link", link.value, { linkKey: link.key });
		} else {
			addCrawlSource(link.value, "social_link", { linkKey: link.key });
		}
	}

	if (isVideoLikeUrl(venue?.website) && isVideoPostUrl(venue?.website)) {
		add(venue.website, "website", venue.website, { linkKey: "website" });
	} else if (isUrl(venue?.website)) {
		addCrawlSource(venue.website, "website", { linkKey: "website" });
	}

	if (cfg.includeExistingSeed) {
		const existing = clean(venue?.video_url || venue?.Video_URL);
		if (isVideoLikeUrl(existing)) {
			add(existing, "venue_existing", existing);
		}
	}

	for (const sourceRow of officialRows) {
		const sourceUrl = clean(sourceRow?.normalized_source_url || sourceRow?.source_url);
		if (!isUrl(sourceUrl)) continue;
		const sourceKind = lower(sourceRow?.source_kind || "profile");
		const sourceType = sourceKind === "video" ? "official_source_video" : "official_source";
		if (isVideoLikeUrl(sourceUrl) && isVideoPostUrl(sourceUrl)) {
			add(sourceUrl, sourceType, sourceUrl, { linkKey: lower(sourceRow?.platform || "official") });
		} else {
			addCrawlSource(sourceUrl, sourceType, { linkKey: lower(sourceRow?.platform || "official") });
		}
	}

	if (manifestRow && typeof manifestRow === "object") {
		const manifestVideos = unique([
			...(Array.isArray(manifestRow.video_urls) ? manifestRow.video_urls : []),
			manifestRow.video_url,
			manifestRow.Video_URL,
		]);
		for (const videoUrl of manifestVideos) {
			add(videoUrl, "manifest", clean(manifestRow.source_url || manifestRow.source || videoUrl), {
				manifestVerified: Boolean(manifestRow.source_verified || manifestRow.verified),
			});
		}
	}

	return {
		seeds,
		crawlSources: unique(crawlSources.map((x) => JSON.stringify(x))).map((x) =>
			JSON.parse(x),
		),
	};
};

const scoreSeed = (seed, venue, official, nameTokens) => {
	const normalizedVideoUrl = normalizeVideoUrl(seed.videoUrl);
	if (!normalizedVideoUrl) return null;
	if (shouldRejectCandidateUrl(normalizedVideoUrl)) return null;

	const urlObj = safeUrl(normalizedVideoUrl);
	if (!urlObj) return null;
	const host = normalizeHostname(urlObj.hostname);
	const platform = platformFromHost(host);
	const sourceNormalized = normalizeVideoUrl(seed.sourceUrl || seed.videoUrl);
	const sourceMeta = extractHandle(seed.sourceUrl || seed.videoUrl);
	const tokenHits = countTokenHits(normalizedVideoUrl, nameTokens);

	let sourceVerified = false;
	let sourceVerificationMethod = "none";

	if (seed.manifestVerified) {
		sourceVerified = true;
		sourceVerificationMethod = "manifest_verified";
	} else if (official.officialUrls.has(sourceNormalized) || official.officialUrls.has(normalizedVideoUrl)) {
		sourceVerified = true;
		sourceVerificationMethod = "exact_source_link";
	} else if (
		sourceMeta.handle &&
		official.handlesByPlatform.get(sourceMeta.platform)?.has(sourceMeta.handle)
	) {
		sourceVerified = true;
		sourceVerificationMethod = "social_handle_match";
	} else if (official.websiteDomain && host === official.websiteDomain) {
		sourceVerified = true;
		sourceVerificationMethod = "website_domain_match";
	}

	let qualityScore = 0;
	if (urlObj.protocol === "https:") qualityScore += 10;
	if (["youtube", "instagram", "tiktok", "facebook", "vimeo"].includes(platform)) qualityScore += 35;
	if (isVideoPostUrl(normalizedVideoUrl)) qualityScore += 30;
	if (seed.sourceType === "manifest") qualityScore += 15;
	if (String(seed.sourceType || "").startsWith("official_source")) qualityScore += 15;
	qualityScore = clamp(qualityScore);

	let matchScore = 0;
	if (isVideoLikeUrl(normalizedVideoUrl)) matchScore += 20;
	if (sourceVerified) matchScore += 45;
	if (seed.sourceType === "manifest") matchScore += 20;
	if (seed.sourceType === "social_link") matchScore += 12;
	if (seed.sourceType === "venue_existing") matchScore += 8;
	if (seed.sourceType === "official_source") matchScore += 18;
	if (seed.sourceType === "official_source_video") matchScore += 25;
	if (tokenHits > 0) matchScore += Math.min(15, tokenHits * 5);
	if (qualityScore >= 60) matchScore += 8;
	matchScore = clamp(matchScore);

	let confidenceScore = clamp(Math.round(matchScore * 0.65 + qualityScore * 0.35));
	if (
		(String(seed.sourceType || "").includes("crawl") ||
			String(seed.sourceType || "").startsWith("official_source")) &&
		tokenHits === 0
	) {
		confidenceScore = Math.min(confidenceScore, cfg.minAutoApprove - 1);
	}
	let status = "pending_review";
	let reviewedBy = null;
	let reviewedAt = null;
	let reviewNote = null;

	if (confidenceScore < cfg.minPendingReview) {
		status = "invalid";
	} else if (sourceVerified && confidenceScore >= cfg.minAutoApprove) {
		status = "approved";
		reviewedBy = cfg.actor;
		reviewedAt = nowIso;
		reviewNote = `auto-approved (${sourceVerificationMethod})`;
	}

	return {
		video_url: normalizedVideoUrl,
		normalized_video_url: normalizedVideoUrl,
		platform,
		source_type: seed.sourceType || "unknown",
		source_url: sourceNormalized || normalizedVideoUrl,
		source_domain: host,
		source_handle: sourceMeta.handle || null,
		source_verified: sourceVerified,
		source_verification_method: sourceVerificationMethod,
		match_score: matchScore,
		confidence_score: confidenceScore,
		quality_score: qualityScore,
		status,
		review_note: reviewNote,
		reviewed_by: reviewedBy,
		reviewed_at: reviewedAt,
		discovered_at: nowIso,
		matching_signals: {
			name_token_hits: tokenHits,
			source_platform: sourceMeta.platform,
			source_type: seed.sourceType || "unknown",
			link_key: seed.linkKey || null,
		},
		metadata: {
			actor: cfg.actor,
			discovery_mode: "video-ingestion-pipeline",
		},
	};
};

const fetchVenues = async () => {
	const out = [];
	const selectColumns = [
		"id",
		"name",
		"slug",
		"short_code",
		"category",
		"province",
		"district",
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
			if (!selectColumns.length) {
				throw new Error("failed to fetch venues: no selectable columns left");
			}
			const selectExpr = selectColumns.join(",");
			let query = supabase.from("venues").select(selectExpr).order("id", { ascending: true });
			if (lastSeenId) {
				query = query.gt("id", lastSeenId);
			}
			query = query.limit(dynamicPageSize);

			const { data, error } = await withSchemaRetry(() => query, {
				attempts: 5,
				baseDelayMs: 300,
			});

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
				const removable = selectColumns.find((token) => {
					const col = tokenToColumnName(token);
					return lower(col) === target && !isProtectedSelectColumn(col);
				});
				if (removable) {
					const next = selectColumns.filter((token) => token !== removable);
					selectColumns.length = 0;
					selectColumns.push(...next);
					if (cfg.verbose) {
						console.warn(
							`fetchVenues: column "${missingColumn}" missing, retrying without it`,
						);
					}
					continue;
				}
			}

			const message = lower(error?.message || "");
			if (
				(message.includes("statement timeout") || message.includes("upstream request timeout")) &&
				dynamicPageSize > 50
			) {
				dynamicPageSize = Math.max(50, Math.floor(dynamicPageSize / 2));
				if (cfg.verbose) {
					console.warn(
						`fetchVenues: timeout, reducing page-size to ${dynamicPageSize}`,
					);
				}
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

const fetchOfficialSourcesForVenues = async (venueIds) => {
	const out = new Map();
	if (!cfg.useOfficialSources) return out;
	const ids = unique((venueIds || []).map(clean));
	if (!ids.length) return out;

	const chunkSize = 100;
	for (let i = 0; i < ids.length; i += chunkSize) {
		const chunk = ids.slice(i, i + chunkSize);
		if (!chunk.length) continue;

		let data = null;
		let error = null;
		for (let attempt = 0; attempt < 4; attempt += 1) {
			try {
				const res = await withSchemaRetry(
					() =>
						supabase
							.from("venue_official_sources")
							.select(
								"venue_id,platform,source_kind,source_url,normalized_source_url,source_domain,source_handle,verification_status,is_active,priority",
							)
							.in("venue_id", chunk)
							.eq("is_active", true)
							.in("verification_status", ["verified", "manual_verified", "auto_verified"])
							.order("priority", { ascending: false }),
					{ attempts: 5, baseDelayMs: 300 },
				);
				data = res?.data || null;
				error = res?.error || null;
				if (!error) break;
			} catch (err) {
				error = err;
			}
			if (attempt < 3) {
				await sleep((attempt + 1) * 250);
			}
		}

		if (error) {
			if (isMissingTableError(error, "venue_official_sources")) {
				if (cfg.verbose) {
					console.warn(
						"venue_official_sources table not found; run migration 20260226180000_venue_official_sources_catalog.sql",
					);
				}
				return new Map();
			}
			throw new Error(error.message || "failed to fetch venue_official_sources");
		}

		for (const row of data || []) {
			const venueId = clean(row?.venue_id);
			if (!venueId) continue;
			if (!out.has(venueId)) out.set(venueId, []);
			out.get(venueId).push(row);
		}
	}

	return out;
};

const upsertCandidatesChunk = async (rows) => {
	if (!rows.length) return 0;
	const { data, error } = await withSchemaRetry(
		() =>
			supabase.rpc("upsert_venue_video_candidates", {
				p_rows: rows,
			}),
		{ attempts: 5, baseDelayMs: 300 },
	);
	if (error) throw new Error(error.message || "upsert_venue_video_candidates failed");
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

const main = async () => {
	console.log(JSON.stringify({ mode: "video-ingestion-pipeline", ...cfg }));
	const startedAt = Date.now();
	let lastHeartbeatAt = startedAt;
	let venues = [];
	if (!cfg.skipDiscovery) {
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
	}
	const manifestMap = cfg.skipDiscovery ? new Map() : await loadManifestMap();
	const officialSourcesByVenue = cfg.skipDiscovery
		? new Map()
		: await fetchOfficialSourcesForVenues(
				venues.map((venue) => clean(venue?.id)).filter(Boolean),
			);
	let officialSourcesLoaded = 0;
	for (const rows of officialSourcesByVenue.values()) {
		officialSourcesLoaded += Array.isArray(rows) ? rows.length : 0;
	}

	let prepared = 0;
	let approvedAuto = 0;
	let pendingReview = 0;
	let invalid = 0;
	let upserted = 0;
	let venuesEligible = 0;
	let venuesSkippedHasVideo = 0;

	const buffer = [];
	for (let i = 0; i < venues.length; i += 1) {
		const venue = venues[i];
		const venueId = clean(venue?.id);
		if (!venueId) continue;
		if (cfg.onlyMissing) {
			const hasVideo = clean(venue?.video_url || venue?.Video_URL);
			if (hasVideo) {
				venuesSkippedHasVideo += 1;
				continue;
			}
		}
		venuesEligible += 1;

		const nameTokens = normalizeTextTokens(
			[venue?.name, venue?.slug, venue?.short_code, venue?.category].filter(Boolean).join(" "),
		);
		const manifestRow = getManifestRow(venue, manifestMap);
		const officialRows = officialSourcesByVenue.get(venueId) || [];
		const official = buildOfficialSignals(venue, officialRows);
		const seedPack = buildSeedList(venue, manifestRow, officialRows);
		const seeds = [...(seedPack?.seeds || [])];
		const crawlSources = seedPack?.crawlSources || [];
		if (crawlSources.length && cfg.crawlEnabled && crawlRequestsUsed < cfg.crawlMaxRequests) {
			const discoveredGroups = await mapWithConcurrency(
				crawlSources,
				cfg.crawlConcurrency,
				async (source) => {
					if (crawlRequestsUsed >= cfg.crawlMaxRequests) return [];
					return discoverFromSource(source);
				},
			);
			for (const discoveredSeeds of discoveredGroups) {
				for (const discovered of discoveredSeeds || []) seeds.push(discovered);
			}
		}

		const seen = new Set();
		for (const seed of seeds) {
			const scored = scoreSeed(seed, venue, official, nameTokens);
			if (!scored || !scored.normalized_video_url) continue;
			if (seen.has(scored.normalized_video_url)) continue;
			seen.add(scored.normalized_video_url);

			const row = {
				venue_id: venueId,
				...scored,
			};
			buffer.push(row);
			prepared += 1;
			if (row.status === "approved") approvedAuto += 1;
			else if (row.status === "pending_review") pendingReview += 1;
			else invalid += 1;

			if (!cfg.dryRun && buffer.length >= cfg.rpcChunk) {
				upserted += await upsertCandidatesChunk(buffer.splice(0, buffer.length));
			}
		}

		const now = Date.now();
		if (cfg.verbose && (i + 1) % 500 === 0) {
			console.log(
				`processed=${i + 1}/${venues.length} prepared=${prepared} upserted=${upserted} crawl=${crawlRequestsUsed}/${cfg.crawlMaxRequests}`,
			);
		} else if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
			const elapsedSec = Math.round((now - startedAt) / 1000);
			console.log(
				`heartbeat elapsed=${elapsedSec}s processed=${i + 1}/${venues.length} prepared=${prepared} upserted=${upserted} crawl=${crawlRequestsUsed}/${cfg.crawlMaxRequests}`,
			);
			lastHeartbeatAt = now;
		}
	}

	if (!cfg.dryRun && buffer.length) {
		upserted += await upsertCandidatesChunk(buffer.splice(0, buffer.length));
	}

	let applySummary = null;
	if (!cfg.dryRun && cfg.applyApproved) {
		applySummary = await applyApproved();
	}

	const summary = {
		venues_scanned: venues.length,
		venues_eligible: venuesEligible,
		venues_skipped_has_video: venuesSkippedHasVideo,
		candidates_prepared: prepared,
		approved_auto: approvedAuto,
		pending_review: pendingReview,
		invalid,
		candidates_upserted: cfg.dryRun ? 0 : upserted,
		crawl_enabled: cfg.crawlEnabled,
		official_sources_enabled: cfg.useOfficialSources,
		official_sources_loaded: officialSourcesLoaded,
		crawl_requests_used: crawlRequestsUsed,
		crawl_links_discovered: crawlLinksDiscovered,
		apply: applySummary,
		dry_run: cfg.dryRun,
	};
	console.log(JSON.stringify(summary, null, 2));
};

main().catch((err) => {
	console.error(err?.stack || err?.message || err);
	process.exit(1);
});
