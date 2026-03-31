import { MAP_CONFIG } from "@/config/mapConfig";

export const MAP_RENDER_LEVELS = Object.freeze({
	DETAIL: "detail",
	ZONE: "zone",
	PROVINCE: "province",
});

export const MAP_LEVEL_THRESHOLDS = Object.freeze({
	detailMinZoom: Number(MAP_CONFIG?.zoom?.lod?.full?.min ?? 15),
	zoneMinZoom: 7,
});

const toFiniteNumber = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export const resolveMapRenderLevel = (
	zoom,
	thresholds = MAP_LEVEL_THRESHOLDS,
) => {
	const safeZoom = toFiniteNumber(zoom) ?? MAP_LEVEL_THRESHOLDS.detailMinZoom;
	const detailMinZoom =
		toFiniteNumber(thresholds?.detailMinZoom) ??
		MAP_LEVEL_THRESHOLDS.detailMinZoom;
	const zoneMinZoom =
		toFiniteNumber(thresholds?.zoneMinZoom) ?? MAP_LEVEL_THRESHOLDS.zoneMinZoom;

	if (safeZoom >= detailMinZoom) {
		return MAP_RENDER_LEVELS.DETAIL;
	}
	if (safeZoom >= zoneMinZoom) {
		return MAP_RENDER_LEVELS.ZONE;
	}
	return MAP_RENDER_LEVELS.PROVINCE;
};

export const getDrilldownZoomForLevel = (level) => {
	switch (level) {
		case MAP_RENDER_LEVELS.PROVINCE:
			return Number(MAP_CONFIG?.zoom?.lod?.compact?.min ?? 11.2);
		case MAP_RENDER_LEVELS.ZONE:
			return Number(MAP_CONFIG?.zoom?.lod?.full?.min ?? 15);
		default:
			return Number(MAP_CONFIG?.zoom?.lod?.full?.min ?? 15) + 0.2;
	}
};
