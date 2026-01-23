// Service Worker for VibeCity.live
// Feature #24: Advanced PWA Caching (Workbox)
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
  console.log('[SW] Workbox loaded successfully');

  // Skip waiting and claim clients for instant takeover
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  // 1. Mapbox Vector Tiles (Cache First - optimized for offline/repeat view)
  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === 'https://api.mapbox.com' ||
      url.origin === 'https://events.mapbox.com',
    new workbox.strategies.CacheFirst({
      cacheName: 'mapbox-tiles',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 1000,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    })
  );

  // 2. Shop Metadata (Stale While Revalidate - instant load + background update)
  workbox.routing.registerRoute(
    ({ url }) => url.pathname.endsWith('.csv') || url.pathname.endsWith('.json'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'vibe-data-v1',
    })
  );

  // 3. Static Assets (Fonts & Images)
  workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === 'font' || request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'vibe-static-v1',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
        }),
      ],
    })
  );

  // 4. App Core (Navigation & Scripts)
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate' || request.destination === 'script',
    new workbox.strategies.NetworkFirst({
      cacheName: 'vibe-core-v1',
    })
  );

} else {
  console.error('[SW] Workbox failed to load');
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
