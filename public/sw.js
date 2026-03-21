// Service Worker for VibeCity.live
// Versioned caches prevent stale app shells from serving removed chunks after deploys.
importScripts(
	"https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js",
);

const CACHE_PREFIX = "vibecity-ui-redesign-20260321";
const CACHE_NAMES = {
	api: `${CACHE_PREFIX}-api-v1`,
	data: `${CACHE_PREFIX}-data-v1`,
	fonts: `${CACHE_PREFIX}-fonts-v1`,
	images: `${CACHE_PREFIX}-images-v1`,
	mapbox: `${CACHE_PREFIX}-mapbox-v1`,
	navigation: `${CACHE_PREFIX}-nav-v1`,
};

const ACTIVE_CACHE_NAMES = new Set(Object.values(CACHE_NAMES));

self.addEventListener("message", (event) => {
	if (event?.data?.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.map((key) =>
					ACTIVE_CACHE_NAMES.has(key) ? Promise.resolve() : caches.delete(key),
				),
			);
			await self.clients.claim();
		})(),
	);
});

if (workbox) {
	workbox.core.skipWaiting();
	workbox.core.clientsClaim();
	workbox.precaching.cleanupOutdatedCaches();
	workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

	const cacheable200 = new workbox.cacheableResponse.CacheableResponsePlugin({
		statuses: [200],
	});

	const shortLived = new workbox.expiration.ExpirationPlugin({
		maxEntries: 60,
		maxAgeSeconds: 24 * 60 * 60,
	});

	const longLived = new workbox.expiration.ExpirationPlugin({
		maxEntries: 300,
		maxAgeSeconds: 30 * 24 * 60 * 60,
	});

	workbox.routing.registerRoute(
		({ url }) =>
			url.pathname.endsWith(".csv") || url.pathname.endsWith(".json"),
		new workbox.strategies.StaleWhileRevalidate({
			cacheName: CACHE_NAMES.data,
			plugins: [cacheable200, shortLived],
		}),
	);

	workbox.routing.registerRoute(
		({ url }) =>
			url.origin === "https://api.mapbox.com" ||
			url.origin === "https://events.mapbox.com",
		new workbox.strategies.CacheFirst({
			cacheName: CACHE_NAMES.mapbox,
			plugins: [cacheable200, longLived],
		}),
	);

	workbox.routing.registerRoute(
		({ request, url }) =>
			request.destination === "font" ||
			url.origin === "https://fonts.gstatic.com" ||
			url.origin === "https://fonts.googleapis.com",
		new workbox.strategies.CacheFirst({
			cacheName: CACHE_NAMES.fonts,
			plugins: [cacheable200, longLived],
		}),
	);

	workbox.routing.registerRoute(
		({ request, url }) =>
			request.destination === "image" &&
			(url.origin === self.location.origin ||
				url.origin.includes("supabase.co")),
		new workbox.strategies.StaleWhileRevalidate({
			cacheName: CACHE_NAMES.images,
			fetchOptions: { mode: "cors", credentials: "omit" },
			plugins: [cacheable200, longLived],
		}),
	);

	// Always prefer a fresh shell so browsers do not keep executing removed chunks.
	workbox.routing.registerRoute(
		({ request }) => request.mode === "navigate",
		new workbox.strategies.NetworkFirst({
			cacheName: CACHE_NAMES.navigation,
			networkTimeoutSeconds: 3,
			plugins: [cacheable200, shortLived],
		}),
	);

	// Do not cache JS bundles in the service worker. Immutable asset caching is handled
	// by the browser/Vercel, which avoids stale chunk 404s across deploys.
	workbox.routing.setDefaultHandler(new workbox.strategies.NetworkOnly());
} else {
	console.error("[SW] Workbox failed to load");
}

self.addEventListener("sync", (event) => {
	if (event.tag === "sync-favorites") {
		event.waitUntil(Promise.resolve());
	}
});

self.addEventListener("push", (event) => {
	const data = event.data?.json() || {};
	const options = {
		body: data.body || "Check out what's happening!",
		icon: "/Vlive.svg",
		badge: "/Vlive.svg",
		vibrate: [100, 50, 100],
		data: { url: data.url || "/" },
		actions: [
			{ action: "open", title: "Open" },
			{ action: "dismiss", title: "Dismiss" },
		],
	};

	event.waitUntil(
		self.registration.showNotification(data.title || "VibeCity", options),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	if (event.action === "open" || !event.action) {
		event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
	}
});
