export const normalizeSelectionVenueId = (value) => {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim();
	return normalized || null;
};

export const getDefaultSelectionCameraMode = (surface = "preview") =>
	surface === "detail" ? "detail-focus" : "preview-focus";

export const getCenteredSelectionSource = (reason) =>
	reason === "carousel" ? "carousel" : "startup";

export const buildMapSelectionIntent = ({
	requestId,
	shop = null,
	shopId = null,
	source = "carousel",
	surface = "preview",
	cameraMode,
	popupMode = "compact",
	routeMode = "none",
	issuedAt = Date.now(),
} = {}) => {
	const normalizedShopId = normalizeSelectionVenueId(shop?.id ?? shopId);
	if (!normalizedShopId) return null;

	const lat = Number(shop?.lat ?? shop?.latitude);
	const lng = Number(shop?.lng ?? shop?.longitude);

	return {
		requestId,
		shopId: normalizedShopId,
		source,
		surface,
		cameraMode: cameraMode || getDefaultSelectionCameraMode(surface),
		popupMode,
		routeMode,
		coords: Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null,
		issuedAt,
	};
};
