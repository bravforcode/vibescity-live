import { isFrontendOnlyDevMode } from "./runtimeConfig";

let venueSnapshotPromise = null;
const LOCALHOST_SNAPSHOT_URL = "/data/venues-localhost-snapshot.json";

const toSafeNumber = (value, fallback = 0) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeVenueSnapshotRow = (row) => {
	if (!row || typeof row !== "object") return null;
	const imageUrls = Array.isArray(row.image_urls)
		? row.image_urls
		: Array.isArray(row.images)
			? row.images
			: [];
	const videoUrl =
		typeof row.video_url === "string"
			? row.video_url
			: typeof row.videoUrl === "string"
				? row.videoUrl
				: Array.isArray(row.videos) && typeof row.videos[0] === "string"
					? row.videos[0]
					: "";
	const realMedia = Array.isArray(row.real_media)
		? row.real_media
		: Array.isArray(row.media)
			? row.media
			: [];
	const mediaCounts =
		row.media_counts && typeof row.media_counts === "object"
			? {
					images: toSafeNumber(row.media_counts.images, imageUrls.length),
					videos: toSafeNumber(row.media_counts.videos, videoUrl ? 1 : 0),
					total: toSafeNumber(
						row.media_counts.total,
						imageUrls.length + (videoUrl ? 1 : 0),
					),
				}
			: row.counts && typeof row.counts === "object"
				? {
						images: toSafeNumber(row.counts.images, imageUrls.length),
						videos: toSafeNumber(row.counts.videos, videoUrl ? 1 : 0),
						total: toSafeNumber(
							row.counts.total,
							imageUrls.length + (videoUrl ? 1 : 0),
						),
					}
				: {
						images: imageUrls.length,
						videos: videoUrl ? 1 : 0,
						total: imageUrls.length + (videoUrl ? 1 : 0),
					};
	return {
		...row,
		status: row.status || "active",
		total_views: toSafeNumber(row.total_views ?? row.view_count, 0),
		view_count: toSafeNumber(row.view_count ?? row.total_views, 0),
		rating: toSafeNumber(row.rating, 0),
		image_urls: imageUrls,
		images: imageUrls,
		video_url: videoUrl,
		videos: videoUrl ? [videoUrl] : [],
		videoUrl,
		real_media: realMedia,
		media: realMedia,
		media_counts: mediaCounts,
		counts: mediaCounts,
		coverage:
			row.coverage && typeof row.coverage === "object"
				? row.coverage
				: row.media_coverage && typeof row.media_coverage === "object"
					? row.media_coverage
					: {
							has_images: mediaCounts.images > 0,
							has_videos: mediaCounts.videos > 0,
							has_media: mediaCounts.total > 0,
							has_complete_media:
								mediaCounts.images > 0 && mediaCounts.videos > 0,
						},
		media_coverage:
			row.media_coverage && typeof row.media_coverage === "object"
				? row.media_coverage
				: row.coverage && typeof row.coverage === "object"
					? row.coverage
					: {
							has_images: mediaCounts.images > 0,
							has_videos: mediaCounts.videos > 0,
							has_media: mediaCounts.total > 0,
							has_complete_media:
								mediaCounts.images > 0 && mediaCounts.videos > 0,
						},
		has_real_image: mediaCounts.images > 0,
		has_real_video: mediaCounts.videos > 0,
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
	const rows = Array.isArray(payload?.rows)
		? payload.rows
		: Array.isArray(payload)
			? payload
			: [];
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
