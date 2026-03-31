import { resolveVenueMedia } from "./viewModel";

const cleanString = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const normalizeId = (value) => {
	const normalized = cleanString(value);
	return normalized || null;
};

const BUILDING_IDENTIFIER_KEYS = [
	"buildingId",
	"building_id",
	"buildingKey",
	"building_key",
	"Building",
	"building",
];

const CANONICAL_BUILDING_IDENTIFIER_KEYS = [
	"id",
	...BUILDING_IDENTIFIER_KEYS,
	"key",
];

const isObject = (value) => Boolean(value) && typeof value === "object";

const asBool = (value) => {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const normalized = cleanString(value).toLowerCase();
	return (
		normalized === "true" ||
		normalized === "1" ||
		normalized === "yes" ||
		normalized === "y"
	);
};

const isGiantPinPayload = (raw) => {
	if (!isObject(raw)) return false;
	const pinType = cleanString(raw.pin_type ?? raw.pinType).toLowerCase();
	return (
		pinType === "giant" ||
		asBool(raw.giantActive) ||
		asBool(raw.giant_active) ||
		asBool(raw.isGiantPin) ||
		asBool(raw.is_giant_active)
	);
};

const looksLikeCanonicalBuilding = (raw) => {
	if (!isObject(raw)) return false;
	return Boolean(
		Array.isArray(raw.floors) ||
			(raw.floorNames && typeof raw.floorNames === "object") ||
			(raw.floorPlanUrls && typeof raw.floorPlanUrls === "object") ||
			Array.isArray(raw.highlights) ||
			cleanString(raw.openTime) ||
			cleanString(raw.closeTime),
	);
};

const resolveIdentifierFromKeys = (raw, keys) => {
	if (!isObject(raw)) return null;
	for (const key of keys) {
		const value = normalizeId(raw[key]);
		if (value) return value;
	}
	return null;
};

export const resolveCanonicalBuilding = (buildings, buildingId) => {
	const normalizedId = normalizeId(buildingId);
	if (!normalizedId || !isObject(buildings)) return null;
	if (isObject(buildings[normalizedId])) {
		return {
			...buildings[normalizedId],
			id: normalizeId(buildings[normalizedId]?.id) || normalizedId,
			key: cleanString(buildings[normalizedId]?.key) || normalizedId,
		};
	}
	const candidates = Object.entries(buildings);
	for (const [key, value] of candidates) {
		if (!isObject(value)) continue;
		const candidateId =
			resolveIdentifierFromKeys(value, CANONICAL_BUILDING_IDENTIFIER_KEYS) ||
			normalizeId(key);
		if (candidateId === normalizedId) {
			return {
				...value,
				id: normalizeId(value.id) || candidateId,
				key: cleanString(value.key) || cleanString(key) || candidateId,
			};
		}
	}
	return null;
};

export const resolveVenueBuildingId = (venue) =>
	resolveIdentifierFromKeys(venue, BUILDING_IDENTIFIER_KEYS);

export const normalizeGiantPinPayload = (raw, _shops = [], buildings = {}) => {
	const source = cleanString(raw?.source) || "map";
	const isCanonicalBuilding = looksLikeCanonicalBuilding(raw);
	const mode =
		!isCanonicalBuilding && isGiantPinPayload(raw) ? "giant-pin" : "mall";
	const buildingId = isCanonicalBuilding
		? resolveIdentifierFromKeys(raw, CANONICAL_BUILDING_IDENTIFIER_KEYS)
		: resolveIdentifierFromKeys(raw, BUILDING_IDENTIFIER_KEYS);
	const canonicalBuilding = resolveCanonicalBuilding(buildings, buildingId);
	const representativeShopId =
		mode === "giant-pin"
			? normalizeId(raw?.id ?? raw?.shop_id ?? raw?.venue_id)
			: null;
	const initialShopId = representativeShopId;
	const buildingName =
		cleanString(canonicalBuilding?.name) ||
		cleanString(raw?.building_name) ||
		(isCanonicalBuilding ? cleanString(raw?.name) : "");

	return {
		contextId: [
			mode,
			source,
			buildingId || "unresolved",
			representativeShopId || initialShopId || "none",
		].join(":"),
		mode,
		source,
		buildingId,
		buildingName: buildingName || null,
		representativeShopId,
		initialShopId,
	};
};

const shopHasVisualMedia = (shop) => {
	const media = resolveVenueMedia(shop || {});
	return Boolean(media.primaryImage || media.videoUrl || media.images?.length);
};

export const resolveGiantPinSelection = (context, shops = []) => {
	const normalizedContext = isObject(context) ? context : {};
	const buildingId = normalizeId(normalizedContext.buildingId);
	const representativeShopId = normalizeId(
		normalizedContext.representativeShopId,
	);
	const initialShopId = normalizeId(normalizedContext.initialShopId);
	const shopsInBuilding = buildingId
		? shops.filter((shop) => resolveVenueBuildingId(shop) === buildingId)
		: [];

	const pickById = (shopId) =>
		shopId
			? shopsInBuilding.find((shop) => normalizeId(shop?.id) === shopId) || null
			: null;

	const selectedShop =
		pickById(representativeShopId) ||
		pickById(initialShopId) ||
		shopsInBuilding.find((shop) => shopHasVisualMedia(shop)) ||
		shopsInBuilding[0] ||
		null;

	return {
		contextId: cleanString(normalizedContext.contextId) || "giant-pin:empty",
		buildingId,
		representativeShopId,
		initialShopId,
		shopsInBuilding,
		selectedShopId: normalizeId(selectedShop?.id),
		hasResolvedBuilding: Boolean(buildingId),
	};
};
