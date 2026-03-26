const HIGH_ZOOM_NEON_MIN_ZOOM = 13;
const CLUSTER_DISTANCE_PX = 132;
const VIEWPORT_MARGIN_PX = 140;

export const NEON_FULL_SLOT_OFFSETS = Object.freeze({
	center: [0, -16],
	left: [-68, -20],
	right: [68, -20],
	upper: [0, -90],
	lower: [0, 10],
	"upper-left": [-68, -64],
	"upper-right": [68, -64],
	"lower-left": [-68, 8],
	"lower-right": [68, 8],
	"far-left": [-102, -24],
	"far-right": [102, -24],
	"far-upper-left": [-102, -88],
	"far-upper-right": [102, -88],
});

const SLOT_META = Object.freeze({
	center: { scale: 0.78, slotRank: 0, vector: [0, 0] },
	left: { scale: 0.72, slotRank: 1, vector: [-1, 0] },
	right: { scale: 0.72, slotRank: 1, vector: [1, 0] },
	upper: { scale: 0.7, slotRank: 1, vector: [0, -1] },
	lower: { scale: 0.68, slotRank: 3, vector: [0, 1] },
	"upper-left": { scale: 0.71, slotRank: 1, vector: [-1, -1] },
	"upper-right": { scale: 0.71, slotRank: 1, vector: [1, -1] },
	"lower-left": { scale: 0.67, slotRank: 2, vector: [-1, 1] },
	"lower-right": { scale: 0.67, slotRank: 2, vector: [1, 1] },
	"far-left": { scale: 0.64, slotRank: 4, vector: [-2, 0] },
	"far-right": { scale: 0.64, slotRank: 4, vector: [2, 0] },
	"far-upper-left": { scale: 0.62, slotRank: 3, vector: [-2, -2] },
	"far-upper-right": { scale: 0.62, slotRank: 3, vector: [2, -2] },
});

const SLOT_NAMES = Object.freeze(Object.keys(NEON_FULL_SLOT_OFFSETS));

const DEFAULT_LAYOUT = Object.freeze({
	neon_slot_full: "center",
	neon_block_id: "solo",
	neon_scale_full: 0.76,
	neon_sort_key: 0,
});

const toFiniteNumber = (value) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

const normalizeId = (value) => String(value ?? "").trim();

const normalizeBlockValue = (value) =>
	String(value ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "") || "block";

const buildDefaultProps = (feature) => ({
	...DEFAULT_LAYOUT,
	neon_block_id: `solo-${normalizeBlockValue(
		feature?.properties?.id ?? feature?.properties?.neon_key ?? "feature",
	)}`,
	neon_sort_key: Number(feature?.properties?.neon_lod_priority || 0) || 0,
});

const getPreferredSlotsForCandidate = ({ x, y }, centroid, isPrimary) => {
	if (isPrimary) {
		return [
			"center",
			"upper",
			"upper-left",
			"upper-right",
			"left",
			"right",
			"lower-left",
			"lower-right",
			"lower",
		];
	}

	const deltaX = x - centroid.x;
	const deltaY = y - centroid.y;
	if (deltaX <= -18) {
		return deltaY <= -12
			? ["upper-left", "left", "far-upper-left", "lower-left", "far-left"]
			: deltaY >= 18
				? ["lower-left", "left", "upper-left", "far-left", "center"]
				: ["left", "upper-left", "lower-left", "far-left", "center"];
	}
	if (deltaX >= 18) {
		return deltaY <= -12
			? ["upper-right", "right", "far-upper-right", "lower-right", "far-right"]
			: deltaY >= 18
				? ["lower-right", "right", "upper-right", "far-right", "center"]
				: ["right", "upper-right", "lower-right", "far-right", "center"];
	}
	if (deltaY <= -14) {
		return ["upper", "upper-left", "upper-right", "left", "right", "center"];
	}
	if (deltaY >= 14) {
		return ["lower", "lower-left", "lower-right", "left", "right", "center"];
	}
	return [
		"upper",
		"left",
		"right",
		"center",
		"upper-left",
		"upper-right",
		"lower-left",
		"lower-right",
		"lower",
	];
};

const scoreSlotForCandidate = ({ x, y }, centroid, slotName, isPrimary) => {
	if (isPrimary && slotName === "center") return -1000;
	const slot = SLOT_META[slotName] || SLOT_META.center;
	const dx = x - centroid.x;
	const dy = y - centroid.y;
	const desiredX = Math.abs(dx) <= 8 ? 0 : dx > 0 ? 1 : -1;
	const desiredY = Math.abs(dy) <= 8 ? 0 : dy > 0 ? 1 : -1;
	const [slotX, slotY] = slot.vector;
	const horizontalPenalty = Math.abs(Math.sign(slotX) - desiredX) * 16;
	const verticalPenalty = Math.abs(Math.sign(slotY) - desiredY) * 14;
	const centerPenalty = slotName === "center" && !isPrimary ? 20 : 0;
	return (
		horizontalPenalty + verticalPenalty + slot.slotRank * 4 + centerPenalty
	);
};

const pickBestSlot = (candidate, centroid, usedSlots, isPrimary) => {
	const preferredSlots = getPreferredSlotsForCandidate(
		candidate,
		centroid,
		isPrimary,
	);
	const ranked = SLOT_NAMES.map((slotName) => ({
		constraintPenalty:
			preferredSlots.indexOf(slotName) >= 0
				? preferredSlots.indexOf(slotName) * 5
				: 40,
		slotName,
		score: scoreSlotForCandidate(candidate, centroid, slotName, isPrimary),
	}))
		.sort(
			(left, right) =>
				left.score +
				left.constraintPenalty -
				(right.score + right.constraintPenalty),
		)
		.map((entry) => entry.slotName);

	for (const slotName of ranked) {
		if (!usedSlots.has(slotName)) return slotName;
	}
	return "center";
};

const createUnionFind = (size) => {
	const parents = Array.from({ length: size }, (_, index) => index);
	const find = (index) => {
		let node = index;
		while (parents[node] !== node) {
			parents[node] = parents[parents[node]];
			node = parents[node];
		}
		return node;
	};
	const union = (left, right) => {
		const leftRoot = find(left);
		const rightRoot = find(right);
		if (leftRoot !== rightRoot) {
			parents[rightRoot] = leftRoot;
		}
	};
	return { find, union };
};

const projectCandidates = (features, mapInstance) => {
	const canvas = mapInstance?.getCanvas?.();
	const width = canvas?.width ?? 0;
	const height = canvas?.height ?? 0;
	if (!width || !height) return [];

	const candidates = [];
	for (const feature of features) {
		if (!feature?.properties?.neon_key) continue;
		const coordinates = feature?.geometry?.coordinates;
		const lng = toFiniteNumber(coordinates?.[0]);
		const lat = toFiniteNumber(coordinates?.[1]);
		if (lng === null || lat === null) continue;
		let point = null;
		try {
			point = mapInstance.project([lng, lat]);
		} catch {
			point = null;
		}
		if (!point) continue;
		if (
			point.x < -VIEWPORT_MARGIN_PX ||
			point.x > width + VIEWPORT_MARGIN_PX ||
			point.y < -VIEWPORT_MARGIN_PX ||
			point.y > height + VIEWPORT_MARGIN_PX
		) {
			continue;
		}
		candidates.push({
			feature,
			id:
				normalizeId(feature?.properties?.id) ||
				normalizeId(feature?.properties?.neon_key) ||
				`${lng},${lat}`,
			x: point.x,
			y: point.y,
			priority: Number(feature?.properties?.neon_lod_priority || 0) || 0,
		});
	}
	return candidates;
};

const buildClusters = (candidates) => {
	const unionFind = createUnionFind(candidates.length);
	const buckets = new Map();
	const cellSize = CLUSTER_DISTANCE_PX;

	const getCellKey = (cellX, cellY) => `${cellX}:${cellY}`;

	for (let index = 0; index < candidates.length; index += 1) {
		const candidate = candidates[index];
		const cellX = Math.floor(candidate.x / cellSize);
		const cellY = Math.floor(candidate.y / cellSize);

		for (let dx = -1; dx <= 1; dx += 1) {
			for (let dy = -1; dy <= 1; dy += 1) {
				const bucket = buckets.get(getCellKey(cellX + dx, cellY + dy));
				if (!bucket) continue;
				for (const otherIndex of bucket) {
					const other = candidates[otherIndex];
					const distance = Math.hypot(
						candidate.x - other.x,
						candidate.y - other.y,
					);
					if (distance <= CLUSTER_DISTANCE_PX) {
						unionFind.union(index, otherIndex);
					}
				}
			}
		}

		const ownBucketKey = getCellKey(cellX, cellY);
		const ownBucket = buckets.get(ownBucketKey) || [];
		ownBucket.push(index);
		buckets.set(ownBucketKey, ownBucket);
	}

	const clusters = new Map();
	for (let index = 0; index < candidates.length; index += 1) {
		const root = unionFind.find(index);
		const bucket = clusters.get(root) || [];
		bucket.push(candidates[index]);
		clusters.set(root, bucket);
	}
	return [...clusters.values()];
};

const applyClusterLayout = (members, layoutById) => {
	const centroid = members.reduce(
		(accumulator, member) => ({
			x: accumulator.x + member.x / members.length,
			y: accumulator.y + member.y / members.length,
		}),
		{ x: 0, y: 0 },
	);
	const orderedMembers = [...members].sort((left, right) => {
		if (right.priority !== left.priority) return right.priority - left.priority;
		if (left.y !== right.y) return left.y - right.y;
		if (left.x !== right.x) return left.x - right.x;
		return left.id.localeCompare(right.id);
	});

	const blockAnchor = orderedMembers[0]?.id || "cluster";
	const blockId = `block-${normalizeBlockValue(blockAnchor)}-${Math.round(
		centroid.x / 12,
	)}-${Math.round(centroid.y / 12)}`;
	const usedSlots = new Set();
	const densityPenalty =
		members.length >= 6 ? 0.05 : members.length >= 4 ? 0.03 : 0;

	for (let index = 0; index < orderedMembers.length; index += 1) {
		const member = orderedMembers[index];
		const isPrimary = index === 0;
		const slotName =
			members.length === 1
				? "center"
				: pickBestSlot(member, centroid, usedSlots, isPrimary);
		usedSlots.add(slotName);
		const slotMeta = SLOT_META[slotName] || SLOT_META.center;
		const emphasisBoost = isPrimary ? 0.05 : 0;
		layoutById.set(member.id, {
			neon_slot_full: slotName,
			neon_block_id: blockId,
			neon_scale_full: Math.max(
				0.68,
				Math.min(0.96, slotMeta.scale - densityPenalty + emphasisBoost),
			),
			neon_sort_key: member.priority + (isPrimary ? 40 : 0) - slotMeta.slotRank,
		});
	}
};

export function applyOrderedNeonLayout(
	features = [],
	mapInstance,
	{ minZoom = HIGH_ZOOM_NEON_MIN_ZOOM } = {},
) {
	if (!Array.isArray(features) || features.length === 0) return [];

	const baseFeatures = features.map((feature) => {
		if (!feature?.properties?.neon_key) return feature;
		return {
			...feature,
			properties: {
				...(feature.properties || {}),
				...buildDefaultProps(feature),
			},
		};
	});

	if (!mapInstance) return baseFeatures;
	const zoom = Number(mapInstance.getZoom?.() ?? 0);
	if (!Number.isFinite(zoom) || zoom < minZoom) return baseFeatures;

	const candidates = projectCandidates(baseFeatures, mapInstance);
	if (candidates.length === 0) return baseFeatures;

	const layoutById = new Map();
	for (const cluster of buildClusters(candidates)) {
		applyClusterLayout(cluster, layoutById);
	}

	return baseFeatures.map((feature) => {
		if (!feature?.properties?.neon_key) return feature;
		const id =
			normalizeId(feature?.properties?.id) ||
			normalizeId(feature?.properties?.neon_key);
		const layout = layoutById.get(id);
		if (!layout) return feature;
		return {
			...feature,
			properties: {
				...(feature.properties || {}),
				...layout,
			},
		};
	});
}

export { HIGH_ZOOM_NEON_MIN_ZOOM };
