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

	const cacheable200 = new workbox.cacheableResponse.CacheableResponsePlugin({
		statuses: [0, 200],
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

	// 2) Mapbox sprites/glyphs: CacheFirst.
	workbox.routing.registerRoute(
		({ url }) =>
			url.origin === "https://api.mapbox.com" &&
			(/\/styles\/v1\/.+\/sprite/.test(url.pathname) ||
				/\/fonts\/v1\//.test(url.pathname)),
		new workbox.strategies.CacheFirst({
			cacheName: `${CACHE_PREFIX}-mapbox-sprites-v1`,
			plugins: [cacheable200, expLong],
		}),
	);

	// 3) Fonts: CacheFirst.
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

	// 4) Core JS/CSS: CacheFirst.
	workbox.routing.registerRoute(
		({ request, url }) =>
			url.origin === self.location.origin &&
			(request.destination === "script" || request.destination === "style"),
		new workbox.strategies.CacheFirst({
			cacheName: `${CACHE_PREFIX}-core-assets-v1`,
			plugins: [cacheable200, expLong],
		}),
	);

	// 5) Non-video public images from Supabase storage: stale-while-revalidate.
	workbox.routing.registerRoute(
		({ url }) =>
			url.origin.includes("supabase.co") &&
			url.pathname.includes("/storage/v1/object/public/") &&
			!/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(url.pathname),
		new workbox.strategies.StaleWhileRevalidate({
			cacheName: `${CACHE_PREFIX}-supabase-images-v1`,
			plugins: [cacheable200, expLong],
		}),
	);

	// 6) Navigations: NetworkFirst to prefer fresh shell.
	workbox.routing.registerRoute(
		({ request }) => request.mode === "navigate",
		new workbox.strategies.NetworkFirst({
			cacheName: `${CACHE_PREFIX}-nav-v1`,
			networkTimeoutSeconds: API_TIMEOUT_SECONDS,
			plugins: [cacheable200, expShort],
		}),
	);
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
		icon: "/icons/icon-192x192.png",
		badge: "/icons/badge-72x72.png",
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
