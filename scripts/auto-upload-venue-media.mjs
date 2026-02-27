#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const arg = (name, fallback = "") => {
	const hit = process.argv.find((x) => x.startsWith(`${name}=`));
	return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const cfg = {
	bucket: arg("--bucket", "venue-media"),
	dryRun: process.argv.includes("--dry-run"),
	force: process.argv.includes("--force"),
	limit: Number(arg("--limit", "0")) || 0,
	concurrency: Math.max(Number(arg("--concurrency", "4")) || 4, 1),
	manifest: arg("--manifest", ""),
	autofill: process.argv.includes("--autofill"),
	useWiki: process.argv.includes("--use-wiki"),
	jsonLine: process.argv.includes("--json-line"),
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
const mapboxToken = clean(process.env.VITE_MAPBOX_TOKEN);
const isUrl = (v) => /^https?:\/\//i.test(clean(v));
const dedupe = (arr) => [...new Set(arr.map(clean).filter(Boolean))];
const isBucketUrl = (v) =>
	clean(v).includes(`/storage/v1/object/public/${cfg.bucket}/`);

const extFrom = (source, contentType, kind) => {
	const fromPath = clean(source).toLowerCase().match(/\.(jpe?g|png|webp|gif|avif|mp4|mov|webm)$/);
	if (fromPath) return fromPath[1] === "jpeg" ? "jpg" : fromPath[1];
	const ct = clean(contentType).toLowerCase();
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

const runPool = async (items, concurrency, work) => {
	let index = 0;
	const workers = Array.from({ length: concurrency }, async () => {
		while (index < items.length) {
			const i = index++;
			await work(items[i], i);
		}
	});
	await Promise.all(workers);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ensureBucket = async () => {
	const buckets = await supabase.storage.listBuckets();
	if (buckets.error) throw new Error(buckets.error.message);
	if (buckets.data?.some((b) => b.id === cfg.bucket)) return;
	if (cfg.dryRun) return;
	const created = await supabase.storage.createBucket(cfg.bucket, {
		public: true,
		fileSizeLimit: 52428800,
		allowedMimeTypes: [
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/gif",
			"video/mp4",
			"video/webm",
			"video/quicktime",
		],
	});
	if (created.error) throw new Error(created.error.message);
};

const loadManifestMap = async () => {
	if (!cfg.manifest) return new Map();
	const raw = await fs.readFile(cfg.manifest, "utf8");
	const rows = JSON.parse(raw);
	const out = new Map();
	for (const row of Array.isArray(rows) ? rows : rows.rows || []) {
		const keys = [row.id, row.venue_id, row.slug, row.short_code, clean(row.name).toLowerCase()];
		for (const k of keys.filter(Boolean)) out.set(clean(k).toLowerCase(), row);
	}
	return out;
};

const fetchCandidates = async () => {
	let from = 0;
	const step = 1000;
	const out = [];
	const want = cfg.limit > 0 ? cfg.limit : Number.POSITIVE_INFINITY;
	const isMissing = (row) => {
		const noImage =
			(!Array.isArray(row.image_urls) || row.image_urls.length === 0) &&
			!clean(row.Image_URL1);
		const noVideo = !clean(row.Video_URL);
		return noImage || noVideo;
	};
	while (true) {
		let query = supabase
			.from("venues")
			.select(
				'id,name,slug,short_code,category,province,latitude,longitude,image_urls,"Image_URL1","Video_URL"',
			)
			.order("id", { ascending: true })
			.range(from, from + step - 1);
		if (!cfg.autofill) {
			query = query.or('"Video_URL".not.is.null,"Image_URL1".not.is.null,image_urls.neq.{}');
		}
		const q = await query;
		if (q.error) throw new Error(q.error.message);
		const batch = q.data || [];
		if (!batch.length) break;
		if (cfg.autofill) {
			for (const row of batch) {
				if (isMissing(row)) out.push(row);
				if (out.length >= want) break;
			}
		} else {
			out.push(...batch);
		}
		if (out.length >= want) break;
		if (batch.length < step) break;
		from += step;
	}
	return cfg.limit > 0 ? out.slice(0, cfg.limit) : out;
};

const cache = new Map();
const wikiCache = new Map();
const upload = async (source, kind) => {
	const src = clean(source);
	if (!src) return "";
	if (!cfg.force && isBucketUrl(src)) return src;
	const key = `${kind}|${src}`;
	if (cache.has(key)) return cache.get(key);

	const promise = (async () => {
		let body;
		let contentType = "";
		if (isUrl(src)) {
			const res = await fetch(src);
			if (!res.ok) throw new Error(`download ${res.status} ${src}`);
			contentType = res.headers.get("content-type") || "";
			body = Buffer.from(await res.arrayBuffer());
		} else {
			const abs = path.isAbsolute(src) ? src : path.resolve(process.cwd(), src);
			body = await fs.readFile(abs);
			contentType = kind === "image" ? "image/jpeg" : "video/mp4";
		}
		const ext = extFrom(src, contentType, kind);
		const objectPath = `${kind}s/${createHash("sha1").update(src).digest("hex")}.${ext}`;
		if (!cfg.dryRun) {
			const up = await supabase.storage.from(cfg.bucket).upload(objectPath, body, {
				upsert: true,
				contentType: contentType || undefined,
			});
			if (up.error) throw new Error(up.error.message);
		}
		return supabase.storage.from(cfg.bucket).getPublicUrl(objectPath).data.publicUrl;
	})();

	cache.set(key, promise);
	return promise;
};

const fromWiki = async (venue) => {
	const name = clean(venue.name);
	if (!name) return "";
	const province = clean(venue.province);
	const cacheKey = `${name}|${province}`.toLowerCase();
	if (wikiCache.has(cacheKey)) return wikiCache.get(cacheKey);
	const candidates = dedupe([name, `${name} (${province})`, `${name}, ${province}`]);
	const fromPage = async (host, title) => {
		const url = `https://${host}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&titles=${encodeURIComponent(title)}`;
		const r = await fetch(url, { headers: { "User-Agent": "vibecity-media-bot/1.0" } });
		if (!r.ok) return "";
		const j = await r.json();
		const pages = Object.values(j?.query?.pages || {});
		return clean(pages?.[0]?.original?.source);
	};
	const promise = (async () => {
		for (const t of candidates) {
			for (const host of ["en", "th"]) {
				try {
					const image = await fromPage(host, t);
					if (image) return image;
				} catch {}
			}
		}
		return "";
	})();
	wikiCache.set(cacheKey, promise);
	return promise;
};

const mapboxStatic = (venue) => {
	if (!mapboxToken) return "";
	const lat = Number(venue.latitude);
	const lng = Number(venue.longitude);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
	return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+f43f5e(${lng},${lat})/${lng},${lat},15,0/1280x720?access_token=${mapboxToken}`;
};

const keyFromVenue = (v) => [
	clean(v.id).toLowerCase(),
	clean(v.slug).toLowerCase(),
	clean(v.short_code).toLowerCase(),
	clean(v.name).toLowerCase(),
].filter(Boolean);

const main = async () => {
	console.log(JSON.stringify(cfg));
	await ensureBucket();
	const manifestMap = await loadManifestMap();
	const venues = await fetchCandidates();
	const updates = [];
	let uploadedVideos = 0;
	let uploadedImages = 0;
	let failedUpdates = 0;

	await runPool(venues, cfg.concurrency, async (venue, i) => {
		const manifest =
			keyFromVenue(venue).map((k) => manifestMap.get(k)).find(Boolean) || {};
		let videoSource = clean(manifest.Video_URL || manifest.video_url || venue.Video_URL);
		let imageSources = dedupe([
			...(Array.isArray(manifest.image_urls) ? manifest.image_urls : []),
			manifest.Image_URL1 || manifest.image_url || "",
			...(Array.isArray(venue.image_urls) ? venue.image_urls : []),
			venue.Image_URL1 || "",
		]);
		const hasImage = imageSources.length > 0;

		if (cfg.autofill && !hasImage) {
			const mapbox = mapboxStatic(venue);
			const wiki = cfg.useWiki && !mapbox ? await fromWiki(venue) : "";
			imageSources = dedupe([mapbox, wiki]);
		}

		const patch = { id: venue.id };
		let changed = false;

		if (videoSource) {
			try {
				const videoUrl = await upload(videoSource, "video");
				if (videoUrl && (cfg.force || videoUrl !== clean(venue.Video_URL))) {
					patch.Video_URL = videoUrl;
					changed = true;
					uploadedVideos += 1;
				}
			} catch {}
		}

		const outImages = [];
		for (const src of imageSources) {
			try {
				const imageUrl = await upload(src, "image");
				if (imageUrl) {
					outImages.push(imageUrl);
					uploadedImages += 1;
				}
			} catch {}
		}
		if (outImages.length) {
			const next = dedupe(outImages);
			const prev = dedupe(Array.isArray(venue.image_urls) ? venue.image_urls : []);
			if (cfg.force || JSON.stringify(next) !== JSON.stringify(prev)) {
				patch.image_urls = next;
				patch.Image_URL1 = next[0] || null;
				changed = true;
			}
		}

		if (changed) updates.push(patch);
		if ((i + 1) % 50 === 0) {
			console.log(`processed=${i + 1}/${venues.length} pending_updates=${updates.length}`);
		}
	});

	if (!cfg.dryRun) {
		await runPool(updates, 8, async (u) => {
			const { id, ...body } = u;
			let ok = false;
			for (let i = 0; i < 3 && !ok; i += 1) {
				const res = await supabase.from("venues").update(body).eq("id", id);
				if (!res.error) {
					ok = true;
					break;
				}
				if (i < 2) await sleep(250 * (i + 1));
			}
			if (!ok) failedUpdates += 1;
		});
	}

	const summary = {
		venues_scanned: venues.length,
		venues_updated: updates.length,
		uploaded_videos: uploadedVideos,
		uploaded_images: uploadedImages,
		failed_updates: failedUpdates,
		dry_run: cfg.dryRun,
	};
	console.log(cfg.jsonLine ? JSON.stringify(summary) : JSON.stringify(summary, null, 2));
};

main().catch((err) => {
	console.error(err?.stack || err?.message || err);
	process.exit(1);
});
