import i18n from "@/i18n.js";
import { isSupabaseSchemaCacheError, supabase } from "../lib/supabase";
import { isAppDebugLoggingEnabled } from "../utils/debugFlags";
import {
	isExpectedAbortError,
	logUnexpectedNetworkError,
} from "../utils/networkErrorUtils";
import {
	isSoftSupabaseReadError,
	logUnexpectedSupabaseReadError,
	runSupabaseReadPolicy,
} from "../utils/supabaseReadPolicy";
import { apiFetch } from "./apiClient";

const VENUE_LIST_COLUMNS =
	"id,name,slug,category,description,status,province,district,zone,building,floor,category_color,latitude,longitude,location,image_urls,image_url_1,image_url_2,video_url,social_links,is_promoted,rating,review_count,is_verified,pin_type,pin_metadata,visibility_score,open_time,close_time,golden_time,end_golden_time,vibe_info,crowd_info,promotion_info,promotion_endtime";

let realMediaEndpointUnavailable = false;
let realVenueMediaIndexCache = null;
let realVenueMediaIndexFetchedAt = 0;
let realVenueMediaIndexPromise = null;
let staticRealVenueMediaIndexPromise = null;
const REAL_MEDIA_INDEX_TTL_MS = 5 * 60 * 1000;
const STATIC_REAL_MEDIA_INDEX_URL = "/data/venues-real-media-index.json";
const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1)$/i;

const shouldPreferStaticRealMedia = () =>
	import.meta.env.PROD &&
	typeof window !== "undefined" &&
	!LOCAL_HOST_PATTERN.test(window.location.hostname);

const normalizeMediaItem = (item) => {
	if (!item || typeof item !== "object") return null;
	const type = String(item.type || item.kind || "")
		.trim()
		.toLowerCase();
	const url = String(item.url || item.src || "").trim();
	if (!url || (type !== "image" && type !== "video" && type !== "photo")) {
		return null;
	}
	return {
		type: type === "photo" ? "image" : type,
		url,
		source: item.source || "",
	};
};

const normalizeRealVenueMediaPayload = (payload) => {
	const items = [];
	const seen = new Set();
	const push = (item) => {
		const normalized = normalizeMediaItem(item);
		if (!normalized || seen.has(normalized.url)) return;
		seen.add(normalized.url);
		items.push(normalized);
	};

	if (Array.isArray(payload)) {
		payload.forEach(push);
		return items;
	}

	if (!payload || typeof payload !== "object") {
		return items;
	}

	if (Array.isArray(payload.media)) {
		payload.media.forEach(push);
	}

	if (payload.video_url) {
		push({
			type: "video",
			url: payload.video_url,
			source: payload.source || "video_url",
		});
	}

	if (Array.isArray(payload.images)) {
		payload.images.forEach((url) => {
			push({
				type: "image",
				url,
				source: payload.source || "images",
			});
		});
	}

	return items;
};

const normalizeUrlList = (items) =>
	Array.isArray(items)
		? items
				.map((item) => String(item || "").trim())
				.filter((item) => item.length > 0)
		: [];

const buildMediaCounts = ({ images = [], videos = [], media = [] } = {}) => {
	const imageCount = Array.isArray(images) ? images.length : 0;
	const videoCount = Array.isArray(videos) ? videos.length : 0;
	const totalCount =
		Array.isArray(media) && media.length > 0
			? media.length
			: imageCount + videoCount;
	return {
		images: imageCount,
		videos: videoCount,
		total: totalCount,
	};
};

const shouldDisableRealMediaEndpoint = (status) =>
	[404, 405, 422].includes(Number(status));

const normalizeRealVenueMediaRecord = (payload) => {
	if (!payload || typeof payload !== "object") return null;

	const media = normalizeRealVenueMediaPayload(payload);
	const images = normalizeUrlList(payload.images);
	const videos = normalizeUrlList(payload.videos);
	const shopId = String(
		payload.shop_id || payload.shopId || payload.id || "",
	).trim();
	const socialLinks =
		payload.social_links &&
		typeof payload.social_links === "object" &&
		!Array.isArray(payload.social_links)
			? payload.social_links
			: {};

	const resolvedImages =
		images.length > 0
			? images
			: media.filter((item) => item.type === "image").map((item) => item.url);
	const resolvedVideos =
		videos.length > 0
			? videos
			: media.filter((item) => item.type === "video").map((item) => item.url);
	const videoUrl = String(
		payload.video_url || payload.videoUrl || resolvedVideos[0] || "",
	).trim();
	const counts =
		payload.counts && typeof payload.counts === "object"
			? {
					images: Number(payload.counts.images || 0),
					videos: Number(payload.counts.videos || 0),
					total: Number(payload.counts.total || 0),
				}
			: buildMediaCounts({
					images: resolvedImages,
					videos: resolvedVideos,
					media,
				});

	return {
		shopId,
		images: resolvedImages,
		videos: resolvedVideos,
		videoUrl,
		media,
		coverage:
			payload.coverage && typeof payload.coverage === "object"
				? payload.coverage
				: null,
		counts,
		socialLinks,
	};
};

const setRealVenueMediaIndexCache = (nextIndex) => {
	realVenueMediaIndexCache = nextIndex instanceof Map ? nextIndex : new Map();
	realVenueMediaIndexFetchedAt = Date.now();
	return realVenueMediaIndexCache;
};

const updateRealVenueMediaIndexRecord = (record) => {
	if (!record?.shopId) return;
	if (!(realVenueMediaIndexCache instanceof Map)) {
		realVenueMediaIndexCache = new Map();
	}
	realVenueMediaIndexCache.set(String(record.shopId), record);
	realVenueMediaIndexFetchedAt = Date.now();
};

const buildRealVenueMediaIndex = (rows) => {
	const nextIndex = new Map();
	rows.forEach((row) => {
		const normalized = normalizeRealVenueMediaRecord(row);
		if (normalized?.shopId) {
			nextIndex.set(String(normalized.shopId), normalized);
		}
	});
	return nextIndex;
};

const loadStaticRealVenueMediaIndex = async ({ force = false } = {}) => {
	const now = Date.now();
	if (
		!force &&
		realVenueMediaIndexCache instanceof Map &&
		now - realVenueMediaIndexFetchedAt < REAL_MEDIA_INDEX_TTL_MS
	) {
		return realVenueMediaIndexCache;
	}

	if (staticRealVenueMediaIndexPromise) {
		return staticRealVenueMediaIndexPromise;
	}

	staticRealVenueMediaIndexPromise = (async () => {
		try {
			if (typeof fetch !== "function") {
				return new Map();
			}

			const response = await fetch(STATIC_REAL_MEDIA_INDEX_URL, {
				cache: "no-store",
				headers: {
					Accept: "application/json",
				},
			});
			if (!response.ok) {
				return new Map();
			}

			const payload = await response.json();
			const rows = Array.isArray(payload?.rows)
				? payload.rows
				: Array.isArray(payload?.data)
					? payload.data
					: [];
			return setRealVenueMediaIndexCache(buildRealVenueMediaIndex(rows));
		} catch (error) {
			if (!isExpectedAbortError(error)) {
				logUnexpectedNetworkError(
					"Error loading static real venue media index:",
					error,
				);
			}
			return new Map();
		} finally {
			staticRealVenueMediaIndexPromise = null;
		}
	})();

	return staticRealVenueMediaIndexPromise;
};

export const mergeVenueRowWithRealMedia = (row, mediaRecord) => {
	if (!row || !mediaRecord) return row;

	const images = Array.isArray(mediaRecord.images) ? mediaRecord.images : [];
	const videoUrl = String(mediaRecord.videoUrl || "").trim();
	const mergedSocialLinks =
		mediaRecord.socialLinks &&
		typeof mediaRecord.socialLinks === "object" &&
		Object.keys(mediaRecord.socialLinks).length > 0
			? {
					...(row.social_links || {}),
					...mediaRecord.socialLinks,
				}
			: row.social_links || {};

	return {
		...row,
		image_urls: images,
		images,
		Image_URL1: images[0] || "",
		Image_URL2: images[1] || "",
		video_url: videoUrl,
		Video_URL: videoUrl,
		videoUrl,
		real_media: Array.isArray(mediaRecord.media) ? mediaRecord.media : [],
		media_coverage: mediaRecord.coverage || row.media_coverage || null,
		media_counts:
			mediaRecord.counts ||
			buildMediaCounts({
				images,
				videos: mediaRecord.videos,
				media: mediaRecord.media,
			}),
		social_links: mergedSocialLinks,
		cover_image: images[0] || "",
		coverImage: images[0] || "",
	};
};

const fetchVenuesWithFallback = async (mutateQuery) => {
	const buildQuery = (select) => {
		let query = supabase.from("venues").select(select);
		if (typeof mutateQuery === "function") {
			query = mutateQuery(query);
		}
		return query;
	};

	const { data } = await runSupabaseReadPolicy({
		resourceType: "venueDiscovery",
		run: async () => {
			let result = await buildQuery(VENUE_LIST_COLUMNS);
			if (result.error) {
				result = await buildQuery("*");
			}
			if (result.error) throw result.error;
			return { data: result.data || [] };
		},
	});
	return data || [];
};

/**
 * Maps Supabase Postgres data to the internal shop object format.
 * This ensures the UI doesn't break even if DB column names differ from CSV headers.
 */
const mapShopData = (item, index) => {
	// Handle array images from 'venues' or legacy individual columns
	const img1 =
		item.image_urls?.[0] || item.image_url_1 || item.Image_URL1 || "";
	const img2 =
		item.image_urls?.[1] || item.image_url_2 || item.Image_URL2 || "";

	return {
		id: item.id || index,
		name: item.name || "",
		category: item.category || "General",
		// Support PostGIS location object if present, else fallback
		lat: item.location?.coordinates
			? item.location.coordinates[1]
			: parseFloat(item.latitude || item.Latitude || 0),
		lng: item.location?.coordinates
			? item.location.coordinates[0]
			: parseFloat(item.longitude || item.Longitude || 0),
		videoUrl: item.video_url || item.Video_URL || "",

		// Status logic
		originalStatus: (item.status || item.Status || "").toUpperCase(),
		status: (item.status || item.Status || "OFF").toUpperCase(),

		vibeTag: item.vibe_info || item.Vibe_Info || "",
		crowdInfo: item.crowd_info || item.Crowd_Info || "",

		promotionInfo: item.promotion_info || item.Promotion_info || "",
		promotionEndtime: item.promotion_endtime || item.Promotion_endtime || "",

		// Time Ranges
		openTime: item.open_time || "",
		closeTime: item.close_time || "",
		// Legacy fields logic if needed, new venues might not have golden_time explicitly
		goldenStart: item.golden_time || "",
		goldenEnd: item.end_golden_time || "",

		// Zone & Building
		Province: item.province || item.Province || "",
		Zone: item.district || item.zone || item.Zone || null, // Map district to Zone for backward compat
		Building: item.building || item.Building || null,
		Floor: item.floor || item.Floor || null,
		CategoryColor: item.category_color || item.CategoryColor || null,

		images:
			item.image_urls && item.image_urls.length > 0
				? item.image_urls
				: [img1, img2].filter((url) => url && url.length > 5),
		Image_URL1: img1,
		Image_URL2: img2,

		// Socials (Check for JSONB social_links or legacy columns)
		IG_URL: item.social_links?.instagram || item.ig_url || item.IG_URL || "",
		FB_URL: item.social_links?.facebook || item.fb_url || item.FB_URL || "",
		TikTok_URL:
			item.social_links?.tiktok || item.tiktok_url || item.TikTok_URL || "",
		isPromoted:
			String(item.is_promoted || item.IsPromoted).toUpperCase() === "TRUE",

		// New fields
		rating: Number(item.rating || 0),
		reviewCount: Number(item.review_count || 0),
		verified: Boolean(item.verified),
	};
};

export const getShops = async (province = "ทุกจังหวัด") => {
	try {
		const data = await fetchVenuesWithFallback((query) => {
			if (province && province !== "ทุกจังหวัด") {
				return query.eq("province", province);
			}
			return query;
		});
		return data.map((item, index) => mapShopData(item, index));
	} catch (error) {
		if (isSoftSupabaseReadError(error)) {
			return [];
		}
		if (import.meta.env.DEV) {
			logUnexpectedSupabaseReadError(
				"[shopService] Error fetching shops from Supabase:",
				error,
			);
		}
		throw new Error(i18n.global.t("auto.k_236a9349"));
	}
};

/**
 * Fetch normalized real media for a single venue from the backend API.
 */
export const getRealVenueMedia = async (venueId) => {
	if (!venueId) {
		return null;
	}

	const normalizedVenueId = String(venueId).trim();
	if (shouldPreferStaticRealMedia()) {
		const staticIndex = await loadStaticRealVenueMediaIndex();
		const staticRecord = staticIndex.get(normalizedVenueId);
		if (staticRecord) {
			return staticRecord;
		}
	}
	if (realMediaEndpointUnavailable) {
		const staticIndex = await loadStaticRealVenueMediaIndex();
		return staticIndex.get(normalizedVenueId) || null;
	}

	try {
		const response = await apiFetch(
			`/shops/${venueId}/media?hydrate_missing_image=false&require_complete=true`,
			{
				headers: {
					Accept: "application/json",
				},
			},
		);
		if (!response.ok) {
			if (shouldDisableRealMediaEndpoint(response.status)) {
				realMediaEndpointUnavailable = true;
			}
			const staticIndex = await loadStaticRealVenueMediaIndex({ force: true });
			return staticIndex.get(normalizedVenueId) || null;
		}
		const data = await response.json();
		const normalized = normalizeRealVenueMediaRecord(data);
		if (!normalized) return null;
		updateRealVenueMediaIndexRecord(normalized);
		return normalized;
	} catch (error) {
		if (isExpectedAbortError(error)) {
			return null;
		}
		realMediaEndpointUnavailable = true;
		logUnexpectedNetworkError("Error fetching real venue media:", error);
		const staticIndex = await loadStaticRealVenueMediaIndex();
		return staticIndex.get(normalizedVenueId) || null;
	}
};

export const getRealVenueMediaIndex = async ({ force = false } = {}) => {
	if (shouldPreferStaticRealMedia()) {
		return loadStaticRealVenueMediaIndex({ force });
	}
	if (realMediaEndpointUnavailable) {
		return loadStaticRealVenueMediaIndex({ force });
	}

	const now = Date.now();
	if (
		!force &&
		realVenueMediaIndexCache instanceof Map &&
		now - realVenueMediaIndexFetchedAt < REAL_MEDIA_INDEX_TTL_MS
	) {
		return realVenueMediaIndexCache;
	}

	if (realVenueMediaIndexPromise) {
		return realVenueMediaIndexPromise;
	}

	realVenueMediaIndexPromise = (async () => {
		try {
			const response = await apiFetch(
				"/shops/media?limit=5000&offset=0&include_missing=false&require_complete=true",
				{
					headers: {
						Accept: "application/json",
					},
				},
			);
			if (!response.ok) {
				if (shouldDisableRealMediaEndpoint(response.status)) {
					realMediaEndpointUnavailable = true;
				}
				return loadStaticRealVenueMediaIndex({ force: true });
			}

			const payload = await response.json();
			const rows = Array.isArray(payload?.data) ? payload.data : [];
			return setRealVenueMediaIndexCache(buildRealVenueMediaIndex(rows));
		} catch (error) {
			if (!isExpectedAbortError(error)) {
				realMediaEndpointUnavailable = true;
				logUnexpectedNetworkError(
					"Error fetching real venue media index:",
					error,
				);
			}
			return loadStaticRealVenueMediaIndex();
		} finally {
			realVenueMediaIndexPromise = null;
		}
	})();

	return realVenueMediaIndexPromise;
};

export const enrichVenueRowsWithRealMedia = async (rows, options = {}) => {
	if (!Array.isArray(rows) || rows.length === 0) {
		return Array.isArray(rows) ? rows : [];
	}

	const mediaIndex = await getRealVenueMediaIndex(options);
	if (!(mediaIndex instanceof Map) || mediaIndex.size === 0) {
		return rows;
	}

	return rows.map((row) =>
		mergeVenueRowWithRealMedia(row, mediaIndex.get(String(row?.id || ""))),
	);
};

/**
 * Nationwide LIVE status
 */
export const getLiveEverywhere = async () => {
	try {
		const data = await fetchVenuesWithFallback((query) =>
			query.eq("status", "active"),
		);
		return data.map((item, index) => mapShopData(item, index));
	} catch (err) {
		if (import.meta.env.DEV) {
			logUnexpectedSupabaseReadError(
				"[shopService] Error fetching live everywhere:",
				err,
			);
		}
		return [];
	}
};

/**
 * Buildings (Floor Plans & POIs)
 */
export const getBuildings = async () => {
	try {
		const { data, error } = await supabase.from("buildings").select("*");

		if (error) throw error;

		// Convert array back to keyed object structure
		const buildingsMap = {};
		data.forEach((b) => {
			buildingsMap[b.id] = {
				...b.data,
				id: b.id,
				name: b.name,
			};
		});
		return buildingsMap;
	} catch (error) {
		console.error("Error fetching buildings:", error);
		return {};
	}
};

/**
 * Global Review System
 */
export const getReviews = async (shopId) => {
	try {
		const { data, error } = await supabase
			.from("reviews")
			.select("*")
			.eq("venue_id", shopId) // Use venue_id instead of shop_id
			.order("created_at", { ascending: false });

		if (error) {
			// Suppress missing table error
			if (
				error.code === "PGRST205" ||
				error.message.includes("find the table")
			) {
				console.warn("Reviews table not found, skipping.");
				return [];
			}
			throw error;
		}
		return data;
	} catch (error) {
		// Only suppress missing table errors, re-throw other errors
		if (
			error.code === "PGRST205" ||
			error.message?.includes("find the table")
		) {
			console.warn("Review fetch skipped:", error.message);
			return [];
		}
		throw error;
	}
};

export const postReview = async (shopId, review) => {
	try {
		const { data, error } = await supabase
			.from("reviews")
			.insert([
				{
					venue_id: shopId, // Use venue_id
					user_name: review.userName || "Anonymous",
					rating: review.rating,
					comment: review.comment,
				},
			])
			.select();

		if (error) throw error;
		return data[0];
	} catch (error) {
		console.error("Error posting review:", error);
		throw error;
	}
};

/**
 * RPC: Get Feed Cards (20km radius, limit 30)
 */
export const getFeedCards = async (lat, lng) => {
	try {
		const data = await runSupabaseReadPolicy({
			resourceType: "feed",
			run: async () => {
				const { data, error } = await supabase.rpc("get_feed_cards", {
					p_lat: lat,
					p_lng: lng,
				});

				if (error) throw error;
				return data || [];
			},
		});

		return (data || []).map((item) => ({
			...mapShopData(item),
			distanceKm: item.distance_km,
			pinType: item.pin_type,
			pinMetadata: item.pin_metadata,
			verifiedActive: item.verified_active, // Use this for UI badge
			glowActive: item.glow_active,
			boostActive: item.boost_active,
			giantActive: item.giant_active,
		}));
	} catch (error) {
		if (import.meta.env.DEV) {
			logUnexpectedSupabaseReadError(
				"[shopService] Error fetching feed cards:",
				error,
			);
		}
		return [];
	}
};

/**
 * RPC: Get Map Pins (Bounds + Zoom Rules)
 * Includes an aggressive client timeout + circuit-breaker so the UI never hangs
 * waiting for a slow PostGIS query.
 */
const MAP_PINS_TIMEOUT_MS = 8_000;
const MAP_PINS_WARN_INTERVAL_MS = 20_000;
const MAP_PINS_CIRCUIT_BREAKER_THRESHOLD = 3;
const MAP_PINS_CIRCUIT_BREAKER_BASE_COOLDOWN_MS = 8_000;
const MAP_PINS_CIRCUIT_BREAKER_MAX_COOLDOWN_MS = 60_000;
const MAP_PROVINCE_AGGREGATES_TIMEOUT_MS = 6_000;
let mapPinsConsecutiveTimeouts = 0;
let mapPinsCircuitOpenUntil = 0;
let mapPinsCircuitCooldownMs = MAP_PINS_CIRCUIT_BREAKER_BASE_COOLDOWN_MS;
let mapPinsLastWarningAt = 0;
let mapPinsLastGoodPins = [];
let mapProvinceLastGoodAggregates = [];

const warnMapPins = (message) => {
	// Quiet by default: map fallback behavior is expected in local dev and should
	// not spam the console unless app-level debugging is explicitly enabled.
	if (!isAppDebugLoggingEnabled()) return;
	const now = Date.now();
	if (now - mapPinsLastWarningAt < MAP_PINS_WARN_INTERVAL_MS) return;
	mapPinsLastWarningAt = now;
	console.debug(message);
};

const resetMapPinsCircuit = () => {
	mapPinsConsecutiveTimeouts = 0;
	mapPinsCircuitOpenUntil = 0;
	mapPinsCircuitCooldownMs = MAP_PINS_CIRCUIT_BREAKER_BASE_COOLDOWN_MS;
};

const openMapPinsCircuit = () => {
	const cooldownMs = mapPinsCircuitCooldownMs;
	mapPinsCircuitOpenUntil = Date.now() + cooldownMs;
	mapPinsCircuitCooldownMs = Math.min(
		MAP_PINS_CIRCUIT_BREAKER_MAX_COOLDOWN_MS,
		mapPinsCircuitCooldownMs * 2,
	);
	return cooldownMs;
};

export const getMapPins = async ({
	p_min_lat,
	p_min_lng,
	p_max_lat,
	p_max_lng,
	p_zoom,
	signal,
}) => {
	let timeoutId = null;
	let timedOut = false;
	const timeoutController = new AbortController();
	let externalAbortListener = null;

	try {
		const now = Date.now();
		if (mapPinsCircuitOpenUntil > now) {
			warnMapPins("Map pins RPC temporarily paused after repeated timeouts");
			return mapPinsLastGoodPins;
		}
		if (signal?.aborted) {
			timeoutController.abort();
		} else if (signal) {
			externalAbortListener = () => timeoutController.abort();
			signal.addEventListener("abort", externalAbortListener, { once: true });
		}
		timeoutId = setTimeout(() => {
			timedOut = true;
			timeoutController.abort();
		}, MAP_PINS_TIMEOUT_MS);

		let rpcQuery = supabase.rpc("get_map_pins", {
			p_min_lat,
			p_min_lng,
			p_max_lat,
			p_max_lng,
			p_zoom: Math.round(p_zoom),
		});
		rpcQuery = rpcQuery.abortSignal(timeoutController.signal);
		const { data, error } = await rpcQuery;

		if (error) throw error;

		const mapped = (data || []).map((item) => ({
			id: item.id,
			name: item.name,
			lat: item.lat,
			lng: item.lng,
			pinType: item.pin_type,
			pinMetadata: item.pin_metadata, // { giant_category, model_scale }
			verifiedActive: item.verified_active,
			glowActive: item.glow_active,
			boostActive: item.boost_active,
			giantActive: item.giant_active,
			hasCoin:
				typeof item.has_coin === "boolean"
					? item.has_coin
					: typeof item.hasCoin === "boolean"
						? item.hasCoin
						: null,
			visibilityScore: item.visibility_score,
			coverImage: item.cover_image,
		}));
		resetMapPinsCircuit();
		if (mapped.length > 0) mapPinsLastGoodPins = mapped;
		return mapped;
	} catch (error) {
		const statusCode = Number(error?.status || error?.code || 0);
		if (
			isExpectedAbortError(error, { signal }) &&
			signal?.aborted &&
			!timedOut
		) {
			// Silently return cached pins when request was cancelled
			return mapPinsLastGoodPins;
		}
		const isServerError = statusCode >= 500 && statusCode < 600;
		const isSchemaCacheBusy = isSupabaseSchemaCacheError(error);
		const isTimeoutLike =
			timedOut ||
			error?.message?.includes("client timeout") ||
			String(error?.code) === "57014" ||
			isSchemaCacheBusy;
		if (isTimeoutLike || isServerError) {
			mapPinsConsecutiveTimeouts += 1;
			if (mapPinsConsecutiveTimeouts >= MAP_PINS_CIRCUIT_BREAKER_THRESHOLD) {
				const cooldownMs = openMapPinsCircuit();
				warnMapPins(
					`Map pins RPC circuit open for ${Math.round(cooldownMs / 1000)}s after repeated failures`,
				);
			}
			warnMapPins(
				isSchemaCacheBusy
					? "Map pins temporarily unavailable while Supabase schema cache reloads — using fallback data"
					: "Map pins RPC or DB statement timed out — using fallback data",
			);
			if (mapPinsLastGoodPins.length > 0) return mapPinsLastGoodPins;
		} else {
			logUnexpectedNetworkError("Error fetching map pins:", error, {
				signal,
			});
			if (mapPinsLastGoodPins.length > 0) return mapPinsLastGoodPins;
		}
		return [];
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (signal && externalAbortListener) {
			signal.removeEventListener("abort", externalAbortListener);
		}
	}
};

export const getMapProvinceAggregates = async ({
	categories = null,
	statuses = null,
	searchQuery = null,
	signal,
} = {}) => {
	let timeoutId = null;
	let timedOut = false;
	const timeoutController = new AbortController();
	let externalAbortListener = null;

	const normalizedCategories = Array.isArray(categories)
		? categories.map((value) => String(value || "").trim()).filter(Boolean)
		: [];
	const normalizedStatuses = Array.isArray(statuses)
		? statuses
				.map((value) =>
					String(value || "")
						.trim()
						.toLowerCase(),
				)
				.filter(Boolean)
		: [];
	const normalizedSearchQuery = String(searchQuery || "").trim();
	const shouldUseV2 =
		normalizedCategories.length > 0 ||
		normalizedStatuses.length > 0 ||
		normalizedSearchQuery.length > 0;

	try {
		if (signal?.aborted) {
			timeoutController.abort();
		} else if (signal) {
			externalAbortListener = () => timeoutController.abort();
			signal.addEventListener("abort", externalAbortListener, { once: true });
		}

		timeoutId = setTimeout(() => {
			timedOut = true;
			timeoutController.abort();
		}, MAP_PROVINCE_AGGREGATES_TIMEOUT_MS);

		let rpcQuery = shouldUseV2
			? supabase.rpc("get_map_province_aggregates_v2", {
					p_categories:
						normalizedCategories.length > 0 ? normalizedCategories : null,
					p_statuses: normalizedStatuses.length > 0 ? normalizedStatuses : null,
					p_search_query: normalizedSearchQuery || null,
				})
			: supabase.rpc("get_map_province_aggregates", {
					p_venue_ids: null,
				});

		rpcQuery = rpcQuery.abortSignal(timeoutController.signal);
		const { data, error } = await rpcQuery;
		if (error) throw error;

		const mapped = (data || []).map((item) => ({
			id: item.id,
			name: item.name,
			province: item.province,
			lat: item.lat,
			lng: item.lng,
			pinType: item.pin_type,
			pinState: item.pin_state,
			aggregateLevel: item.aggregate_level,
			aggregateShopCount: item.aggregate_shop_count,
			aggregateDominantCount: item.aggregate_dominant_count,
			promotionScore: item.promotion_score,
			visibilityScore: item.visibility_score,
			verifiedActive: item.verified_active,
			glowActive: item.glow_active,
			boostActive: item.boost_active,
			giantActive: item.giant_active,
			signScale: item.sign_scale,
			coverImage: item.cover_image,
			pinMetadata: item.pin_metadata,
		}));

		if (mapped.length > 0) {
			mapProvinceLastGoodAggregates = mapped;
		}
		return mapped;
	} catch (error) {
		if (
			isExpectedAbortError(error, { signal }) &&
			signal?.aborted &&
			!timedOut
		) {
			return mapProvinceLastGoodAggregates;
		}

		const statusCode = Number(error?.status || error?.code || 0);
		const isServerError = statusCode >= 500 && statusCode < 600;
		const isSchemaCacheBusy = isSupabaseSchemaCacheError(error);
		const isTimeoutLike =
			timedOut ||
			error?.message?.includes("client timeout") ||
			String(error?.code) === "57014" ||
			isSchemaCacheBusy;

		if (isTimeoutLike || isServerError) {
			warnMapPins(
				isSchemaCacheBusy
					? "Province aggregates temporarily unavailable while Supabase schema cache reloads"
					: "Province aggregates timed out — using cached aggregates",
			);
			if (mapProvinceLastGoodAggregates.length > 0) {
				return mapProvinceLastGoodAggregates;
			}
			return [];
		}

		logUnexpectedNetworkError("Error fetching province aggregates:", error, {
			signal,
		});
		return mapProvinceLastGoodAggregates;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (signal && externalAbortListener) {
			signal.removeEventListener("abort", externalAbortListener);
		}
	}
};
