const toFinite = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export const sanitizeShopName = (raw) =>
	String(raw ?? "")
		.replace(/[<>"'&]/g, "")
		.split("")
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code >= 32;
		})
		.join("")
		.trim()
		.slice(0, 60);

export const isValidCoordinatePair = (
	coordinates,
	{ allowNullIsland = false } = {},
) => {
	if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
	const lng = toFinite(coordinates[0]);
	const lat = toFinite(coordinates[1]);
	if (lng === null || lat === null) return false;
	if (lng < -180 || lng > 180) return false;
	if (lat < -90 || lat > 90) return false;
	if (!allowNullIsland && lng === 0 && lat === 0) return false;
	return true;
};

const sanitizeFeatureProperties = (properties = {}) => {
	const signNudgeX = toFinite(properties.sign_nudge_x) ?? 0;
	const signNudgeY = toFinite(properties.sign_nudge_y) ?? 0;
	const signScale = toFinite(properties.sign_scale) ?? 1;
	const nextName = sanitizeShopName(
		properties.name || properties.neon_line1 || "SHOP",
	);
	return {
		...properties,
		name: nextName,
		neon_line1: sanitizeShopName(properties.neon_line1 || nextName || "SHOP"),
		neon_line2: sanitizeShopName(properties.neon_line2 || ""),
		sign_scale: signScale,
		sign_nudge_x: signNudgeX,
		sign_nudge_y: signNudgeY,
		sign_offset: [signNudgeX, signNudgeY],
	};
};

export const sanitizeFeatures = (features = [], options = {}) => {
	if (!Array.isArray(features)) return [];
	const { allowNullIsland = false } = options;
	return features
		.filter((feature) => feature?.type === "Feature")
		.filter((feature) =>
			isValidCoordinatePair(feature?.geometry?.coordinates, {
				allowNullIsland,
			}),
		)
		.map((feature) => ({
			...feature,
			properties: sanitizeFeatureProperties(feature?.properties || {}),
		}));
};

export const sanitizeFeatureCollection = (collection = {}, options = {}) => ({
	type: "FeatureCollection",
	features: sanitizeFeatures(collection?.features || [], options),
});
