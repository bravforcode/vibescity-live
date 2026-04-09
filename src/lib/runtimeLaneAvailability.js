const STORAGE_PREFIX = "vibecity.runtimeLaneUnavailable";
const inMemoryUnavailableUntil = new Map();

export const RUNTIME_LANES = Object.freeze({
	visitorBootstrap: "visitor-bootstrap",
	directionsProxy: "directions-proxy",
	hotRoads: "hot-roads",
	websocket: "websocket",
});

const KNOWN_HOST_RUNTIME_GAPS = Object.freeze({
	"vibecity-api.fly.dev": new Set([
		RUNTIME_LANES.visitorBootstrap,
		RUNTIME_LANES.directionsProxy,
		RUNTIME_LANES.hotRoads,
	]),
});

export const RUNTIME_LANE_TTL_MS = Object.freeze({
	[RUNTIME_LANES.visitorBootstrap]: 15 * 60 * 1000,
	[RUNTIME_LANES.directionsProxy]: 15 * 60 * 1000,
	[RUNTIME_LANES.hotRoads]: 15 * 60 * 1000,
	[RUNTIME_LANES.websocket]: 5 * 60 * 1000,
});

const now = () => Date.now();

const getStorageKey = (lane) =>
	`${STORAGE_PREFIX}:${String(lane || "unknown")}`;

const safeReadSessionValue = (key) => {
	if (typeof window === "undefined") return "";
	try {
		return window.sessionStorage.getItem(key) || "";
	} catch {
		return "";
	}
};

const safeWriteSessionValue = (key, value) => {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(key, String(value));
	} catch {
		// Ignore storage failures in locked-down browsers.
	}
};

const safeRemoveSessionValue = (key) => {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.removeItem(key);
	} catch {
		// Ignore storage failures in locked-down browsers.
	}
};

const parseUnavailableUntil = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const clearRuntimeLaneUnavailable = (lane) => {
	const key = getStorageKey(lane);
	inMemoryUnavailableUntil.delete(key);
	safeRemoveSessionValue(key);
};

export const getRuntimeLaneUnavailableUntil = (lane) => {
	const key = getStorageKey(lane);
	const unavailableUntil = Math.max(
		parseUnavailableUntil(inMemoryUnavailableUntil.get(key)),
		parseUnavailableUntil(safeReadSessionValue(key)),
	);

	if (unavailableUntil <= now()) {
		clearRuntimeLaneUnavailable(lane);
		return null;
	}

	return unavailableUntil;
};

export const isRuntimeLaneUnavailable = (lane) =>
	Boolean(getRuntimeLaneUnavailableUntil(lane));

export const isKnownMissingRuntimeLane = (lane, baseUrl) => {
	if (!lane || !baseUrl) return false;

	try {
		const parsed = new URL(
			baseUrl,
			typeof window !== "undefined"
				? window.location.origin
				: "https://vibescity.live",
		);
		return Boolean(KNOWN_HOST_RUNTIME_GAPS[parsed.hostname]?.has(lane));
	} catch {
		return false;
	}
};

export const markRuntimeLaneUnavailable = (
	lane,
	ttlMs = RUNTIME_LANE_TTL_MS[lane] || 5 * 60 * 1000,
) => {
	const unavailableUntil = now() + Math.max(1000, Number(ttlMs) || 0);
	const key = getStorageKey(lane);
	inMemoryUnavailableUntil.set(key, unavailableUntil);
	safeWriteSessionValue(key, unavailableUntil);
	return unavailableUntil;
};
