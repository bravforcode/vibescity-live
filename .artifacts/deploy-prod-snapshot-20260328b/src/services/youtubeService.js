/**
 * YouTube Data API v3 video search for venue content.
 * Requires VITE_YOUTUBE_API_KEY to be set.
 * Results are cached in sessionStorage to avoid repeat API calls.
 */

const SESSION_PREFIX = "yt:";

/**
 * Search YouTube for a video related to a venue.
 * Returns the best-match YouTube watch URL, or null if not found.
 *
 * @param {string} venueName
 * @param {string} [city]
 * @returns {Promise<string|null>} YouTube watch URL (e.g. "https://www.youtube.com/watch?v=abc123")
 */
export async function searchVenueVideo(venueName, city = "") {
	const key = import.meta.env?.VITE_YOUTUBE_API_KEY;
	if (!key || !venueName) return null;

	const query = city ? `${venueName} ${city}` : venueName;
	const cacheKey = `${SESSION_PREFIX}${query}`;

	try {
		const cached = sessionStorage.getItem(cacheKey);
		if (cached !== null) return cached || null; // "" means "no video found"
	} catch {
		// sessionStorage unavailable
	}

	try {
		const searchUrl =
			`https://www.googleapis.com/youtube/v3/search` +
			`?part=snippet&q=${encodeURIComponent(query)}&type=video` +
			`&maxResults=1&safeSearch=none&key=${key}`;

		const res = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
		if (!res.ok) {
			try {
				sessionStorage.setItem(cacheKey, "");
			} catch {
				/* noop */
			}
			return null;
		}

		const data = await res.json();
		const videoId = data?.items?.[0]?.id?.videoId ?? null;
		const videoUrl = videoId
			? `https://www.youtube.com/watch?v=${videoId}`
			: null;

		try {
			sessionStorage.setItem(cacheKey, videoUrl ?? "");
		} catch {
			/* noop */
		}
		return videoUrl;
	} catch {
		return null;
	}
}
