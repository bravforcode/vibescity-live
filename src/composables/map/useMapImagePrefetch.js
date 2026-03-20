/**
 * useMapImagePrefetch — Spatial Predictive Image Cache Warmer
 *
 * God-tier version. When the user pans the map and rests, this composable
 * silently primes the browser image cache for all visible shops — prioritized
 * by distance from the viewport center, so the most likely taps hit cache first.
 *
 * Improvements over v1:
 *  ① Center-proximity sort    — closest-to-center shops prefetched first
 *  ② Session-level cache      — never double-fetches a URL in a session
 *  ③ Multi-URL support        — prefetches Image_URL1 AND thumbnail if available
 *  ④ Adaptive batch size      — 3G→6, 4G→12, wifi→20 images per pass
 *  ⑤ <link rel="prefetch">   — strongest browser hint for top-3 center shops
 *  ⑥ `warmShop(shop)`        — call on hover to pre-warm before tap
 *  ⑦ Zero-dep, zero-cost      — no library, no Vue state, no layout impact
 */
import { onUnmounted, watch } from "vue";
import { prefetchCriticalPins } from "./prefetchCriticalPins";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Debounce delay after map 'moveend' before prefetching begins (ms). */
const DEBOUNCE_MS = 280;

/** How many degrees beyond the viewport edge to include (buffer zone ~220m). */
const MARGIN_DEG = 0.002;

/** Max images per session (global safety valve against bandwidth abuse). */
const SESSION_CAP = 300;

/** URLs already requested this session — prevents duplicate work across pans. */
const _sessionCache = new Set();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the adaptive batch size based on detected network quality.
 * Falls back to a conservative 10 if the Connection API is unavailable.
 */
const batchSize = () => {
	const conn =
		navigator.connection ??
		navigator.mozConnection ??
		navigator.webkitConnection;
	const type = conn?.effectiveType ?? "4g";
	if (type === "slow-2g" || type === "2g") return 0; // Skip entirely
	if (type === "3g") return 6;
	if (type === "4g") return 12;
	return 20; // wifi / unknown
};

/** Returns false when the user has requested reduced data usage. */
const isSafeToFetch = () => {
	if (typeof navigator === "undefined") return false;
	const conn =
		navigator.connection ??
		navigator.mozConnection ??
		navigator.webkitConnection;
	if (conn?.saveData) return false;
	return batchSize() > 0;
};

/**
 * Schedules `fn` during the browser's idle period.
 * Falls back to a micro-timeout for Safari < 17, which lacks rIC.
 */
const whenIdle = (fn) => {
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(fn, { timeout: 2500 });
	} else {
		setTimeout(fn, 1);
	}
};

/**
 * Injects a `<link rel="prefetch">` element for the given URL.
 * This is the strongest hint available — browsers treat it as a
 * navigation-level resource and fetch it at the highest idle priority.
 * Safe to call multiple times; duplicate hrefs are deduplicated by the browser.
 */
const linkPrefetch = (url) => {
	if (typeof document === "undefined") return;
	const existing = document.querySelector(
		`link[rel="prefetch"][href="${CSS.escape?.(url) ?? url}"]`,
	);
	if (existing) return;
	const link = document.createElement("link");
	link.rel = "prefetch";
	link.as = "image";
	link.href = url;
	link.crossOrigin = "anonymous";
	document.head.appendChild(link);
};

/**
 * Primes the browser HTTP cache for the given URL using a detached Image.
 * `new Image()` is the lightest fetch mechanism — it populates the cache
 * without blocking rendering or consuming a high-priority network slot.
 */
const warmUrl = (url) => {
	if (!url || typeof url !== "string" || _sessionCache.has(url)) return false;
	if (_sessionCache.size >= SESSION_CAP) return false;
	_sessionCache.add(url);
	const img = new Image();
	img.decoding = "async";
	img.crossOrigin = "anonymous";
	img.src = url;
	return true;
};

/**
 * Returns all prefetchable image URLs from a shop object, in priority order.
 */
const urlsFromShop = (shop) =>
	[
		shop.Image_URL1,
		shop.Image_URL2,
		shop.image_url,
		shop.imageUrl,
		shop.thumbnail,
	].filter((u) => u && typeof u === "string");

// ── Composable ────────────────────────────────────────────────────────────────

/**
 * @param {import('vue').Ref} mapRef   — ref to the raw Mapbox GL map instance
 * @param {import('vue').Ref} shopsRef — ref/computed for the shop array
 */
export function useMapImagePrefetch(mapRef, shopsRef) {
	let debounceTimer = null;
	let isDestroyed = false;

	// ── Core prefetch pass ────────────────────────────────────────────────────

	const prefetchViewportImages = () => {
		if (isDestroyed) return;
		const map = mapRef.value;
		if (!map || typeof map.getBounds !== "function") return;
		if (!isSafeToFetch()) return;

		const shops = shopsRef.value;
		if (!Array.isArray(shops) || shops.length === 0) return;

		whenIdle(() => {
			if (isDestroyed) return;

			const bounds = map.getBounds();
			if (!bounds) return;

			// Viewport extent + margin
			const swLng = bounds.getWest() - MARGIN_DEG;
			const swLat = bounds.getSouth() - MARGIN_DEG;
			const neLng = bounds.getEast() + MARGIN_DEG;
			const neLat = bounds.getNorth() + MARGIN_DEG;

			// Viewport center for distance-priority sorting
			const centerLng = (swLng + neLng) / 2;
			const centerLat = (swLat + neLat) / 2;

			// ① Filter shops to those inside viewport
			const visible = [];
			for (const shop of shops) {
				const lat = Number(shop?.lat ?? shop?.latitude);
				const lng = Number(shop?.lng ?? shop?.longitude);
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
				if (lat < swLat || lat > neLat || lng < swLng || lng > neLng) continue;
				// Cheap distance proxy (no sqrt needed — only used for relative sort)
				const dLat = lat - centerLat;
				const dLng = lng - centerLng;
				const dist2 = dLat * dLat + dLng * dLng;
				visible.push({ shop, dist2 });
			}

			// ② Sort by proximity to center — most likely tap targets first
			visible.sort((a, b) => a.dist2 - b.dist2);

			// ③ Prefetch images in priority order
			const limit = batchSize();
			let primary = 0; // count shops whose hero image was fetched

			for (const { shop } of visible) {
				if (primary >= limit) break;
				const urls = urlsFromShop(shop);
				if (urls.length === 0) continue;

				// <link rel="prefetch"> for the 3 nearest shops (highest OS-level hint)
				if (primary < 3) {
					linkPrefetch(urls[0]);
				}

				// Warm all available image URLs for this shop
				let fetched = false;
				for (const url of urls) {
					if (warmUrl(url)) fetched = true;
				}
				if (fetched) primary++;
			}
		});
	};

	// ── Public API ────────────────────────────────────────────────────────────

	/**
	 * Immediately warm a specific shop's images (e.g. on pin hover).
	 * Call this from a `pointerenter` or `mousemove` handler to guarantee
	 * the image is in cache before the user taps.
	 */
	const warmShop = (shop) => {
		if (!shop || !isSafeToFetch()) return;
		for (const url of urlsFromShop(shop)) {
			warmUrl(url);
		}
	};

	// ── Map listener lifecycle ────────────────────────────────────────────────

	const onMoveEnd = () => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(prefetchViewportImages, DEBOUNCE_MS);
	};

	let currentMap = null;
	const attachListener = (map) => {
		if (currentMap) currentMap.off("moveend", onMoveEnd);
		currentMap = map ?? null;
		if (currentMap?.on) currentMap.on("moveend", onMoveEnd);
	};

	const stopWatch = watch(mapRef, (map) => attachListener(map), {
		immediate: true,
	});

	onUnmounted(() => {
		isDestroyed = true;
		clearTimeout(debounceTimer);
		stopWatch();
		if (currentMap) {
			currentMap.off("moveend", onMoveEnd);
			currentMap = null;
		}
	});

	return {
		prefetchViewportImages,
		warmShop,
		prefetchCriticalPins, // Re-exported for composable consumers
	};
}
