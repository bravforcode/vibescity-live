import { normalizeMapStyleMode, QUIET_MAP_STYLE_MODE } from "./mapStyleMode";

const hasNonEmptyString = (value) =>
	typeof value === "string" && value.trim().length > 0;

export const hasRenderableStyleSourcesFromStyle = (style) => {
	const sources = Object.values(style?.sources || {});
	if (sources.length === 0) return false;
	return sources.some((source) => {
		if (!source || typeof source !== "object") return false;
		if (Array.isArray(source.tiles) && source.tiles.length > 0) return true;
		if (hasNonEmptyString(source.url)) return true;
		if (hasNonEmptyString(source.data)) return true;
		return false;
	});
};

export const hasBasemapResourceActivitySince = (
	resourceEntries,
	since = 0,
	hostSnippets = [],
) =>
	resourceEntries.some((entry) => {
		const startTime = Number(entry?.startTime || 0);
		if (startTime + 1 < since) return false;
		const name = String(entry?.name || "").toLowerCase();
		if (!name) return false;
		return (
			name.includes("/glyphs/") ||
			name.includes("/sprite") ||
			name.includes("/tiles/") ||
			name.endsWith(".pbf") ||
			name.endsWith(".mvt") ||
			hostSnippets.some((snippet) =>
				name.includes(String(snippet || "").toLowerCase()),
			)
		);
	});

export const isMapContentReadyForMode = ({
	styleMode = "prod",
	shellReady = false,
	style = null,
	resourceEntries = [],
	since = 0,
	hostSnippets = [],
} = {}) => {
	if (normalizeMapStyleMode(styleMode) === QUIET_MAP_STYLE_MODE) {
		return shellReady || hasRenderableStyleSourcesFromStyle(style);
	}
	return (
		hasRenderableStyleSourcesFromStyle(style) &&
		hasBasemapResourceActivitySince(resourceEntries, since, hostSnippets)
	);
};
