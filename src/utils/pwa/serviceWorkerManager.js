/**
 * Service Worker Manager - Advanced PWA Features
 *
 * Features:
 * - Service worker registration
 * - Update management
 * - Cache strategies
 * - Offline support
 * - Background sync
 * - Push notifications
 */

import {
	isDebugFlagEnabled,
	PWA_DEBUG_STORAGE_KEY,
	PWA_DEBUG_WINDOW_FLAG,
} from "../debugFlags";

export { PWA_DEBUG_STORAGE_KEY, PWA_DEBUG_WINDOW_FLAG } from "../debugFlags";

const isPwaDebugEnabled = () =>
	isDebugFlagEnabled(PWA_DEBUG_WINDOW_FLAG, PWA_DEBUG_STORAGE_KEY);

export class ServiceWorkerManager {
	constructor(options = {}) {
		this.options = {
			swUrl: "/sw.js",
			scope: "/",
			updateInterval: 3600000, // 1 hour
			debug: isPwaDebugEnabled(),
			onUpdate: null,
			onOffline: null,
			onOnline: null,
			...options,
		};

		this.registration = null;
		this.updateTimer = null;
		this.isOnline = navigator.onLine;
		this.debugLog = (...args) => {
			if (this.options.debug) {
				console.log(...args);
			}
		};
		this.debugWarn = (...args) => {
			if (this.options.debug) {
				console.warn(...args);
			}
		};
	}

	// Register service worker
	async register() {
		if (!("serviceWorker" in navigator)) {
			this.debugWarn("[SW] Service Worker not supported");
			return null;
		}

		try {
			this.registration = await navigator.serviceWorker.register(
				this.options.swUrl,
				{ scope: this.options.scope },
			);

			this.debugLog("[SW] Registered successfully");

			// Setup update checking
			this.setupUpdateChecking();

			// Setup online/offline listeners
			this.setupNetworkListeners();

			// Setup message listener
			this.setupMessageListener();

			return this.registration;
		} catch (error) {
			console.error("[SW] Registration failed:", error);
			return null;
		}
	}

	// Unregister service worker
	async unregister() {
		if (!this.registration) return false;

		try {
			const success = await this.registration.unregister();
			this.debugLog("[SW] Unregistered successfully");

			if (this.updateTimer) {
				clearInterval(this.updateTimer);
				this.updateTimer = null;
			}

			return success;
		} catch (error) {
			console.error("[SW] Unregister failed:", error);
			return false;
		}
	}

	// Setup update checking
	setupUpdateChecking() {
		// Check for updates on load
		this.checkForUpdates();

		// Check periodically
		this.updateTimer = setInterval(() => {
			this.checkForUpdates();
		}, this.options.updateInterval);

		// Listen for update found
		this.registration.addEventListener("updatefound", () => {
			const newWorker = this.registration.installing;

			newWorker.addEventListener("statechange", () => {
				if (
					newWorker.state === "installed" &&
					navigator.serviceWorker.controller
				) {
					this.debugLog("[SW] New version available");

					if (this.options.onUpdate) {
						this.options.onUpdate(newWorker);
					}
				}
			});
		});
	}

	// Check for updates
	async checkForUpdates() {
		if (!this.registration) return;

		try {
			await this.registration.update();
			this.debugLog("[SW] Checked for updates");
		} catch (error) {
			console.error("[SW] Update check failed:", error);
		}
	}

	// Skip waiting and activate new service worker
	async skipWaiting() {
		if (!this.registration || !this.registration.waiting) return;

		this.registration.waiting.postMessage({ type: "SKIP_WAITING" });

		// Reload page after activation
		navigator.serviceWorker.addEventListener("controllerchange", () => {
			window.location.reload();
		});
	}

	// Setup network listeners
	setupNetworkListeners() {
		window.addEventListener("online", () => {
			this.debugLog("[SW] Back online");
			this.isOnline = true;

			if (this.options.onOnline) {
				this.options.onOnline();
			}

			// Sync pending requests
			this.syncPendingRequests();
		});

		window.addEventListener("offline", () => {
			this.debugLog("[SW] Gone offline");
			this.isOnline = false;

			if (this.options.onOffline) {
				this.options.onOffline();
			}
		});
	}

	// Setup message listener
	setupMessageListener() {
		navigator.serviceWorker.addEventListener("message", (event) => {
			this.debugLog("[SW] Message received:", event.data);

			const { type, payload } = event.data;

			switch (type) {
				case "CACHE_UPDATED":
					this.debugLog("[SW] Cache updated:", payload);
					break;

				case "SYNC_COMPLETE":
					this.debugLog("[SW] Sync complete:", payload);
					break;

				case "NOTIFICATION":
					this.showNotification(payload);
					break;

				default:
					this.debugLog("[SW] Unknown message type:", type);
			}
		});
	}

	// Send message to service worker
	async sendMessage(message) {
		if (!this.registration || !this.registration.active) {
			this.debugWarn("[SW] No active service worker");
			return;
		}

		this.registration.active.postMessage(message);
	}

	// Clear cache
	async clearCache(cacheName) {
		await this.sendMessage({
			type: "CLEAR_CACHE",
			cacheName,
		});
	}

	// Sync pending requests
	async syncPendingRequests() {
		if (!("sync" in this.registration)) {
			this.debugWarn("[SW] Background Sync not supported");
			return;
		}

		try {
			await this.registration.sync.register("sync-pending-requests");
			this.debugLog("[SW] Background sync registered");
		} catch (error) {
			console.error("[SW] Background sync failed:", error);
		}
	}

	// Request notification permission
	async requestNotificationPermission() {
		if (!("Notification" in window)) {
			this.debugWarn("[SW] Notifications not supported");
			return "denied";
		}

		if (Notification.permission === "granted") {
			return "granted";
		}

		if (Notification.permission !== "denied") {
			const permission = await Notification.requestPermission();
			return permission;
		}

		return "denied";
	}

	// Show notification
	async showNotification(options = {}) {
		const permission = await this.requestNotificationPermission();

		if (permission !== "granted") {
			this.debugWarn("[SW] Notification permission denied");
			return;
		}

		const {
			title = "VibeCity",
			body = "",
			icon = "/icon-192.png",
			badge = "/badge-72.png",
			tag = "default",
			data = {},
			actions = [],
		} = options;

		if (this.registration) {
			await this.registration.showNotification(title, {
				body,
				icon,
				badge,
				tag,
				data,
				actions,
			});
		}
	}

	// Subscribe to push notifications
	async subscribeToPush(vapidPublicKey) {
		if (!this.registration) {
			this.debugWarn("[SW] No service worker registration");
			return null;
		}

		if (!("PushManager" in window)) {
			this.debugWarn("[SW] Push notifications not supported");
			return null;
		}

		try {
			const subscription = await this.registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
			});

			this.debugLog("[SW] Push subscription successful");
			return subscription;
		} catch (error) {
			console.error("[SW] Push subscription failed:", error);
			return null;
		}
	}

	// Unsubscribe from push notifications
	async unsubscribeFromPush() {
		if (!this.registration) return false;

		try {
			const subscription =
				await this.registration.pushManager.getSubscription();

			if (subscription) {
				await subscription.unsubscribe();
				this.debugLog("[SW] Push unsubscription successful");
				return true;
			}

			return false;
		} catch (error) {
			console.error("[SW] Push unsubscription failed:", error);
			return false;
		}
	}

	// Helper: Convert VAPID key
	urlBase64ToUint8Array(base64String) {
		const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding)
			.replace(/-/g, "+")
			.replace(/_/g, "/");

		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);

		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}

		return outputArray;
	}

	// Get cache size
	async getCacheSize() {
		if (!("caches" in window)) return 0;

		const cacheNames = await caches.keys();
		let totalSize = 0;

		for (const cacheName of cacheNames) {
			const cache = await caches.open(cacheName);
			const requests = await cache.keys();

			for (const request of requests) {
				const response = await cache.match(request);
				if (response) {
					const blob = await response.blob();
					totalSize += blob.size;
				}
			}
		}

		return totalSize;
	}

	// Is online
	isOnlineStatus() {
		return this.isOnline;
	}
}

// Singleton instance
let swManagerInstance = null;

export function useServiceWorkerManager(options) {
	if (!swManagerInstance) {
		swManagerInstance = new ServiceWorkerManager(options);
	}
	return swManagerInstance;
}
