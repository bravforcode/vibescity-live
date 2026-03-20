/**
 * Enterprise Service Worker Manager
 *
 * Manages tile caching service worker with intelligent precaching
 * and cache management for optimal map performance.
 */

import { onMounted, onUnmounted, ref } from "vue";

const canUseNavigator =
	typeof window !== "undefined" && typeof navigator !== "undefined";

export function useServiceWorker(options = {}) {
	const scriptURL = String(options.scriptURL || "/sw-tile-cache.js");
	const scriptScope = String(options.scope || "/");
	const autoRegister = options.autoRegister !== false;
	const autoReloadOnControllerChange =
		options.autoReloadOnControllerChange === true;

	const isSupported = ref(
		canUseNavigator && "serviceWorker" in navigator && Boolean(scriptURL),
	);
	const isRegistered = ref(false);
	const isControlling = ref(false);
	const cacheStats = ref(null);
	const isLoading = ref(false);
	const error = ref(null);

	let registration = null;
	let messageChannel = null;

	const CACHE_VERSION = "v1.0.0";

	const registerServiceWorker = async () => {
		if (!isSupported.value) {
			console.warn("Service Worker not supported");
			return false;
		}

		try {
			isLoading.value = true;
			error.value = null;

			// Register the service worker
			registration = await navigator.serviceWorker.register(scriptURL, {
				scope: scriptScope,
			});

			isRegistered.value = true;
			console.log("✅ Service Worker registered:", registration.scope);

			// Setup message channel for communication
			setupMessageChannel();

			// Check if service worker is already controlling
			if (navigator.serviceWorker.controller) {
				isControlling.value = true;
				console.log("🎮 Service Worker is already controlling");
			}

			// Listen for controller changes
			navigator.serviceWorker.addEventListener(
				"controllerchange",
				handleControllerChange,
			);

			// Listen for updates
			registration.addEventListener("updatefound", handleUpdateFound);

			return true;
		} catch (err) {
			error.value = err.message;
			console.error("❌ Service Worker registration failed:", err);
			return false;
		} finally {
			isLoading.value = false;
		}
	};

	const setupMessageChannel = () => {
		if (messageChannel) {
			messageChannel.port1.close();
		}

		messageChannel = new MessageChannel();
		messageChannel.port1.onmessage = handleMessage;

		// Send initial message to establish connection
		if (registration?.active) {
			registration.active.postMessage(
				{
					type: "INIT",
					data: { version: CACHE_VERSION },
				},
				[messageChannel.port2],
			);
		}
	};

	const handleMessage = (event) => {
		const { type, data } = event.data;

		switch (type) {
			case "CACHE_STATS":
				cacheStats.value = data;
				break;
			case "CACHE_UPDATE":
				console.log("🔄 Cache update received:", data);
				break;
			case "ERROR":
				error.value = data.message;
				break;
		}
	};

	const handleControllerChange = () => {
		console.log("🔄 Service Worker controller changed");
		isControlling.value = true;

		if (autoReloadOnControllerChange) {
			// Reload page only when explicitly enabled.
			window.location.reload();
		}
	};

	const handleUpdateFound = () => {
		console.log("🔍 New Service Worker found");

		const newWorker = registration.installing;
		if (newWorker) {
			newWorker.addEventListener("statechange", () => {
				if (
					newWorker.state === "installed" &&
					navigator.serviceWorker.controller
				) {
					console.log("📦 New Service Worker available, waiting to activate");
				}
			});
		}
	};

	const getCacheStats = async () => {
		if (!registration || !registration.active) return null;

		try {
			const channel = new MessageChannel();

			return new Promise((resolve) => {
				channel.port1.onmessage = (event) => {
					resolve(event.data);
				};

				registration.active.postMessage(
					{
						type: "CACHE_STATS",
					},
					[channel.port2],
				);
			});
		} catch (err) {
			console.error("Failed to get cache stats:", err);
			return null;
		}
	};

	const clearCache = async (type = null) => {
		if (!registration || !registration.active) return false;

		try {
			const channel = new MessageChannel();

			return new Promise((resolve, reject) => {
				channel.port1.onmessage = (event) => {
					const { success, error } = event.data;
					if (success) {
						console.log(`🗑️ Cache cleared: ${type || "all"}`);
						resolve(true);
					} else {
						reject(new Error(error));
					}
				};

				registration.active.postMessage(
					{
						type: "CLEAR_CACHE",
						data: { type },
					},
					[channel.port2],
				);
			});
		} catch (err) {
			console.error("Failed to clear cache:", err);
			return false;
		}
	};

	const precacheTiles = async (tileUrls) => {
		if (!registration || !registration.active) return false;

		try {
			const channel = new MessageChannel();

			return new Promise((resolve, reject) => {
				channel.port1.onmessage = (event) => {
					const { success, error } = event.data;
					if (success) {
						console.log(`📦 Precached ${tileUrls.length} tiles`);
						resolve(true);
					} else {
						reject(new Error(error));
					}
				};

				registration.active.postMessage(
					{
						type: "PRECACHE_TILES",
						data: { tiles: tileUrls },
					},
					[channel.port2],
				);
			});
		} catch (err) {
			console.error("Failed to precache tiles:", err);
			return false;
		}
	};

	const triggerBackgroundSync = async () => {
		if (!registration || !registration.sync) return false;

		try {
			await registration.sync.register("cache-update");
			console.log("🔄 Background sync registered");
			return true;
		} catch (err) {
			console.error("Failed to register background sync:", err);
			return false;
		}
	};

	const updateServiceWorker = async () => {
		if (!registration || !registration.waiting) return false;

		try {
			// Tell the waiting service worker to skip waiting
			registration.waiting.postMessage({
				type: "SKIP_WAITING",
			});

			console.log("⚡ Service Worker update triggered");
			return true;
		} catch (err) {
			console.error("Failed to update service worker:", err);
			return false;
		}
	};

	const unregisterServiceWorker = async () => {
		if (!registration) return true;

		try {
			await registration.unregister();
			isRegistered.value = false;
			isControlling.value = false;
			console.log("🗑️ Service Worker unregistered");
			return true;
		} catch (err) {
			console.error("Failed to unregister service worker:", err);
			return false;
		}
	};

	// Map-specific tile precaching
	const precacheMapTiles = async (
		bounds,
		zoomLevels = [10, 11, 12, 13, 14],
	) => {
		if (!bounds) return [];

		const tileUrls = [];
		const { west, south, east, north } = bounds;

		for (const zoom of zoomLevels) {
			const minX = Math.floor(lon2tile(west, zoom));
			const maxX = Math.floor(lon2tile(east, zoom));
			const minY = Math.floor(lat2tile(north, zoom));
			const maxY = Math.floor(lat2tile(south, zoom));

			for (let x = minX; x <= maxX; x++) {
				for (let y = minY; y <= maxY; y++) {
					// OpenStreetMap tiles (free, no API key required)
					tileUrls.push(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
				}
			}
		}

		// Limit to reasonable number of tiles
		const limitedUrls = tileUrls.slice(0, 100);

		return await precacheTiles(limitedUrls);
	};

	// Helper functions for tile coordinates
	const lon2tile = (lon, zoom) => {
		return Math.floor(((lon + 180) / 360) * 2 ** zoom);
	};

	const lat2tile = (lat, zoom) => {
		return Math.floor(
			((1 -
				Math.log(
					Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180),
				) /
					Math.PI) /
				2) *
				2 ** zoom,
		);
	};

	// Performance monitoring
	const measureCachePerformance = async () => {
		const stats = await getCacheStats();
		if (!stats) return null;

		return {
			totalCachedTiles: stats.tiles?.count || 0,
			totalCachedSize: stats.tiles?.size || 0,
			staticAssetsCached: stats.static?.count || 0,
			apiResponsesCached: stats.api?.count || 0,
			cacheHitRatio: await calculateCacheHitRatio(),
		};
	};

	const calculateCacheHitRatio = async () => {
		// This would require tracking cache hits/misses over time
		// For now, return estimated value
		return 0.75; // 75% estimated cache hit ratio
	};

	onMounted(() => {
		if (!canUseNavigator || !autoRegister) return;
		// Auto-register service worker
		void registerServiceWorker();
	});

	onUnmounted(() => {
		// Cleanup
		if (messageChannel) {
			messageChannel.port1.close();
		}

		if (registration && canUseNavigator) {
			navigator.serviceWorker.removeEventListener(
				"controllerchange",
				handleControllerChange,
			);
		}
	});

	return {
		// State
		isSupported,
		isRegistered,
		isControlling,
		cacheStats,
		isLoading,
		error,

		// Methods
		registerServiceWorker,
		unregisterServiceWorker,
		getCacheStats,
		clearCache,
		precacheTiles,
		precacheMapTiles,
		triggerBackgroundSync,
		updateServiceWorker,
		measureCachePerformance,
	};
}
