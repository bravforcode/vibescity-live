// Service Worker for VibeCity.live
// Unified Workbox runtime caching (Rsbuild-compatible)
importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js");

if (workbox) {
  console.log("[SW] Workbox loaded successfully");

  workbox.core.skipWaiting();
  workbox.core.clientsClaim();
  workbox.precaching.cleanupOutdatedCaches();

  // If precache manifest is injected by a bundler, use it.
  const precacheManifest = self.__WB_MANIFEST || [];
  workbox.precaching.precacheAndRoute(precacheManifest);

  // 1. Mapbox (tiles + api) - Cache First
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === "https://api.mapbox.com" ||
      url.origin === "https://events.mapbox.com",
    new workbox.strategies.CacheFirst({
      cacheName: "mapbox-tiles",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 500,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    }),
  );

  // 2. Google Fonts - Stale While Revalidate
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === "https://fonts.googleapis.com" ||
      url.origin === "https://fonts.gstatic.com",
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "google-fonts",
      plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 20 })],
    }),
  );

  // 3. Supabase Storage Images - Stale While Revalidate (exclude videos: Cache API can't handle Range requests)
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin.includes("supabase.co") &&
      url.pathname.includes("/storage/v1/object/public/") &&
      !url.pathname.match(/\.(mp4|webm|mov|avi|mkv|m4v)$/i),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "supabase-images",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        }),
      ],
    }),
  );

  // 4. Supabase REST API - Network First (fresh data priority)
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin.includes("supabase.co") && url.pathname.includes("/rest/v1/"),
    new workbox.strategies.NetworkFirst({
      cacheName: "api-data",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60,
        }),
      ],
    }),
  );

  // 5. Shop data (csv/json) - Stale While Revalidate
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.endsWith(".csv") || url.pathname.endsWith(".json"),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "vibe-data-v1",
    }),
  );

  // 6. Static assets (fonts/images)
  workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === "font" || request.destination === "image",
    new workbox.strategies.CacheFirst({
      cacheName: "vibe-static-v1",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        }),
      ],
    }),
  );

  // 7. App core (navigation + scripts) - Network First
  workbox.routing.registerRoute(
    ({ request, url }) =>
      request.mode === "navigate" ||
      (request.destination === "script" && url.origin === self.location.origin),
    new workbox.strategies.NetworkFirst({
      cacheName: "vibe-core-v1",
    }),
  );
} else {
  console.error("[SW] Workbox failed to load");
}

// ---------------------------------------------------------
// ✅ Background Sync & Notifications (Legacy Support)
// ---------------------------------------------------------

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  console.log('[SW] Syncing favorites...');
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || "Check out what's happening!",
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'VibeCity', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
