import { isSupabaseSchemaCacheError, supabase } from "../lib/supabase";

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
		Province: item.province || item.Province || "เชียงใหม่",
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
		let query = supabase.from("venues").select("*");

		if (province && province !== "ทุกจังหวัด") {
			query = query.eq("province", province);
		}

		const { data, error } = await query;

		if (error) throw error;

		return (data || []).map((item, index) => mapShopData(item, index));
	} catch (error) {
		console.error("Error fetching shops from Supabase:", error);
		throw new Error("Unable to load data from Supabase");
	}
};

/**
 * Nationwide LIVE status
 */
export const getLiveEverywhere = async () => {
	try {
		const { data, error } = await supabase
			.from("venues")
			.select("*")
			.eq("status", "active");

		if (error) throw error;
		return (data || []).map((item, index) => mapShopData(item, index));
	} catch (err) {
		console.error("Error fetching live everywhere:", err);
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
		const { data, error } = await supabase.rpc("get_feed_cards", {
			p_lat: lat,
			p_lng: lng,
		});

		if (error) throw error;

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
		console.error("Error fetching feed cards:", error);
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
let mapPinsConsecutiveTimeouts = 0;
let mapPinsCircuitOpenUntil = 0;
let mapPinsCircuitCooldownMs = MAP_PINS_CIRCUIT_BREAKER_BASE_COOLDOWN_MS;
let mapPinsLastWarningAt = 0;
let mapPinsLastGoodPins = [];

const warnMapPins = (message) => {
	// Suppress in production — instant-pins pattern shows fallback data immediately
	if (!import.meta.env.DEV) return;
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
		const isAbort =
			error?.name === "AbortError" ||
			String(error?.message || "").includes("AbortError") ||
			String(error?.message || "").includes("signal is aborted");
		if (isAbort && signal?.aborted && !timedOut) {
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
			console.error("Error fetching map pins:", error);
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
