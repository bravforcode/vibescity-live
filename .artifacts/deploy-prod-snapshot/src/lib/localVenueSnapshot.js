import { isFrontendOnlyDevMode } from "./runtimeConfig";

let venueSnapshotPromise = null;
const LOCALHOST_SNAPSHOT_URL = "/data/venues-localhost-snapshot.json";

const toSafeNumber = (value, fallback = 0) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeVenueSnapshotRow = (row) => {
	if (!row || typeof row !== "object") return null;
	return {
		...row,
		status: row.status || "active",
		total_views: toSafeNumber(row.total_views ?? row.view_count, 0),
		view_count: toSafeNumber(row.view_count ?? row.total_views, 0),
		rating: toSafeNumber(row.rating, 0),
		image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
		pin_type: row.pin_type || "normal",
		pin_metadata:
			row.pin_metadata && typeof row.pin_metadata === "object"
				? row.pin_metadata
				: {},
		is_verified: Boolean(row.is_verified),
	};
};

const loadSnapshotFile = async () => {
	const response = await fetch(LOCALHOST_SNAPSHOT_URL, {
		// Localhost snapshot generation changes frequently during dev/preview.
		// Avoid stale browser cache entries that can freeze the store at zero rows.
		cache: "no-store",
	});
	if (!response.ok) {
		throw new Error(`Localhost snapshot request failed: ${response.status}`);
	}
	const payload = await response.json();
	const rows = Array.isArray(payload?.rows) ? payload.rows : [];
	return rows.map(normalizeVenueSnapshotRow).filter(Boolean);
};

export const shouldUseLocalVenueSnapshot = () => isFrontendOnlyDevMode();

export const loadLocalVenueSnapshotRows = async () => {
	if (!shouldUseLocalVenueSnapshot()) return [];
	if (!venueSnapshotPromise) {
		venueSnapshotPromise = loadSnapshotFile().catch(() => []);
	}
	return venueSnapshotPromise;
};

export const getLocalVenueSnapshotRowById = async (id) => {
	if (!id) return null;
	const rows = await loadLocalVenueSnapshotRows();
	const key = String(id).trim();
	return rows.find((row) => String(row?.id || "").trim() === key) || null;
};
