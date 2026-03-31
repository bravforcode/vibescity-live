import {
	getUsableMediaUrl,
	mediaFailureVersion,
} from "../../utils/mediaSourceGuard.js";

const LIVE_STATUS_SET = new Set([
	"live",
	"active",
	"open",
	"opened",
	"online",
	"up",
]);

const OFF_STATUS_SET = new Set([
	"off",
	"inactive",
	"disabled",
	"deleted",
	"closed",
	"close",
	"offline",
	"down",
]);

const EVENT_CATEGORY_HINTS = [
	"event",
	"festival",
	"concert",
	"fair",
	"expo",
	"market",
];

const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m3u8)(?:\?.*)?$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif|gif|svg)(?:\?.*)?$/i;
const REAL_MEDIA_TYPES = {
	image: "image",
	photo: "image",
	video: "video",
};

const cleanString = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const toFiniteNumber = (value) => {
	const num = Number(value);
	return Number.isFinite(num) ? num : null;
};

const isTruthy = (value) => {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const raw = cleanString(value).toLowerCase();
	return raw === "true" || raw === "1" || raw === "yes" || raw === "y";
};

const uniqueStrings = (values) => {
	const seen = new Set();
	const out = [];
	for (const value of values) {
		const normalized = cleanString(value);
		if (!normalized) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	return out;
};

const toNonNegativeInt = (value) => {
	const num = Number(value);
	if (!Number.isFinite(num) || num < 0) return null;
	return Math.trunc(num);
};

const sanitizeUrl = (value) => {
	return getUsableMediaUrl(value);
};

const normalizeRealMediaType = (value) => {
	const normalized = cleanString(value).toLowerCase();
	return REAL_MEDIA_TYPES[normalized] || "";
};

const normalizeRealMediaItem = (item) => {
	if (!item || typeof item !== "object") return null;
	const type = normalizeRealMediaType(item.type ?? item.kind);
	const url = sanitizeUrl(item.url ?? item.src);
	if (!type || !url) return null;
	return {
		type,
		url,
		source: cleanString(item.source),
	};
};

const uniqueMediaItems = (items) => {
	const seen = new Set();
	const out = [];
	for (const item of items) {
		const normalized = normalizeRealMediaItem(item);
		if (!normalized) continue;
		const key = `${normalized.type}:${normalized.url}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(normalized);
	}
	return out;
};

const parsePointWkt = (value) => {
	const raw = cleanString(value);
	if (!raw) return null;
	const noSrid = raw.replace(/^SRID=\d+;/i, "");
	const match = noSrid.match(
		/POINT\s*\(\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*\)/i,
	);
	if (!match) return null;
	const lng = toFiniteNumber(match[1]);
	const lat = toFiniteNumber(match[2]);
	if (lat === null || lng === null) return null;
	return { lat, lng };
};

const parseLocation = (location) => {
	if (!location) return null;

	if (Array.isArray(location) && location.length >= 2) {
		const lat = toFiniteNumber(location[0]);
		const lng = toFiniteNumber(location[1]);
		if (lat !== null && lng !== null) return { lat, lng };
	}

	if (typeof location === "object") {
		if (
			Array.isArray(location.coordinates) &&
			location.coordinates.length >= 2
		) {
			const lng = toFiniteNumber(location.coordinates[0]);
			const lat = toFiniteNumber(location.coordinates[1]);
			if (lat !== null && lng !== null) return { lat, lng };
		}
		const lat = toFiniteNumber(location.lat ?? location.latitude);
		const lng = toFiniteNumber(
			location.lng ?? location.lon ?? location.longitude,
		);
		if (lat !== null && lng !== null) return { lat, lng };
	}

	if (typeof location === "string") {
		const text = location.trim();
		if (!text) return null;

		if (text.startsWith("{") || text.startsWith("[")) {
			try {
				return parseLocation(JSON.parse(text));
			} catch {
				return parsePointWkt(text);
			}
		}

		return parsePointWkt(text);
	}

	return null;
};

export const extractVenueCoords = (venue) => {
	if (!venue || typeof venue !== "object") return null;
	const lat = toFiniteNumber(venue.lat ?? venue.latitude ?? venue.Latitude);
	const lng = toFiniteNumber(
		venue.lng ?? venue.longitude ?? venue.Longitude ?? venue.lon,
	);
	if (lat !== null && lng !== null) return { lat, lng };
	return parseLocation(venue.location);
};

const getRawStatus = (venue) =>
	cleanString(
		venue?.status ??
			venue?.Status ??
			venue?.statusNormalized ??
			venue?.status_normalized ??
			"",
	).toLowerCase();

const resolveLiveState = (venue) => {
	if (isTruthy(venue?.is_live) || isTruthy(venue?.isLive)) return "live";

	const rawStatus = getRawStatus(venue);
	if (LIVE_STATUS_SET.has(rawStatus)) return "live";
	if (OFF_STATUS_SET.has(rawStatus)) return "off";
	return "off";
};

const hasEventHints = (venue) => {
	const pinType = cleanString(venue?.pin_type ?? venue?.pinType).toLowerCase();
	if (pinType === "event" || pinType === "giant") return true;

	if (
		isTruthy(venue?.is_event) ||
		isTruthy(venue?.isEvent) ||
		isTruthy(venue?.event_active) ||
		isTruthy(venue?.giantActive) ||
		isTruthy(venue?.is_giant_active) ||
		isTruthy(venue?.giant) ||
		isTruthy(venue?.festival)
	) {
		return true;
	}

	const category = cleanString(venue?.category).toLowerCase();
	if (category) {
		return EVENT_CATEGORY_HINTS.some((hint) => category.includes(hint));
	}

	return false;
};

export const resolvePinState = (venue) => {
	if (hasEventHints(venue)) return "event";
	const liveState = resolveLiveState(venue);
	if (liveState === "live") return "live";
	return "off";
};

export const resolvePinType = (venue, pinState = resolvePinState(venue)) => {
	const raw = cleanString(venue?.pin_type ?? venue?.pinType).toLowerCase();
	if (raw) return raw;
	if (pinState === "event") return "event";
	return "normal";
};

const resolveStatusLabel = (pinState, venue) => {
	if (pinState === "live") return "LIVE";
	if (pinState === "off") return "OFF";

	const raw = cleanString(venue?.status ?? venue?.Status).toUpperCase();
	return raw || "LIVE";
};

const hasNormalizedRealMedia = (venue) =>
	Boolean(venue?.media?.isRealOnly === true);

const collectStructuredMediaItems = (venue) => {
	const candidates = [];
	if (Array.isArray(venue?.real_media)) candidates.push(...venue.real_media);
	if (Array.isArray(venue?.realMedia)) candidates.push(...venue.realMedia);
	if (Array.isArray(venue?.media_items)) candidates.push(...venue.media_items);
	if (hasNormalizedRealMedia(venue) && Array.isArray(venue?.media?.items)) {
		candidates.push(...venue.media.items);
	}
	return uniqueMediaItems(candidates);
};

const normalizeResolvedMediaCounts = (venue, items) => {
	const rawCounts =
		(venue?.media_counts && typeof venue.media_counts === "object"
			? venue.media_counts
			: null) ||
		(venue?.mediaCounts && typeof venue.mediaCounts === "object"
			? venue.mediaCounts
			: null) ||
		(venue?.counts && typeof venue.counts === "object" ? venue.counts : null) ||
		(hasNormalizedRealMedia(venue) &&
		venue?.media?.counts &&
		typeof venue.media.counts === "object"
			? venue.media.counts
			: null);

	const derivedImages = items.filter((item) => item.type === "image").length;
	const derivedVideos = items.filter((item) => item.type === "video").length;
	const images =
		toNonNegativeInt(
			rawCounts?.images ?? rawCounts?.image_count ?? rawCounts?.photos,
		) ?? derivedImages;
	const videos =
		toNonNegativeInt(rawCounts?.videos ?? rawCounts?.video_count) ??
		derivedVideos;
	const total =
		toNonNegativeInt(
			rawCounts?.total ?? rawCounts?.count ?? rawCounts?.media,
		) ?? images + videos;

	return { images, videos, total };
};

const hasExplicitRealMediaState = (venue) =>
	Array.isArray(venue?.real_media) ||
	Array.isArray(venue?.realMedia) ||
	Array.isArray(venue?.media_items) ||
	Boolean(
		(venue?.media_counts && typeof venue.media_counts === "object") ||
			(venue?.mediaCounts && typeof venue.mediaCounts === "object") ||
			(venue?.counts && typeof venue.counts === "object") ||
			hasNormalizedRealMedia(venue),
	);

const collectLegacyMediaCandidates = (venue) => {
	const arrayCandidates = [];
	if (Array.isArray(venue?.image_urls))
		arrayCandidates.push(...venue.image_urls);
	if (Array.isArray(venue?.images)) arrayCandidates.push(...venue.images);
	if (Array.isArray(venue?.media?.images))
		arrayCandidates.push(...venue.media.images);

	const scalarCandidates = [
		venue?.Image_URL1,
		venue?.Image_URL2,
		venue?.Image_URL3,
		venue?.image_url,
		venue?.image,
		venue?.cover_image,
		venue?.coverImage,
		venue?.thumbnail,
		venue?.logo,
		venue?.logo_url,
		venue?.logoUrl,
		venue?.avatar,
		venue?.photo_url,
	];

	return uniqueStrings([
		...arrayCandidates.map(sanitizeUrl),
		...scalarCandidates.map(sanitizeUrl),
	]);
};

export const resolveVenueMedia = (venue) => {
	void mediaFailureVersion.value;

	const structuredItems = collectStructuredMediaItems(venue);
	const counts = normalizeResolvedMediaCounts(venue, structuredItems);
	const hasRealMediaState =
		hasExplicitRealMediaState(venue) || structuredItems.length > 0;
	const structuredVideos = uniqueStrings(
		structuredItems
			.filter((item) => item.type === "video")
			.map((item) => item.url),
	);
	const structuredImages = uniqueStrings(
		structuredItems
			.filter((item) => item.type === "image")
			.map((item) => item.url),
	);
	const fallbackVideoCandidates = [
		venue?.media?.videoUrl,
		venue?.cinematic_video_url,
		venue?.video_url,
		venue?.Video_URL,
		venue?.videoUrl,
		venue?.video,
		venue?.videoURL,
	]
		.map(sanitizeUrl)
		.filter(Boolean);
	const videoCandidates = hasRealMediaState
		? structuredVideos
		: fallbackVideoCandidates;

	const images = hasRealMediaState
		? structuredImages
		: collectLegacyMediaCandidates(venue);
	const mediaImages = images.filter(
		(url) =>
			IMAGE_EXT_RE.test(url) ||
			url.includes("/images/") ||
			url.includes("supabase.co/storage") ||
			url.startsWith("data:image/"),
	);

	const primaryImage = mediaImages[0] || images[0] || "";
	const logoLike =
		images.find((url) => /logo|brand|avatar|icon/i.test(url)) || primaryImage;
	const videoUrl =
		videoCandidates.find((url) => {
			if (VIDEO_EXT_RE.test(url)) return true;
			return /youtube\.com|youtu\.be|vimeo\.com|stream|video/i.test(url);
		}) || "";
	const items = hasRealMediaState
		? uniqueMediaItems([
				...structuredItems.filter((item) => item.type === "video"),
				...structuredItems.filter((item) => item.type === "image"),
			])
		: uniqueMediaItems([
				...(videoUrl ? [{ type: "video", url: videoUrl }] : []),
				...images.map((url) => ({ type: "image", url })),
			]);

	return {
		videoUrl,
		videos: videoCandidates,
		images: mediaImages.length ? mediaImages : images,
		primaryImage,
		logoLike,
		items,
		counts,
		hasRealMedia: hasRealMediaState,
		hasRealImage: counts.images > 0,
		hasRealVideo: counts.videos > 0,
	};
};

const hasCollectedCoin = (collectedCoinIds, id, idStr) => {
	if (!collectedCoinIds?.has) return false;
	if (id !== null && id !== undefined && collectedCoinIds.has(id)) return true;
	if (idStr && collectedCoinIds.has(idStr)) return true;
	const numeric = Number(idStr);
	return Number.isFinite(numeric) && collectedCoinIds.has(numeric);
};

const resolveHasCoin = (venue, collectedCoinIds, id, idStr) => {
	const collected = hasCollectedCoin(collectedCoinIds, id, idStr);
	const raw = venue?.has_coin ?? venue?.hasCoin;
	if (raw === null || raw === undefined) return !collected;
	if (typeof raw === "boolean") return raw && !collected;
	const txt = cleanString(raw).toLowerCase();
	if (txt === "true" || txt === "1") return !collected;
	if (txt === "false" || txt === "0") return false;
	return !collected;
};

const distanceKm = (lat1, lng1, lat2, lng2) => {
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const normalizeVenueViewModel = (
	venue,
	{ userLocation = null, collectedCoinIds = null } = {},
) => {
	const source = venue && typeof venue === "object" ? venue : {};
	const coords = extractVenueCoords(source);
	const media = resolveVenueMedia(source);
	const pinState = resolvePinState(source);
	const pinType = resolvePinType(source, pinState);

	const id =
		source.id ?? source.venue_id ?? source.shop_id ?? source.slug ?? null;
	const idStr = cleanString(id);
	const lat = coords?.lat ?? null;
	const lng = coords?.lng ?? null;

	const province = cleanString(source.province ?? source.Province) || null;
	const district =
		cleanString(source.district ?? source.zone ?? source.Zone) || null;
	const address = cleanString(source.address ?? source.location_text) || null;
	const phone =
		cleanString(source.phone ?? source.tel ?? source.mobile) || null;
	const socialLinks =
		source.social_links && typeof source.social_links === "object"
			? source.social_links
			: {};

	const openTime =
		cleanString(source.openTime ?? source.open_time ?? source.opening_time) ||
		"";
	const closeTime =
		cleanString(source.closeTime ?? source.close_time ?? source.closing_time) ||
		"";

	const normalizedDistance = (() => {
		if (Number.isFinite(Number(source.distanceKm)))
			return Number(source.distanceKm);
		if (Number.isFinite(Number(source.distance_km)))
			return Number(source.distance_km);
		if (Number.isFinite(Number(source.distance)))
			return Number(source.distance);
		if (
			Array.isArray(userLocation) &&
			userLocation.length >= 2 &&
			lat !== null &&
			lng !== null
		) {
			const userLat = toFiniteNumber(userLocation[0]);
			const userLng = toFiniteNumber(userLocation[1]);
			if (userLat !== null && userLng !== null) {
				return distanceKm(userLat, userLng, lat, lng);
			}
		}
		return Number.POSITIVE_INFINITY;
	})();

	const hasCoin = resolveHasCoin(source, collectedCoinIds, id, idStr);
	const status = resolveStatusLabel(pinState, source);

	return {
		...source,
		id: source.id ?? id,
		slug: cleanString(source.slug) || null,
		name: cleanString(source.name ?? source.title) || "Unknown venue",
		category: cleanString(source.category) || "General",
		status,
		statusRaw: cleanString(source.status ?? source.Status),
		statusNormalized: pinState,
		pin_state: pinState,
		pin_type: pinType,
		is_event: pinState === "event",
		is_live: pinState === "live",
		has_coin: hasCoin,
		lat,
		lng,
		latitude: lat,
		longitude: lng,
		distance: normalizedDistance,
		distanceKm: normalizedDistance,
		phone,
		address,
		province,
		district,
		openTime,
		closeTime,
		Province: province,
		Zone: district,
		Building:
			source.Building ?? source.building ?? source.building_name ?? null,
		Floor: source.Floor ?? source.floor ?? null,
		media: {
			...media,
			isRealOnly: media.hasRealMedia,
		},
		videoUrl: media.videoUrl,
		video_url: media.videoUrl,
		Video_URL: media.videoUrl,
		videos: media.videos,
		images: media.images,
		image_urls: media.images,
		Image_URL1: media.primaryImage || "",
		Image_URL2: media.images[1] || cleanString(source.Image_URL2),
		cover_image: media.primaryImage || cleanString(source.cover_image),
		coverImage: media.primaryImage || cleanString(source.coverImage),
		logoLike: media.logoLike || "",
		real_media: media.hasRealMedia ? media.items : [],
		media_counts: media.counts,
		has_real_media: media.hasRealMedia,
		has_real_image: media.hasRealImage,
		has_real_video: media.hasRealVideo,
		IG_URL:
			cleanString(source.IG_URL ?? source.ig_url ?? socialLinks.instagram) ||
			"",
		FB_URL:
			cleanString(source.FB_URL ?? source.fb_url ?? socialLinks.facebook) || "",
		TikTok_URL:
			cleanString(
				source.TikTok_URL ?? source.tiktok_url ?? socialLinks.tiktok,
			) || "",
	};
};

export const normalizeVenueCollection = (venues, options = {}) => {
	if (!Array.isArray(venues)) return [];
	return venues.map((venue) => normalizeVenueViewModel(venue, options));
};
