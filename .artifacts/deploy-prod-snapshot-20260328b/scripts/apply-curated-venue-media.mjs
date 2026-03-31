#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const arg = (name, fallback = "") => {
	const hit = process.argv.find((value) => value.startsWith(`${name}=`));
	return hit ? hit.slice(name.length + 1) : fallback;
};

const flag = (name) => process.argv.includes(name);

const cfg = {
	manifest: arg("--manifest", ""),
	bucket: arg("--bucket", "venue-media"),
	dryRun: flag("--dry-run"),
	force: flag("--force"),
	actor: arg("--actor", "curated-real-media-backfill"),
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

if (!cfg.manifest) {
	console.error("Missing --manifest=/abs/or/relative/path.json");
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const clean = (value) => String(value || "").trim();
const lower = (value) => clean(value).toLowerCase();
const isUrl = (value) => /^https?:\/\//i.test(clean(value));
const unique = (values) => [
	...new Set((values || []).map(clean).filter(Boolean)),
];

const normalizeUrl = (value) => {
	const raw = clean(value);
	if (!raw) return "";
	try {
		const url = new URL(raw);
		url.hash = "";
		return url.toString();
	} catch {
		return "";
	}
};

const normalizeYouTubeUrl = (value) => {
	const url = normalizeUrl(value);
	if (!url) return "";
	const parsed = new URL(url);
	const host = lower(parsed.hostname).replace(/^www\./, "");
	if (host === "youtu.be") {
		const id = clean(parsed.pathname).replace(/^\/+/, "").split("/")[0];
		return id ? `https://youtube.com/watch?v=${id}` : "";
	}
	if (host === "youtube.com" || host === "m.youtube.com") {
		if (parsed.pathname.startsWith("/watch")) {
			const id = clean(parsed.searchParams.get("v"));
			return id ? `https://youtube.com/watch?v=${id}` : "";
		}
		if (parsed.pathname.startsWith("/shorts/")) {
			const id = parsed.pathname.split("/").filter(Boolean)[1] || "";
			return id ? `https://youtube.com/shorts/${id}` : "";
		}
	}
	return "";
};

const extFrom = (source, contentType, kind) => {
	const fromPath = lower(source).match(
		/\.(jpe?g|png|webp|gif|avif|mp4|mov|webm)(?:\?|$)/,
	);
	if (fromPath) return fromPath[1] === "jpeg" ? "jpg" : fromPath[1];
	const ct = lower(contentType);
	if (ct.includes("jpeg")) return "jpg";
	if (ct.includes("png")) return "png";
	if (ct.includes("webp")) return "webp";
	if (ct.includes("gif")) return "gif";
	if (ct.includes("avif")) return "avif";
	if (ct.includes("webm")) return "webm";
	if (ct.includes("quicktime")) return "mov";
	if (ct.includes("mp4")) return "mp4";
	return kind === "image" ? "jpg" : "mp4";
};

const loadManifest = async () => {
	const abs = path.isAbsolute(cfg.manifest)
		? cfg.manifest
		: path.resolve(process.cwd(), cfg.manifest);
	const raw = await fs.readFile(abs, "utf8");
	const parsed = JSON.parse(raw);
	const rows = Array.isArray(parsed)
		? parsed
		: Array.isArray(parsed?.rows)
			? parsed.rows
			: [];
	return rows.filter((row) => lower(row?.decision || "apply") === "apply");
};

const ensureBucket = async () => {
	const buckets = await supabase.storage.listBuckets();
	if (buckets.error) throw new Error(buckets.error.message);
	if (buckets.data?.some((bucket) => bucket.id === cfg.bucket)) return;
	if (cfg.dryRun) return;
	const created = await supabase.storage.createBucket(cfg.bucket, {
		public: true,
		fileSizeLimit: 52_428_800,
		allowedMimeTypes: [
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/gif",
			"image/avif",
			"video/mp4",
			"video/webm",
			"video/quicktime",
		],
	});
	if (created.error) throw new Error(created.error.message);
};

const uploadCache = new Map();

const uploadAsset = async (source, kind) => {
	const normalized = clean(source);
	if (!normalized) return "";
	if (normalized.includes(`/storage/v1/object/public/${cfg.bucket}/`))
		return normalized;

	const cacheKey = `${kind}|${normalized}`;
	if (uploadCache.has(cacheKey)) return uploadCache.get(cacheKey);

	const task = (async () => {
		let body;
		let contentType = "";

		if (isUrl(normalized)) {
			const response = await fetch(normalized);
			if (!response.ok) {
				throw new Error(`download failed: ${response.status} ${normalized}`);
			}
			contentType = response.headers.get("content-type") || "";
			body = Buffer.from(await response.arrayBuffer());
		} else {
			const abs = path.isAbsolute(normalized)
				? normalized
				: path.resolve(process.cwd(), normalized);
			body = await fs.readFile(abs);
			contentType = kind === "image" ? "image/jpeg" : "video/mp4";
		}

		const ext = extFrom(normalized, contentType, kind);
		const objectPath = `${kind}s/${createHash("sha1").update(normalized).digest("hex")}.${ext}`;

		if (!cfg.dryRun) {
			const uploaded = await supabase.storage
				.from(cfg.bucket)
				.upload(objectPath, body, {
					upsert: true,
					contentType: contentType || undefined,
				});
			if (uploaded.error) throw new Error(uploaded.error.message);
		}

		return supabase.storage.from(cfg.bucket).getPublicUrl(objectPath).data
			.publicUrl;
	})();

	uploadCache.set(cacheKey, task);
	return task;
};

const fetchVenueMap = async (venueIds) => {
	const response = await supabase
		.from("venues")
		.select(
			"id,name,image_urls,video_url,website,fb_url,ig_url,tiktok_url,social_links",
		)
		.in("id", venueIds);
	if (response.error) throw new Error(response.error.message);
	return new Map((response.data || []).map((row) => [String(row.id), row]));
};

const buildOfficialSourceRows = (manifestRows) => {
	const flattened = [];
	for (const row of manifestRows) {
		const venueId = clean(row?.venue_id || row?.id);
		const sourceRows = Array.isArray(row?.official_sources)
			? row.official_sources
			: [];
		for (const source of sourceRows) {
			const sourceUrl = normalizeUrl(source?.source_url || source?.url);
			if (!venueId || !sourceUrl) continue;
			flattened.push({
				venue_id: venueId,
				source_url: sourceUrl,
				platform: clean(source?.platform),
				source_kind: clean(source?.source_kind || "profile"),
				source_handle: clean(source?.source_handle),
				verification_status: clean(
					source?.verification_status || "manual_verified",
				),
				verification_method: clean(
					source?.verification_method || "curated_high_priority_manual_review",
				),
				confidence: Number(source?.confidence || 100),
				priority: Number(source?.priority || 90),
				discovered_from: clean(
					source?.discovered_from || `manual_curated:${cfg.actor}`,
				),
				metadata:
					source?.metadata && typeof source.metadata === "object"
						? source.metadata
						: {
								backfill_batch: "20260328-high-priority-real-media",
								actor: cfg.actor,
							},
			});
		}
	}
	return flattened;
};

const mergeSocialLinks = (existing, incoming) => {
	const base =
		existing && typeof existing === "object" && !Array.isArray(existing)
			? { ...existing }
			: {};
	for (const [key, value] of Object.entries(incoming || {})) {
		if (clean(value)) base[key] = clean(value);
	}
	return base;
};

const equalJson = (left, right) =>
	JSON.stringify(left) === JSON.stringify(right);

const main = async () => {
	await ensureBucket();

	const manifestRows = await loadManifest();
	if (!manifestRows.length) {
		console.log(
			JSON.stringify({ rows: 0, applied: 0, dryRun: cfg.dryRun }, null, 2),
		);
		return;
	}

	const venueIds = manifestRows
		.map((row) => clean(row?.venue_id || row?.id))
		.filter(Boolean);
	const venueMap = await fetchVenueMap(venueIds);

	const officialSourceRows = buildOfficialSourceRows(manifestRows);
	if (officialSourceRows.length && !cfg.dryRun) {
		const rpc = await supabase.rpc("upsert_venue_official_sources", {
			p_rows: officialSourceRows,
		});
		if (rpc.error)
			throw new Error(
				rpc.error.message || "upsert_venue_official_sources failed",
			);
	}

	let updatedVenues = 0;
	let uploadedImages = 0;
	let uploadedVideos = 0;

	for (const row of manifestRows) {
		const venueId = clean(row?.venue_id || row?.id);
		const current = venueMap.get(venueId);
		if (!current) throw new Error(`Venue not found: ${venueId}`);

		const nextImages = [];
		for (const source of unique(row?.image_urls)) {
			const uploaded = await uploadAsset(source, "image");
			if (uploaded) {
				nextImages.push(uploaded);
				uploadedImages += 1;
			}
		}

		const mergedImages = unique(
			cfg.force
				? nextImages
				: [
						...(Array.isArray(current.image_urls) ? current.image_urls : []),
						...nextImages,
					],
		);

		let nextVideoUrl = clean(current.video_url);
		const requestedVideo = clean(row?.video_url || row?.Video_URL);
		if (requestedVideo) {
			const normalizedYoutube = normalizeYouTubeUrl(requestedVideo);
			if (normalizedYoutube) {
				nextVideoUrl = normalizedYoutube;
			} else {
				nextVideoUrl = await uploadAsset(requestedVideo, "video");
				uploadedVideos += 1;
			}
		}

		const nextWebsite = normalizeUrl(row?.website) || clean(current.website);
		const nextFacebook =
			normalizeUrl(row?.fb_url || row?.facebook_url) || clean(current.fb_url);
		const nextInstagram =
			normalizeUrl(row?.ig_url || row?.instagram_url) || clean(current.ig_url);
		const nextTiktok =
			normalizeUrl(row?.tiktok_url || row?.tt_url) || clean(current.tiktok_url);

		const nextSocialLinks = mergeSocialLinks(current.social_links, {
			website: nextWebsite,
			facebook: nextFacebook,
			instagram: nextInstagram,
			tiktok: nextTiktok,
		});

		const patch = {};
		if (
			!equalJson(
				mergedImages,
				Array.isArray(current.image_urls) ? current.image_urls : [],
			)
		) {
			patch.image_urls = mergedImages;
		}
		if (clean(nextVideoUrl) !== clean(current.video_url)) {
			patch.video_url = clean(nextVideoUrl) || null;
		}
		if (clean(nextWebsite) !== clean(current.website)) {
			patch.website = clean(nextWebsite) || null;
		}
		if (clean(nextFacebook) !== clean(current.fb_url)) {
			patch.fb_url = clean(nextFacebook) || null;
		}
		if (clean(nextInstagram) !== clean(current.ig_url)) {
			patch.ig_url = clean(nextInstagram) || null;
		}
		if (clean(nextTiktok) !== clean(current.tiktok_url)) {
			patch.tiktok_url = clean(nextTiktok) || null;
		}
		if (!equalJson(nextSocialLinks, current.social_links || {})) {
			patch.social_links = nextSocialLinks;
		}

		if (!Object.keys(patch).length) continue;
		updatedVenues += 1;
		if (!cfg.dryRun) {
			const updated = await supabase
				.from("venues")
				.update(patch)
				.eq("id", venueId);
			if (updated.error) throw new Error(updated.error.message);
		}
	}

	console.log(
		JSON.stringify(
			{
				rows: manifestRows.length,
				official_sources_upserted: officialSourceRows.length,
				updated_venues: updatedVenues,
				uploaded_images: uploadedImages,
				uploaded_videos: uploadedVideos,
				dry_run: cfg.dryRun,
			},
			null,
			2,
		),
	);
};

main().catch((error) => {
	console.error(error?.stack || error?.message || error);
	process.exit(1);
});
