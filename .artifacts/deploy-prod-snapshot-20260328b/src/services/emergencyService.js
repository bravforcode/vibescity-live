// --- C:\vibecity.live\src\services\emergencyService.js ---
// Nationwide emergency support based on repo-owned public data.

const EMERGENCY_DATASET_PATH = "/data/emergency-locations.json";
const DEFAULT_LIMIT_PER_TYPE = 3;
const DEFAULT_RADIUS_KM = 80;

let emergencyDatasetCache = null;
let emergencyDatasetPromise = null;

/**
 * Emergency contacts for Thailand
 */
export const EMERGENCY_CONTACTS = {
	police: {
		name: "Police",
		number: "191",
		icon: "Shield",
	},
	touristPolice: {
		name: "Tourist Police",
		number: "1155",
		icon: "BadgeCheck",
	},
	ambulance: {
		name: "Ambulance",
		number: "1669",
		icon: "Ambulance",
	},
	fire: {
		name: "Fire Department",
		number: "199",
		icon: "Flame",
	},
};

const toFiniteNumber = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value) => String(value || "").trim();

const buildNearbySearchQuery = (baseQuery, lat, lng) => {
	const safeLat = toFiniteNumber(lat);
	const safeLng = toFiniteNumber(lng);
	if (safeLat === null || safeLng === null) {
		return `${baseQuery} thailand`;
	}
	return `${baseQuery} near ${safeLat.toFixed(6)},${safeLng.toFixed(6)}`;
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
	const safeLat1 = toFiniteNumber(lat1);
	const safeLng1 = toFiniteNumber(lng1);
	const safeLat2 = toFiniteNumber(lat2);
	const safeLng2 = toFiniteNumber(lng2);
	if (
		safeLat1 === null ||
		safeLng1 === null ||
		safeLat2 === null ||
		safeLng2 === null
	) {
		return null;
	}

	const earthRadiusKm = 6371;
	const dLat = toRadians(safeLat2 - safeLat1);
	const dLng = toRadians(safeLng2 - safeLng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(safeLat1)) *
			Math.cos(toRadians(safeLat2)) *
			Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return earthRadiusKm * c;
};

const getEmergencySortOrder = (type) => {
	if (type === "hospital") return 0;
	if (type === "police") return 1;
	if (type === "fire") return 2;
	return 3;
};

const buildEmergencyItem = (item, distance) => ({
	id: item.id,
	name: normalizeText(item.name),
	type: normalizeText(item.type).toLowerCase(),
	lat: toFiniteNumber(item.lat),
	lng: toFiniteNumber(item.lng),
	phone: normalizeText(item.phone) || null,
	province: normalizeText(item.province) || null,
	address: normalizeText(item.address) || null,
	is24h: Boolean(item.is24h),
	distance: Number(distance.toFixed(1)),
	distanceKm: Number(distance.toFixed(2)),
});

export const getEmergencySearchLink = (type, userLat, userLng) => {
	const baseQuery = type === "police" ? "police station" : "hospital emergency";
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
		buildNearbySearchQuery(baseQuery, userLat, userLng),
	)}`;
};

export const getEmergencyFallbackState = (userLat, userLng) => ({
	nearest: [],
	hospitals: [],
	police: [],
	searchLinks: {
		hospitals: getEmergencySearchLink("hospital", userLat, userLng),
		police: getEmergencySearchLink("police", userLat, userLng),
	},
});

const loadEmergencyDataset = async () => {
	if (Array.isArray(emergencyDatasetCache)) {
		return emergencyDatasetCache;
	}

	if (!emergencyDatasetPromise) {
		emergencyDatasetPromise = fetch(EMERGENCY_DATASET_PATH, {
			cache: "no-store",
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error(
						`Failed to load emergency dataset (${response.status})`,
					);
				}
				return response.json();
			})
			.then((payload) => {
				const rows = Array.isArray(payload) ? payload : [];
				emergencyDatasetCache = rows;
				return rows;
			})
			.catch(() => {
				emergencyDatasetCache = [];
				return [];
			})
			.finally(() => {
				emergencyDatasetPromise = null;
			});
	}

	return emergencyDatasetPromise;
};

export const getNearbyEmergency = async (
	userLat,
	userLng,
	limitPerType = DEFAULT_LIMIT_PER_TYPE,
	radiusKm = DEFAULT_RADIUS_KM,
) => {
	const safeLat = toFiniteNumber(userLat);
	const safeLng = toFiniteNumber(userLng);
	const fallback = getEmergencyFallbackState(safeLat, safeLng);

	if (safeLat === null || safeLng === null) {
		return fallback;
	}

	const dataset = await loadEmergencyDataset();
	if (!dataset.length) {
		return fallback;
	}

	const safeLimit = Math.max(1, Number(limitPerType) || DEFAULT_LIMIT_PER_TYPE);
	const safeRadius = Math.max(1, Number(radiusKm) || DEFAULT_RADIUS_KM);

	const nearby = dataset
		.map((item) => {
			const distance = calculateDistanceKm(
				safeLat,
				safeLng,
				item?.lat,
				item?.lng,
			);
			if (distance === null || distance > safeRadius) return null;
			return buildEmergencyItem(item, distance);
		})
		.filter(Boolean)
		.sort((left, right) => {
			if (left.distance !== right.distance) {
				return left.distance - right.distance;
			}
			return (
				getEmergencySortOrder(left.type) - getEmergencySortOrder(right.type)
			);
		});

	if (!nearby.length) {
		return fallback;
	}

	const hospitals = nearby
		.filter((item) => item.type === "hospital")
		.slice(0, safeLimit);
	const police = nearby
		.filter((item) => item.type === "police")
		.slice(0, safeLimit);

	return {
		nearest: nearby.slice(0, safeLimit * 2),
		hospitals,
		police,
		searchLinks: fallback.searchLinks,
	};
};

/**
 * Generate tel: link for calling
 */
export const getCallLink = (number) => {
	return `tel:${String(number || "").replaceAll(/\s+/g, "")}`;
};

/**
 * Generate navigation link to emergency location
 */
export const getDirectionsLink = (lat, lng) => {
	return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
};
