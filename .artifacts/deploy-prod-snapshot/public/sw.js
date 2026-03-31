// Service Worker for VibeCity.live (Workbox + Rsbuild inject manifest)
importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js");

const CACHE_PREFIX = String(self.VIBE_SW_CACHE_PREFIX || "vibecity");
const API_TIMEOUT_SECONDS = Number(self.VIBE_SW_API_TIMEOUT_SECONDS || 3);

if (workbox) {
	console.log("[SW] Workbox loaded");

	workbox.core.skipWaiting();
	workbox.core.clientsClaim();
	workbox.precaching.cleanupOutdatedCaches();
	workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

	// Precache offline fallback so it's available without network
	workbox.precaching.precacheAndRoute([
		{ url: "/offline.html", revision: "v1" },
	]);

	// Only cache genuine 200 OK responses — never opaque (status 0) ones.
	const cacheable200 = new workbox.cacheableResponse.CacheableResponsePlugin({
		statuses: [200],
	});

	// Separate plugin for Supabase images: must be a proper 200, no opaque.
	const cacheableImg = new workbox.cacheableResponse.CacheableResponsePlugin({
		statuses: [200],
	});

	const expShort = new workbox.expiration.ExpirationPlugin({
		maxEntries: 80,
		maxAgeSeconds: 24 * 60 * 60,
	});

	const expLong = new workbox.expiration.ExpirationPlugin({
		maxEntries: 300,
		maxAgeSeconds: 30 * 24 * 60 * 60,
	});

	// 1) API routes: NetworkFirst with 3s timeout fallback.
	workbox.routing.registerRoute(
		({ url }) =>
			url.pathname.startsWith("/api/") ||
			(url.origin.includes("supabase.co") &&
				(url.pathname.includes("/rest/v1/") ||
					url.pathname.includes("/functions/v1/"))),
		new workbox.strategies.NetworkFirst({
			cacheName: `${CACHE_PREFIX}-api-v1`,
			networkTimeoutSeconds: API_TIMEOUT_SECONDS,
			plugins: [cacheable200, expShort],
		}),
	);

	// 2) OpenFreeMap tiles: StaleWhileRevalidate — fresh tiles preferred but stale is fine
	//    7-day max age, 500 entries cap to prevent disk bloat (cost optimization: lowers bandwidth)
	workbox.routing.registerRoute(
		({ url }) => url.hostname === "tiles.openfreemap.org",
		new workbox.strategies.StaleWhileRevalidate({
			cacheName: `${CACHE_PREFIX}-openfreemap-tiles-v2`,
			plugins: [
				cacheable200,
				new workbox.expiration.ExpirationPlugin({
					maxEntries: 500,
					maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
				}),
			],
		}),
	);

	// 3) OpenMapTiles fonts: CacheFirst — font PBFs rarely change
	//    30-day max age, 50 entries (font files are few but large)
	workbox.routing.registerRoute(
		({ url }) => url.hostname === "fonts.openmaptiles.org",
		new workbox.strategies.CacheFirst({
			cacheName: `${CACHE_PREFIX}-map-fonts-v2`,
			plugins: [
				cacheable200,
				new workbox.expiration.ExpirationPlugin({
					maxEntries: 50,
					maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
				}),
			],
		}),
	);

	// 4) Fonts: CacheFirst.
	workbox.routing.registerRoute(
		({ request, url }) =>
			request.destination === "font" ||
			url.origin === "https://fonts.gstatic.com" ||
			url.origin === "https://fonts.googleapis.com",
		new workbox.strategies.CacheFirst({
			cacheName: `${CACHE_PREFIX}-fonts-v1`,
			plugins: [cacheable200, expLong],
		}),
	);

	// 5) Core JS/CSS: CacheFirst.
	workbox.routing.registerRoute(
		({ request, url }) =>
			url.origin === self.location.origin &&
			(request.destination === "script" || request.destination === "style"),
		new workbox.strategies.CacheFirst({
			cacheName: `${CACHE_PREFIX}-core-assets-v1`,
			plugins: [cacheable200, expLong],
		}),
	);

	// 6) Non-video public images from Supabase storage: stale-while-revalidate.
	// IMPORTANT: fetchOptions.mode = 'cors' prevents opaque responses (status 0)
	// that would otherwise cause 'ERR_FAILED / opaque response' browser errors.
	// maxEntries: 150 caps disk usage — ~150 venue photos on low-end storage.
	workbox.routing.registerRoute(
		({ url }) =>
			url.origin.includes("supabase.co") &&
			url.pathname.includes("/storage/v1/object/public/") &&
			!/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(url.pathname),
		new workbox.strategies.StaleWhileRevalidate({
			cacheName: `${CACHE_PREFIX}-supabase-images-v3`,
			fetchOptions: { mode: "cors", credentials: "omit" },
			plugins: [
				cacheableImg,
				new workbox.expiration.ExpirationPlugin({
					maxEntries: 150,
					maxAgeSeconds: 7 * 24 * 60 * 60,
				}),
			],
		}),
	);

	// 7) Navigations: NetworkFirst to prefer fresh shell.
	workbox.routing.registerRoute(
		({ request }) => request.mode === "navigate",
		new workbox.strategies.NetworkFirst({
			cacheName: `${CACHE_PREFIX}-nav-v1`,
			networkTimeoutSeconds: API_TIMEOUT_SECONDS,
			plugins: [cacheable200, expShort],
		}),
	);

	// Offline fallback — serve /offline.html for navigate requests that fail
	workbox.routing.setCatchHandler(async ({ request }) => {
		if (request.mode === "navigate") {
			return (
				(await caches.match("/offline.html")) ||
				new Response("Offline", { status: 503 })
			);
		}
		return Response.error();
	});
} else {
	console.error("[SW] Workbox failed to load");
}

// ---------------------------------------------------------
// ✅ Background Sync & Notifications (Legacy Support)
// ---------------------------------------------------------

self.addEventListener("sync", (event) => {
	if (event.tag === "sync-favorites") {
		event.waitUntil(syncFavorites());
	}
});

async function syncFavorites() {
	console.log("[SW] Syncing favorites...");
}

// Push notifications
self.addEventListener("push", (event) => {
	const data = event.data?.json() || {};

	const defaultActions = [
		{ action: "open", title: "Open" },
		{ action: "dismiss", title: "Dismiss" },
	];

	const options = {
		body: data.body || "Check out what's happening!",
		icon: "/images/icon-192.png",
		badge: "/images/icon-192.png",
		vibrate: [100, 50, 100],
		data: {
			url: data.url || "/",
			rideId: data.rideId || null
		},
		actions: data.actions || defaultActions,
	};
	event.waitUntil(
		self.registration.showNotification(data.title || "VibeCity", options),
	);
});

self.addEventListener("notificationclick", (event) => {
	const clickedNotification = event.notification;
	clickedNotification.close();

	const data = clickedNotification.data || {};

	// Deep OS Integration: Actionable Push Notifications
	if (event.action === "rate_driver") {
		event.waitUntil(
			clients.openWindow(`/rate-ride?id=${data.rideId || ''}`)
		);
		return;
	}

	if (event.action === "tip_driver") {
		event.waitUntil(
			clients.openWindow(`/tip-ride?id=${data.rideId || ''}`)
		);
		return;
	}

	if (event.action === "open" || !event.action) {
		event.waitUntil(clients.openWindow(data.url || "/"));
	}
});
