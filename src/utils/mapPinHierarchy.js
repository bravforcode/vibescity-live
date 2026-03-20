import {
	MAP_RENDER_LEVELS,
	resolveMapRenderLevel,
} from "@/utils/mapZoomLevels";

const ZONE_GRID_LAT_STEP = 0.03;
const ZONE_GRID_LNG_STEP = 0.03;
const PROVINCE_GRID_LAT_STEP = 0.55;
const PROVINCE_GRID_LNG_STEP = 0.55;
const DOMINANT_PROMOTION_SCORE = 55;

const toFiniteNumber = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const toSafeString = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const round = (value, digits = 3) => {
	const factor = 10 ** digits;
	return Math.round(Number(value || 0) * factor) / factor;
};

const hashString = (input) => {
	const value = String(input ?? "");
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash >>> 0;
};

const parsePinMetadata = (value) => {
	if (!value) return {};
	if (typeof value === "object") return value;
	if (typeof value !== "string") return {};
	const raw = value.trim();
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
};

const asBool = (value) => {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
};

const firstNonEmpty = (...values) => {
	for (const value of values) {
		const safe = toSafeString(value);
		if (safe) return safe;
	}
	return "";
};

const inferGridKey = (lat, lng, latStep, lngStep, prefix) => {
	const latNum = toFiniteNumber(lat);
	const lngNum = toFiniteNumber(lng);
	if (latNum === null || lngNum === null) return `${prefix}:unknown`;
	const latBucket = Math.round(latNum / latStep);
	const lngBucket = Math.round(lngNum / lngStep);
	return `${prefix}:${latBucket}:${lngBucket}`;
};

const resolveGroupContext = (props, lat, lng) => {
	const province = firstNonEmpty(
		props?.province,
		props?.Province,
		props?.region,
		props?.Region,
	);
	const zone = firstNonEmpty(
		props?.zone,
		props?.Zone,
		props?.district,
		props?.District,
		props?.neighborhood,
		props?.Neighborhood,
		props?.building,
		props?.Building,
	);
	const zoneKey =
		province && zone
			? `zone:${province.toLowerCase()}::${zone.toLowerCase()}`
			: zone
				? `zone:${zone.toLowerCase()}`
				: inferGridKey(
						lat,
						lng,
						ZONE_GRID_LAT_STEP,
						ZONE_GRID_LNG_STEP,
						"zone",
					);
	const provinceKey = province
		? `province:${province.toLowerCase()}`
		: inferGridKey(
				lat,
				lng,
				PROVINCE_GRID_LAT_STEP,
				PROVINCE_GRID_LNG_STEP,
				"province",
			);

	const zoneLabel = zone || province || "Local Zone";
	const provinceLabel = province || "Province";
	return {
		province,
		zone,
		zoneKey,
		provinceKey,
		zoneLabel,
		provinceLabel,
	};
};

const resolvePromotionProfile = (featureProps = {}) => {
	const metadata = parsePinMetadata(featureProps.pin_metadata);
	const featureFlags = metadata?.features || {};
	const addonIds = Array.isArray(metadata?.addons)
		? metadata.addons
				.map((addon) =>
					typeof addon === "string"
						? addon
						: toSafeString(addon?.id || addon?.label),
				)
				.filter(Boolean)
		: [];
	const addonSet = new Set(addonIds);
	const hasMegaSign =
		asBool(featureFlags.mega_sign) ||
		asBool(featureFlags.priority_placement) ||
		addonSet.has("mega_sign") ||
		addonSet.has("priority_placement");
	const hasDistrictTakeover =
		asBool(featureFlags.district_takeover) || addonSet.has("district_takeover");
	const hasSpotlight =
		asBool(featureFlags.spotlight) || addonSet.has("spotlight");
	const hasAnimatedPin =
		asBool(featureFlags.animated_pin) || addonSet.has("animated_pin");
	const hasNeonTrail =
		asBool(featureFlags.neon_trail) || addonSet.has("neon_trail");
	const hasPrecisionSlot =
		asBool(featureFlags.precision_slot) || addonSet.has("precision_slot");
	const hasBoost =
		asBool(featureProps.boost) || asBool(featureFlags.boost_feed);
	const hasGiant =
		toSafeString(featureProps.pin_type).toLowerCase() === "giant" ||
		asBool(featureProps.giant);

	let promotionScore = 0;
	if (hasBoost) promotionScore += 16;
	if (hasGiant) promotionScore += 14;
	if (hasSpotlight) promotionScore += 18;
	if (hasAnimatedPin) promotionScore += 8;
	if (hasNeonTrail) promotionScore += 6;
	if (hasMegaSign) promotionScore += 32;
	if (hasDistrictTakeover) promotionScore += 26;
	if (hasPrecisionSlot) promotionScore += 10;
	promotionScore +=
		clamp(Number(featureProps.visibility_score || 0), 0, 100) * 0.18;

	let baseScale = 1;
	if (hasBoost) baseScale += 0.08;
	if (hasSpotlight) baseScale += 0.12;
	if (hasMegaSign) baseScale += 0.28;
	if (hasDistrictTakeover) baseScale += 0.24;
	if (hasPrecisionSlot) baseScale += 0.08;

	return {
		promotionScore: round(promotionScore, 2),
		baseScale: round(clamp(baseScale, 0.72, 2.1), 3),
		isDominant:
			hasMegaSign ||
			hasDistrictTakeover ||
			promotionScore >= DOMINANT_PROMOTION_SCORE,
		hasPrecisionSlot,
	};
};

const aggregateByLevel = (features = [], level = MAP_RENDER_LEVELS.ZONE) => {
	if (!Array.isArray(features) || features.length === 0) return [];
	const buckets = new Map();

	for (const feature of features) {
		const props = feature?.properties || {};
		const lng = toFiniteNumber(feature?.geometry?.coordinates?.[0]);
		const lat = toFiniteNumber(feature?.geometry?.coordinates?.[1]);
		if (lat === null || lng === null) continue;
		const id = toSafeString(props.id);
		if (!id) continue;
		const groupContext = resolveGroupContext(props, lat, lng);
		const groupKey =
			level === MAP_RENDER_LEVELS.PROVINCE
				? groupContext.provinceKey
				: groupContext.zoneKey;
		const groupLabel =
			level === MAP_RENDER_LEVELS.PROVINCE
				? groupContext.provinceLabel
				: groupContext.zoneLabel;
		if (!groupKey) continue;

		const promotion = resolvePromotionProfile(props);
		const existing = buckets.get(groupKey) || {
			level,
			key: groupKey,
			label: groupLabel,
			province: groupContext.province,
			zone: groupContext.zone,
			shopCount: 0,
			weightSum: 0,
			latSum: 0,
			lngSum: 0,
			visibilitySum: 0,
			maxPromotionScore: 0,
			dominantCount: 0,
			hasLive: false,
			childIds: [],
		};

		const weight = 1 + promotion.promotionScore * 0.015;
		existing.shopCount += 1;
		existing.weightSum += weight;
		existing.latSum += lat * weight;
		existing.lngSum += lng * weight;
		existing.visibilitySum += Number(props.visibility_score || 0);
		existing.maxPromotionScore = Math.max(
			existing.maxPromotionScore,
			promotion.promotionScore,
		);
		existing.hasLive =
			existing.hasLive ||
			toSafeString(props.pin_state).toLowerCase() === "live" ||
			asBool(props.is_live);
		if (promotion.isDominant) {
			existing.dominantCount += 1;
		}
		existing.childIds.push(id);

		buckets.set(groupKey, existing);
	}

	const aggregated = [];
	for (const bucket of buckets.values()) {
		const weight = bucket.weightSum > 0 ? bucket.weightSum : 1;
		const lat = bucket.latSum / weight;
		const lng = bucket.lngSum / weight;
		const dominantBoost = bucket.dominantCount > 0 ? 0.2 : 0;
		const signScale = clamp(
			1 + bucket.maxPromotionScore * 0.005 + dominantBoost,
			1.05,
			2.2,
		);
		const aggregateId = `${bucket.level}:${bucket.key}`;
		const aggregateName = `${bucket.label}`;
		const subline = `${bucket.shopCount} SHOPS`;

		aggregated.push({
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [lng, lat],
			},
			properties: {
				id: aggregateId,
				name: aggregateName,
				pin_type: "giant",
				pin_state: bucket.hasLive ? "live" : "event",
				aggregate_level: bucket.level,
				aggregate_shop_count: bucket.shopCount,
				aggregate_child_ids: bucket.childIds.join(","),
				province: bucket.province || null,
				zone: bucket.zone || null,
				neon_line1: aggregateName.toUpperCase(),
				neon_line2: subline,
				neon_subline: subline,
				promotion_score: round(bucket.maxPromotionScore, 2),
				visibility_score: Math.round(
					bucket.visibilitySum + bucket.maxPromotionScore * 4,
				),
				sign_scale: round(signScale, 3),
				sign_nudge_x: 0,
				sign_nudge_y: 0,
				aggregate_dominant_count: bucket.dominantCount,
			},
		});
	}
	return aggregated;
};

const toScreenPoint = (lng, lat, projector = null) => {
	if (typeof projector === "function") {
		try {
			const projected = projector([lng, lat]);
			const x = toFiniteNumber(projected?.x);
			const y = toFiniteNumber(projected?.y);
			if (x !== null && y !== null) {
				return { x, y };
			}
		} catch {
			// Fallback projection below.
		}
	}
	return {
		x: (lng + 180) * 3,
		y: (90 - lat) * 3,
	};
};

const buildCellKey = (x, y, cellSize) => {
	const cx = Math.floor(x / cellSize);
	const cy = Math.floor(y / cellSize);
	return `${cx}:${cy}`;
};

const collectNeighborEntries = (grid, x, y, cellSize) => {
	const cx = Math.floor(x / cellSize);
	const cy = Math.floor(y / cellSize);
	const neighbors = [];
	for (let dx = -1; dx <= 1; dx += 1) {
		for (let dy = -1; dy <= 1; dy += 1) {
			const key = `${cx + dx}:${cy + dy}`;
			const bucket = grid.get(key);
			if (Array.isArray(bucket) && bucket.length) {
				neighbors.push(...bucket);
			}
		}
	}
	return neighbors;
};

const distanceBetween = (a, b) => {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
};

const applyCrowdingLayout = (features = [], { level, projector } = {}) => {
	if (!Array.isArray(features) || features.length === 0) return [];

	const cellSize = level === MAP_RENDER_LEVELS.DETAIL ? 80 : 120;
	const collisionRadius = level === MAP_RENDER_LEVELS.DETAIL ? 70 : 110;
	const maxNudge = level === MAP_RENDER_LEVELS.DETAIL ? 12 : 9;
	const minScale = level === MAP_RENDER_LEVELS.DETAIL ? 0.68 : 0.82;

	const entries = features
		.map((feature) => {
			const props = feature?.properties || {};
			const id = toSafeString(props.id);
			const lng = toFiniteNumber(feature?.geometry?.coordinates?.[0]);
			const lat = toFiniteNumber(feature?.geometry?.coordinates?.[1]);
			if (!id || lng === null || lat === null) return null;
			const promotion = resolvePromotionProfile(props);
			const screenPoint = toScreenPoint(lng, lat, projector);
			const explicitScale = toFiniteNumber(props.sign_scale);
			const baseScale = explicitScale ?? promotion.baseScale;
			return {
				id,
				feature,
				screenPoint,
				promotionScore:
					toFiniteNumber(props.promotion_score) ?? promotion.promotionScore,
				isDominant: promotion.isDominant,
				hasPrecisionSlot: promotion.hasPrecisionSlot,
				scale: clamp(baseScale, minScale, 2.2),
				nudgeX: 0,
				nudgeY: 0,
				density: 0,
			};
		})
		.filter(Boolean)
		.sort((a, b) => {
			if (b.promotionScore !== a.promotionScore) {
				return b.promotionScore - a.promotionScore;
			}
			const aVisibility = Number(a.feature?.properties?.visibility_score || 0);
			const bVisibility = Number(b.feature?.properties?.visibility_score || 0);
			if (bVisibility !== aVisibility) {
				return bVisibility - aVisibility;
			}
			return hashString(a.id) - hashString(b.id);
		});

	const grid = new Map();
	const byId = new Map();
	for (const entry of entries) {
		const neighbors = collectNeighborEntries(
			grid,
			entry.screenPoint.x,
			entry.screenPoint.y,
			cellSize,
		).filter(
			(candidate) =>
				distanceBetween(candidate.screenPoint, entry.screenPoint) <
				collisionRadius,
		);
		entry.density = neighbors.length;

		if (neighbors.length > 0 && !entry.hasPrecisionSlot) {
			const reduction = entry.isDominant
				? neighbors.length * 0.04
				: neighbors.length * 0.1;
			entry.scale = clamp(entry.scale * (1 - reduction), minScale, 2.2);
			const seed = hashString(entry.id);
			const angle = ((seed % 360) * Math.PI) / 180;
			const magnitude = Math.min(maxNudge, 2 + neighbors.length * 2.2);
			entry.nudgeX = round(Math.cos(angle) * magnitude, 3);
			entry.nudgeY = round(Math.sin(angle) * magnitude * 0.78, 3);
		}

		if (entry.isDominant && neighbors.length > 0) {
			for (const neighbor of neighbors) {
				if (neighbor.isDominant) continue;
				neighbor.scale = clamp(neighbor.scale * 0.86, minScale, 2.2);
			}
		}

		byId.set(entry.id, entry);
		const cellKey = buildCellKey(
			entry.screenPoint.x,
			entry.screenPoint.y,
			cellSize,
		);
		const bucket = grid.get(cellKey) || [];
		bucket.push(entry);
		grid.set(cellKey, bucket);
	}

	return features.map((feature) => {
		const id = toSafeString(feature?.properties?.id);
		if (!id || !byId.has(id)) return feature;
		const entry = byId.get(id);
		const scale = clamp(round(entry.scale, 3), minScale, 2.2);
		const promotionPriority = Math.round(entry.promotionScore * 10);
		const previousPriority = Number(
			feature?.properties?.neon_lod_priority ||
				feature?.properties?.visibility_score ||
				0,
		);
		return {
			...feature,
			properties: {
				...(feature?.properties || {}),
				sign_scale: scale,
				sign_nudge_x: entry.nudgeX,
				sign_nudge_y: entry.nudgeY,
				sign_density: entry.density,
				promotion_score: round(entry.promotionScore, 2),
				neon_lod_priority: Math.max(previousPriority, promotionPriority),
			},
		};
	});
};

export const buildMapPinPresentation = ({
	features = [],
	zoom,
	projector,
} = {}) => {
	if (!Array.isArray(features) || features.length === 0) {
		return {
			level: resolveMapRenderLevel(zoom),
			features: [],
		};
	}
	const level = resolveMapRenderLevel(zoom);
	const scopedFeatures =
		level === MAP_RENDER_LEVELS.DETAIL
			? features
			: aggregateByLevel(features, level);
	const laidOut = applyCrowdingLayout(scopedFeatures, {
		level,
		projector,
	});
	return {
		level,
		features: laidOut,
	};
};

export const __mapPinHierarchyInternals = {
	aggregateByLevel,
	applyCrowdingLayout,
	resolvePromotionProfile,
};
