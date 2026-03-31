#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const OUTPUT_SNAPSHOT_PATH = path.join(
	REPO_ROOT,
	"public/data/venues-localhost-snapshot.json",
);
const OUTPUT_MEDIA_INDEX_PATH = path.join(
	REPO_ROOT,
	"public/data/venues-real-media-index.json",
);
const FALLBACK_STALE_VENUE_PATH = path.join(
	REPO_ROOT,
	"scripts/prerender-data/venues-public-stale.json",
);

dotenv.config({ path: path.join(REPO_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(REPO_ROOT, ".env"), quiet: true });

const supabaseUrl =
	process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	process.env.SUPABASE_ANON_KEY ||
	process.env.VITE_SUPABASE_ANON_KEY ||
	"";
const canUseSupabaseSnapshot = Boolean(supabaseUrl && supabaseKey);
const supabase = canUseSupabaseSnapshot
	? createClient(supabaseUrl, supabaseKey, {
			auth: { persistSession: false, autoRefreshToken: false },
		})
	: null;

const THAILAND_BOUNDS = Object.freeze({
	minLat: 5.5,
	maxLat: 20.9,
	minLng: 97.2,
	maxLng: 105.8,
});
const LOCALHOST_DEV_REFERENCE_POINT = Object.freeze({
	lat: 15.87,
	lng: 100.9925,
});
const LOCALHOST_MAJOR_CITY_ANCHORS = Object.freeze([
	{ key: "bangkok", lat: 13.7563, lng: 100.5018, quota: 28 },
	{ key: "chiang-mai", lat: 18.7883, lng: 98.9853, quota: 16 },
	{ key: "korat", lat: 14.9799, lng: 102.0977, quota: 12 },
	{ key: "khon-kaen", lat: 16.4419, lng: 102.835, quota: 12 },
	{ key: "pattaya", lat: 12.9236, lng: 100.8825, quota: 12 },
	{ key: "phuket", lat: 7.8804, lng: 98.3923, quota: 12 },
	{ key: "hat-yai", lat: 7.0084, lng: 100.4747, quota: 12 },
]);
const NON_THAI_PROVINCE_ALIASES = new Set([
	"can tho",
	"cần thơ",
	"hanoi",
	"kien giang",
	"long an",
	"nghệ an",
	"ninh bình",
	"sóc trăng",
	"tây ninh",
	"thanh hoá",
	"tỉnh trà vinh",
	"vt",
]);
const NON_THAI_NAME_PATTERNS = [
	/[À-ỹ]/u,
	/[ກ-໿]/u,
	/\b(?:intira|khoum|koung|noudsavanh|manamone)\b/i,
];
const SNAPSHOT_LIMIT = 180;
const GRID_STEP_DEGREES = 1;
const PHOTO_BATCH_SIZE = 500;
const VENUE_SELECT = [
	"id",
	"slug",
	"short_code",
	"name",
	"description",
	"category",
	"province",
	"district",
	"address",
	"phone",
	"location",
	"status",
	"created_at",
	"rating",
	"review_count",
	"image_urls",
	'"Image_URL1"',
	'"Image_URL2"',
	"image_url_1",
	"image_url_2",
	"video_url",
	'"Video_URL"',
	"cinematic_video_url",
	"ig_url",
	"fb_url",
	"tiktok_url",
	"social_links",
].join(",");
const VENUE_SELECT_FALLBACK = [
	"id",
	"slug",
	"short_code",
	"name",
	"description",
	"category",
	"province",
	"district",
	"location",
	"status",
	"created_at",
	"rating",
	"review_count",
	"image_urls",
	"image_url_1",
	"image_url_2",
	"video_url",
	"ig_url",
	"fb_url",
	"tiktok_url",
	"social_links",
	"latitude",
	"longitude",
].join(",");

const normalizeText = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const readJsonFileSafe = async (filePath) => {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

const normalizeMaybeText = (value) => {
	const normalized = normalizeText(value);
	return normalized || null;
};

const normalizeProvinceKey = (value) =>
	normalizeText(value).toLocaleLowerCase();

const shouldExcludeByName = (value) => {
	const normalized = normalizeText(value);
	if (!normalized) return false;
	return NON_THAI_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
};

const toFiniteNumber = (value, fallback = 0) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeUrl = (value) => {
	const raw = normalizeText(value);
	if (!raw) return "";
	try {
		const url = new URL(raw);
		url.hash = "";
		return url.toString();
	} catch {
		return "";
	}
};

const normalizeTextList = (value) => {
	if (Array.isArray(value)) {
		return value.map(normalizeUrl).filter(Boolean);
	}
	if (typeof value === "string") {
		const normalized = normalizeUrl(value);
		return normalized ? [normalized] : [];
	}
	return [];
};

const parseWktPoint = (value) => {
	const text = normalizeText(value).replace(/^SRID=\d+;/i, "");
	if (!text) return null;
	const match = text.match(
		/POINT\s*\(\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*\)/i,
	);
	if (!match) return null;
	const lng = Number(match[1]);
	const lat = Number(match[2]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return {
		lat: Number(lat.toFixed(6)),
		lng: Number(lng.toFixed(6)),
	};
};

const parseSocialLinks = (value) => {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return parsed && typeof parsed === "object" && !Array.isArray(parsed)
				? parsed
				: {};
		} catch {
			return {};
		}
	}
	return value && typeof value === "object" && !Array.isArray(value)
		? value
		: {};
};

const normalizeSocialLinks = (row) => {
	const raw = parseSocialLinks(row?.social_links);
	const social = {
		website: normalizeUrl(raw.website),
		facebook: normalizeUrl(raw.facebook || row?.fb_url),
		instagram: normalizeUrl(raw.instagram || row?.ig_url),
		tiktok: normalizeUrl(raw.tiktok || row?.tiktok_url),
		youtube: normalizeUrl(raw.youtube),
	};
	return Object.fromEntries(
		Object.entries(social).filter(([, value]) => Boolean(value)),
	);
};

const isDirectVideoLink = (value) => {
	const url = normalizeUrl(value);
	if (!url) return false;
	const lowered = url.toLowerCase();
	if (lowered.endsWith(".mp4") || lowered.endsWith(".webm")) return true;

	const parsed = new URL(url);
	let host = parsed.hostname.toLowerCase();
	if (host.startsWith("www.")) host = host.slice(4);
	if (host.startsWith("m.")) host = host.slice(2);
	const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, "");
	const query = parsed.search.toLowerCase();

	if (host === "youtu.be") return pathname.length > 1;
	if (host === "youtube.com") {
		if (pathname === "/watch") return query.includes("v=");
		return pathname.startsWith("/shorts/") || pathname.startsWith("/embed/");
	}
	if (host === "instagram.com") {
		return (
			pathname.startsWith("/reel/") ||
			pathname.startsWith("/reels/") ||
			pathname.startsWith("/tv/")
		);
	}
	if (host === "tiktok.com") return pathname.includes("/video/");
	if (host === "facebook.com") {
		if (pathname === "/watch") return query.includes("v=");
		return pathname.startsWith("/reel/") || pathname.includes("/videos/");
	}
	if (host === "fb.watch") return pathname.length > 1;
	if (host === "vimeo.com") return pathname.length > 1;
	return false;
};

const appendMediaItem = (items, seen, type, url, source) => {
	const normalized = normalizeUrl(url);
	if (!normalized) return;
	const key = `${type}:${normalized}`;
	if (seen.has(key)) return;
	seen.add(key);
	items.push({
		type,
		url: normalized,
		source: normalizeText(source),
		is_real: true,
	});
};

const parseWkbPointHex = (value) => {
	const hex = normalizeText(value).replace(/^\\x/i, "");
	if (!hex || !/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.length % 2) {
		return null;
	}

	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < hex.length; index += 2) {
		bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16);
	}

	const view = new DataView(bytes.buffer);
	const littleEndian = view.getUint8(0) === 1;
	let offset = 1;
	let geomType = view.getUint32(offset, littleEndian);
	offset += 4;

	const hasSrid = (geomType & 0x20000000) !== 0;
	geomType &= 0x0fffffff;
	if (hasSrid) offset += 4;
	if (geomType !== 1 || offset + 16 > view.byteLength) return null;

	const lng = view.getFloat64(offset, littleEndian);
	const lat = view.getFloat64(offset + 8, littleEndian);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	return {
		lat: Number(lat.toFixed(6)),
		lng: Number(lng.toFixed(6)),
	};
};

const parseLocationPoint = (value) => {
	if (!value) return null;
	if (typeof value === "object") {
		if (Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
			const lng = Number(value.coordinates[0]);
			const lat = Number(value.coordinates[1]);
			if (Number.isFinite(lat) && Number.isFinite(lng)) {
				return {
					lat: Number(lat.toFixed(6)),
					lng: Number(lng.toFixed(6)),
				};
			}
		}
		const lat = Number(value.lat ?? value.latitude);
		const lng = Number(value.lng ?? value.lon ?? value.longitude);
		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			return {
				lat: Number(lat.toFixed(6)),
				lng: Number(lng.toFixed(6)),
			};
		}
		return null;
	}
	if (typeof value !== "string") return null;
	const text = value.trim();
	if (!text) return null;
	if (text.startsWith("{") || text.startsWith("[")) {
		try {
			return parseLocationPoint(JSON.parse(text));
		} catch {
			return parseWktPoint(text) || parseWkbPointHex(text);
		}
	}
	return parseWktPoint(text) || parseWkbPointHex(text);
};

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
	const earthRadiusKm = 6371;
	const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
	const deltaLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(deltaLng / 2) ** 2;
	return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getApproxThailandMaxLng = (lat) => {
	if (lat >= 19.5) return 104.7;
	if (lat >= 15) return 105.3;
	if (lat >= 12) return 103.8;
	if (lat >= 9) return 101.9;
	return 100.8;
};

const isWithinThailandBounds = (row) => {
	if (
		row.lat < THAILAND_BOUNDS.minLat ||
		row.lat > THAILAND_BOUNDS.maxLat ||
		row.lng < THAILAND_BOUNDS.minLng
	) {
		return false;
	}

	const provinceKey = normalizeProvinceKey(row.province);
	if (provinceKey && NON_THAI_PROVINCE_ALIASES.has(provinceKey)) {
		return false;
	}
	if (shouldExcludeByName(row.name)) {
		return false;
	}

	return row.lng <= getApproxThailandMaxLng(row.lat);
};

const buildGridBucketKey = (row) => {
	const latIndex = Math.floor(
		(row.lat - THAILAND_BOUNDS.minLat) / GRID_STEP_DEGREES,
	);
	const lngIndex = Math.floor(
		(row.lng - THAILAND_BOUNDS.minLng) / GRID_STEP_DEGREES,
	);
	return `${latIndex}:${lngIndex}`;
};

const compareRowsStable = (left, right) => {
	if (right.lat !== left.lat) return right.lat - left.lat;
	if (left.lng !== right.lng) return left.lng - right.lng;
	return `${left.name}:${left.id}`.localeCompare(`${right.name}:${right.id}`);
};

const compareBucketKeys = (leftKey, rightKey) => {
	const [leftLatIndex, leftLngIndex] = leftKey.split(":").map(Number);
	const [rightLatIndex, rightLngIndex] = rightKey.split(":").map(Number);
	if (leftLatIndex !== rightLatIndex) return rightLatIndex - leftLatIndex;
	return leftLngIndex - rightLngIndex;
};

const selectMajorCityCoverageRows = (rows) => {
	const selectedRows = [];
	const selectedIds = new Set();

	for (const anchor of LOCALHOST_MAJOR_CITY_ANCHORS) {
		const nearestRows = rows
			.filter((row) => {
				const id = normalizeText(row.id);
				return id && !selectedIds.has(id);
			})
			.sort(
				(left, right) =>
					calculateDistanceKm(anchor.lat, anchor.lng, left.lat, left.lng) -
					calculateDistanceKm(anchor.lat, anchor.lng, right.lat, right.lng),
			)
			.slice(0, anchor.quota);

		for (const row of nearestRows) {
			const id = normalizeText(row.id);
			if (!id || selectedIds.has(id)) continue;
			selectedIds.add(id);
			selectedRows.push(row);
		}
	}

	return selectedRows;
};

const buildPhotoMap = async (venueIds) => {
	if (!supabase) return new Map();

	const grouped = new Map();
	const pushPhoto = (venueId, url, source) => {
		const key = normalizeText(venueId);
		if (!key || !url) return;
		const list = grouped.get(key) || [];
		list.push({ url, source });
		grouped.set(key, list);
	};

	for (let index = 0; index < venueIds.length; index += PHOTO_BATCH_SIZE) {
		const batch = venueIds.slice(index, index + PHOTO_BATCH_SIZE);
		try {
			const venuePhotos = await supabase
				.from("venue_photos")
				.select("venue_id,image_url,status")
				.in("venue_id", batch)
				.eq("status", "approved");
			if (venuePhotos.error) throw venuePhotos.error;
			for (const row of venuePhotos.data || []) {
				pushPhoto(row.venue_id, row.image_url, "ugc.venue_photos");
			}
		} catch {
			// ignore missing or restricted table
		}

		try {
			const shopPhotos = await supabase
				.from("shop_photos")
				.select("shop_id,url,status")
				.in("shop_id", batch)
				.eq("status", "approved");
			if (shopPhotos.error) throw shopPhotos.error;
			for (const row of shopPhotos.data || []) {
				pushPhoto(row.shop_id, row.url, "ugc.shop_photos");
			}
		} catch {
			// ignore missing or restricted table
		}
	}

	return grouped;
};

const fetchVenueRows = async () => {
	if (!supabase) {
		throw new Error("SUPABASE_SNAPSHOT_UNAVAILABLE");
	}

	const selectAttempts = [VENUE_SELECT, VENUE_SELECT_FALLBACK, "*"];
	let lastError = null;
	for (const selectColumns of selectAttempts) {
		const response = await supabase
			.from("venues")
			.select(selectColumns)
			.order("id");
		if (!response.error) {
			return Array.isArray(response.data) ? response.data : [];
		}
		lastError = response.error;
	}
	throw lastError || new Error("Failed to load venues");
};

const buildMediaPayload = (row, photoRows = []) => {
	const media = [];
	const seen = new Set();

	for (const url of normalizeTextList(row.image_urls)) {
		appendMediaItem(media, seen, "image", url, "venues.image_urls");
	}

	appendMediaItem(media, seen, "image", row.Image_URL1, "venues.Image_URL1");
	appendMediaItem(media, seen, "image", row.Image_URL2, "venues.Image_URL2");
	appendMediaItem(media, seen, "image", row.image_url_1, "venues.image_url_1");
	appendMediaItem(media, seen, "image", row.image_url_2, "venues.image_url_2");

	for (const photo of photoRows) {
		appendMediaItem(media, seen, "image", photo.url, photo.source);
	}

	appendMediaItem(media, seen, "video", row.video_url, "venues.video_url");
	appendMediaItem(media, seen, "video", row.Video_URL, "venues.Video_URL");
	appendMediaItem(
		media,
		seen,
		"video",
		row.cinematic_video_url,
		"venues.cinematic_video_url",
	);

	const socialLinks = normalizeSocialLinks(row);
	for (const [platform, url] of Object.entries(socialLinks)) {
		if (!isDirectVideoLink(url)) continue;
		appendMediaItem(media, seen, "video", url, `social_links.${platform}`);
	}

	const images = media
		.filter((item) => item.type === "image")
		.map((item) => item.url);
	const videos = media
		.filter((item) => item.type === "video")
		.map((item) => item.url);
	const counts = {
		images: images.length,
		videos: videos.length,
		total: media.length,
	};
	return {
		id: normalizeText(row.id),
		images,
		videos,
		videoUrl: videos[0] || "",
		media,
		counts,
		coverage: {
			has_images: counts.images > 0,
			has_videos: counts.videos > 0,
			has_media: counts.total > 0,
			has_complete_media: counts.images > 0 && counts.videos > 0,
		},
		socialLinks,
	};
};

const toCompleteVenueRow = (row, mediaPayload) => {
	const coords =
		parseLocationPoint(row?.location) ||
		parseLocationPoint({
			latitude: row?.latitude,
			longitude: row?.longitude,
		});
	if (!coords || !mediaPayload?.coverage?.has_complete_media) return null;

	return {
		id: normalizeText(row.id),
		shop_id: normalizeText(row.id),
		slug: normalizeMaybeText(row.slug),
		short_code: normalizeMaybeText(row.short_code),
		name: normalizeText(row.name) || "Unknown venue",
		description: normalizeText(row.description),
		category: normalizeText(row.category) || "General",
		province: normalizeMaybeText(row.province),
		district: normalizeMaybeText(row.district),
		address: normalizeMaybeText(row.address),
		phone: normalizeMaybeText(row.phone),
		image_urls: [...mediaPayload.images],
		images: [...mediaPayload.images],
		video_url: mediaPayload.videoUrl,
		videoUrl: mediaPayload.videoUrl,
		videos: [...mediaPayload.videos],
		real_media: [...mediaPayload.media],
		media: [...mediaPayload.media],
		media_counts: mediaPayload.counts,
		counts: mediaPayload.counts,
		coverage: mediaPayload.coverage,
		social_links: mediaPayload.socialLinks,
		has_real_image: true,
		has_real_video: true,
		Image_URL1: mediaPayload.images[0] || "",
		Image_URL2: mediaPayload.images[1] || "",
		cover_image: mediaPayload.images[0] || "",
		rating: toFiniteNumber(row.rating, 0),
		review_count: toFiniteNumber(row.review_count, 0),
		lat: coords.lat,
		lng: coords.lng,
		latitude: coords.lat,
		longitude: coords.lng,
		created_at: normalizeMaybeText(row.created_at),
		status: normalizeText(row.status) || "active",
		location: row.location,
	};
};

const toFallbackVenueRow = (row) => {
	const coords =
		parseLocationPoint(row?.location) ||
		parseLocationPoint({
			latitude: row?.latitude,
			longitude: row?.longitude,
		});
	if (!coords) return null;

	const images = normalizeTextList(row.image_urls);
	const socialLinks = normalizeSocialLinks(row);
	const videos = [
		normalizeUrl(row.video_url),
		normalizeUrl(row.Video_URL),
		normalizeUrl(row.cinematic_video_url),
	]
		.filter(Boolean)
		.slice(0, 1);
	const media = [
		...images.map((url) => ({
			type: "image",
			url,
			source: "stale.image_urls",
			is_real: false,
		})),
		...videos.map((url) => ({
			type: "video",
			url,
			source: "stale.video_url",
			is_real: false,
		})),
	];
	const counts = {
		images: images.length,
		videos: videos.length,
		total: media.length,
	};

	return {
		id: normalizeText(row.id),
		shop_id: normalizeText(row.id),
		slug: normalizeMaybeText(row.slug),
		short_code: normalizeMaybeText(row.short_code),
		name: normalizeText(row.name) || "Unknown venue",
		description: normalizeText(row.description),
		category: normalizeText(row.category) || "General",
		province: normalizeMaybeText(row.province),
		district: normalizeMaybeText(row.district),
		address: normalizeMaybeText(row.address),
		phone: normalizeMaybeText(row.phone),
		image_urls: images,
		images,
		video_url: videos[0] || "",
		videoUrl: videos[0] || "",
		videos,
		real_media: media,
		media,
		media_counts: counts,
		counts,
		coverage: {
			has_images: counts.images > 0,
			has_videos: counts.videos > 0,
			has_media: counts.total > 0,
			has_complete_media: counts.images > 0 && counts.videos > 0,
		},
		social_links: socialLinks,
		has_real_image: counts.images > 0,
		has_real_video: counts.videos > 0,
		Image_URL1: images[0] || "",
		Image_URL2: images[1] || "",
		cover_image: images[0] || "",
		rating: toFiniteNumber(row.rating, 0),
		review_count: toFiniteNumber(row.review_count, 0),
		lat: coords.lat,
		lng: coords.lng,
		latitude: coords.lat,
		longitude: coords.lng,
		created_at: normalizeMaybeText(row.created_at),
		status: normalizeText(row.status) || "active",
		location: row.location,
	};
};

const loadFallbackVenueRows = async () => {
	const raw = await fs.readFile(FALLBACK_STALE_VENUE_PATH, "utf8");
	const payload = JSON.parse(raw);
	const rows = Array.isArray(payload?.rows) ? payload.rows : [];
	return rows.map(toFallbackVenueRow).filter(Boolean);
};

const selectNationwideRows = (rows) => {
	const nationwidePool = rows.filter(isWithinThailandBounds);
	const pool =
		nationwidePool.length >= SNAPSHOT_LIMIT ? nationwidePool : [...rows];
	const anchorCoverageRows = selectMajorCityCoverageRows(pool);
	const anchorCoverageIds = new Set(
		anchorCoverageRows.map((row) => normalizeText(row.id)).filter(Boolean),
	);
	const bucketMap = new Map();

	for (const row of pool) {
		if (anchorCoverageIds.has(normalizeText(row.id))) continue;
		const bucketKey = buildGridBucketKey(row);
		const bucket = bucketMap.get(bucketKey) || [];
		bucket.push(row);
		bucketMap.set(bucketKey, bucket);
	}

	const buckets = [...bucketMap.entries()]
		.sort(([leftKey], [rightKey]) => compareBucketKeys(leftKey, rightKey))
		.map(([bucketKey, bucketRows]) => ({
			bucketKey,
			rows: bucketRows.sort(compareRowsStable),
		}));

	const selectedRows = [...anchorCoverageRows];
	for (
		let roundIndex = 0;
		selectedRows.length < SNAPSHOT_LIMIT;
		roundIndex += 1
	) {
		let addedThisRound = false;
		for (const bucket of buckets) {
			const row = bucket.rows[roundIndex];
			if (!row) continue;
			selectedRows.push(row);
			addedThisRound = true;
			if (selectedRows.length >= SNAPSHOT_LIMIT) break;
		}
		if (!addedThisRound) break;
	}

	return {
		poolSize: pool.length,
		nationwidePoolSize: nationwidePool.length,
		bucketCount: buckets.length,
		anchorCoverageCount: anchorCoverageRows.length,
		rows: selectedRows
			.slice(0, SNAPSHOT_LIMIT)
			.sort(
				(left, right) =>
					calculateDistanceKm(
						LOCALHOST_DEV_REFERENCE_POINT.lat,
						LOCALHOST_DEV_REFERENCE_POINT.lng,
						left.lat,
						left.lng,
					) -
					calculateDistanceKm(
						LOCALHOST_DEV_REFERENCE_POINT.lat,
						LOCALHOST_DEV_REFERENCE_POINT.lng,
						right.lat,
						right.lng,
					),
			),
	};
};

const buildOutputPayloads = ({
	completeRows,
	selection,
	sourcePath,
	sourceRowCount,
	selectionStrategy,
}) => ({
	mediaIndexPayload: {
		generated_at: new Date().toISOString(),
		selection_strategy: `media_index_from_${selectionStrategy}`,
		total_rows: completeRows.length,
		rows: completeRows.map((row) => ({
			shop_id: row.shop_id,
			name: row.name,
			slug: row.slug,
			category: row.category,
			province: row.province,
			district: row.district,
			images: row.images,
			videos: row.videos,
			video_url: row.video_url,
			media: row.media,
			counts: row.counts,
			coverage: row.coverage,
			social_links: row.social_links,
		})),
	},
	snapshotPayload: {
		generated_at: new Date().toISOString(),
		source_path: sourcePath,
		selection_strategy: selectionStrategy,
		thailand_bounds: THAILAND_BOUNDS,
		localhost_dev_reference_point: LOCALHOST_DEV_REFERENCE_POINT,
		major_city_anchor_count: LOCALHOST_MAJOR_CITY_ANCHORS.length,
		major_city_coverage_count: selection.anchorCoverageCount,
		grid_step_degrees: GRID_STEP_DEGREES,
		source_row_count: sourceRowCount,
		complete_media_index_count: completeRows.length,
		nationwide_pool_count: selection.nationwidePoolSize,
		selected_bucket_count: selection.bucketCount,
		limit: SNAPSHOT_LIMIT,
		rows: selection.rows,
	},
});

const isExistingMediaIndexAuthoritative = (payload) => {
	const rows = Array.isArray(payload?.rows) ? payload.rows : [];
	if (!rows.length) return false;
	return rows.every((row) => {
		const counts = row?.counts || {};
		const coverage = row?.coverage || {};
		return (
			Number(counts.images) > 0 &&
			Number(counts.videos) > 0 &&
			coverage.has_complete_media === true
		);
	});
};

const isExistingSnapshotAuthoritative = (payload) => {
	const rows = Array.isArray(payload?.rows) ? payload.rows : [];
	if (!rows.length) return false;
	return rows.every((row) => {
		const coverage = row?.coverage || {};
		return coverage.has_complete_media === true;
	});
};

const hasExistingAuthoritativeArtifacts = async () => {
	const [mediaIndexPayload, snapshotPayload] = await Promise.all([
		readJsonFileSafe(OUTPUT_MEDIA_INDEX_PATH),
		readJsonFileSafe(OUTPUT_SNAPSHOT_PATH),
	]);
	return (
		isExistingMediaIndexAuthoritative(mediaIndexPayload) &&
		isExistingSnapshotAuthoritative(snapshotPayload)
	);
};

const main = async () => {
	let completeRows = [];
	let sourcePath = "supabase:venues+venue_photos_complete_media_only";
	let sourceRowCount = 0;
	let selectionStrategy =
		"thailand_grid_round_robin_complete_media_only_plus_major_city_coverage";

	try {
		const venueRows = await fetchVenueRows();
		const photoMap = await buildPhotoMap(
			venueRows.map((row) => normalizeText(row.id)).filter(Boolean),
		);
		completeRows = venueRows
			.map((row) =>
				toCompleteVenueRow(
					row,
					buildMediaPayload(row, photoMap.get(normalizeText(row.id)) || []),
				),
			)
			.filter(Boolean);
		sourceRowCount = venueRows.length;
		if (!completeRows.length) {
			throw new Error("SUPABASE_COMPLETE_MEDIA_ROWS_EMPTY");
		}
	} catch (error) {
		if (await hasExistingAuthoritativeArtifacts()) {
			process.stderr.write(
				`Supabase snapshot unavailable, preserving existing authoritative media artifacts: ${error?.message || error}\n`,
			);
			return;
		}

		process.stderr.write(
			`Supabase snapshot unavailable, falling back to stale public venue data: ${error?.message || error}\n`,
		);
		completeRows = await loadFallbackVenueRows();
		sourcePath = `file:${path
			.relative(REPO_ROOT, FALLBACK_STALE_VENUE_PATH)
			.replace(/\\/g, "/")}`;
		sourceRowCount = completeRows.length;
		selectionStrategy =
			"thailand_grid_round_robin_stale_public_plus_major_city_coverage";
	}

	if (!completeRows.length) {
		throw new Error("LOCALHOST_VENUE_SNAPSHOT_EMPTY");
	}

	const selection = selectNationwideRows(completeRows);
	const { mediaIndexPayload, snapshotPayload } = buildOutputPayloads({
		completeRows,
		selection,
		sourcePath,
		sourceRowCount,
		selectionStrategy,
	});

	await fs.mkdir(path.dirname(OUTPUT_SNAPSHOT_PATH), { recursive: true });
	await fs.writeFile(
		OUTPUT_MEDIA_INDEX_PATH,
		`${JSON.stringify(mediaIndexPayload, null, "\t")}\n`,
		"utf8",
	);
	await fs.writeFile(
		OUTPUT_SNAPSHOT_PATH,
		`${JSON.stringify(snapshotPayload, null, "\t")}\n`,
		"utf8",
	);

	process.stdout.write(
		`Generated localhost venue snapshot: ${selection.rows.length} rows -> ${OUTPUT_SNAPSHOT_PATH}\n`,
	);
	process.stdout.write(
		`Generated real media index: ${completeRows.length} rows -> ${OUTPUT_MEDIA_INDEX_PATH}\n`,
	);
};

main().catch((error) => {
	console.error(
		"Failed to generate localhost venue snapshot:",
		error?.message || error,
	);
	process.exitCode = 1;
});
