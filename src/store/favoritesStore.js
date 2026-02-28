/**
 * 📁 src/store/favoritesStore.js
 * ✅ Favorites Store with Optimistic UI + Offline Queue + CRDT Dedup
 */
import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { supabase } from "../lib/supabase";
import { getNetworkOnlineState } from "../services/networkState";
import {
    appendOfflineAction,
    clearOfflineActionQueue,
    deduplicateQueue,
    getBackoffDelay,
    loadOfflineActionQueue,
    MAX_RETRIES,
    saveOfflineActionQueue,
} from "../services/offlineActionQueue";
import { useUserStore } from "./userStore";

const hapticPulse = () => {
	if (
		typeof navigator === "undefined" ||
		typeof navigator.vibrate !== "function"
	) {
		return;
	}
	navigator.vibrate([20]);
};

export const useFavoritesStore = defineStore(
	"favorites",
	() => {
		const userStore = useUserStore();

		const favoriteIds = ref([]);
		const collections = ref([]);
		const syncStatus = ref("idle");
		const lastSyncTime = ref(null);
		const pendingSync = ref([]);

		// Micro-animation signal: components watch this to trigger heart spring
		const animatingFavoriteId = shallowRef(null);
		let animationTimer = null;

		const count = computed(() => favoriteIds.value.length);
		const favoriteSet = computed(() => new Set(favoriteIds.value));
		const isFavorite = (shopId) => favoriteSet.value.has(shopId);
		const hasFavorites = computed(() => count.value > 0);

		const hydrateOfflineQueue = async () => {
			try {
				pendingSync.value = await loadOfflineActionQueue();
			} catch (error) {
				if (import.meta.env.DEV) {
					console.error("[favorites] Failed to load offline queue:", error);
				}
			}
		};

		const queueOfflineFavorite = async (shopId, action) => {
			const queuedAction = {
				type: "favorite",
				shopId: String(shopId),
				action,
				timestamp: Date.now(),
			};
			pendingSync.value = await appendOfflineAction(queuedAction);
		};

		const syncFavoriteAction = async (
			shopId,
			isAdding,
			shopData,
			options = {},
		) => {
			const queueOnFailure = options.queueOnFailure !== false;
			if (!userStore.isAuthenticated || !userStore.userId) return;

			const isOnline = getNetworkOnlineState();
			if (!isOnline) {
				await queueOfflineFavorite(shopId, isAdding ? "add" : "remove");
				return;
			}

			try {
				if (isAdding) {
					const { error } = await supabase.from("user_favorites").upsert({
						user_id: userStore.userId,
						venue_id: shopId,
						venue_name: shopData?.name,
						created_at: new Date().toISOString(),
					});
					// 409 = already exists → treat as success
					if (error && error.code !== "23505") throw error;
				} else {
					const { error } = await supabase
						.from("user_favorites")
						.delete()
						.eq("user_id", userStore.userId)
						.eq("venue_id", shopId);
					if (error) throw error;
				}
			} catch (error) {
				if (import.meta.env.DEV) {
					console.error("[favorites] Sync failed, queued for retry:", error);
				}
				if (queueOnFailure) {
					await queueOfflineFavorite(shopId, isAdding ? "add" : "remove");
					return;
				}
				throw error;
			}
		};

		const toggleFavorite = (shopId, shopData = null) => {
			const wasAdded = !isFavorite(shopId);

			// 1. Instantly flip local state (optimistic)
			if (wasAdded) {
				favoriteIds.value = [...favoriteIds.value, shopId];
			} else {
				favoriteIds.value = favoriteIds.value.filter((id) => id !== shopId);
			}

			// 2. Haptic pulse
			hapticPulse();

			// 3. Emit micro-animation signal (heart spring 1→1.4→1)
			clearTimeout(animationTimer);
			animatingFavoriteId.value = shopId;
			animationTimer = setTimeout(() => {
				animatingFavoriteId.value = null;
			}, 200);

			// 4. Queue for background sync
			if (userStore.isAuthenticated) {
				void syncFavoriteAction(shopId, wasAdded, shopData);
			}

			return wasAdded;
		};

		const addFavorite = (shopId, shopData = null) => {
			if (isFavorite(shopId)) return false;
			return toggleFavorite(shopId, shopData);
		};

		const removeFavorite = (shopId) => {
			if (!isFavorite(shopId)) return false;
			return toggleFavorite(shopId);
		};

		const clearAll = async () => {
			const oldFavorites = [...favoriteIds.value];
			favoriteIds.value = [];

			if (!userStore.isAuthenticated || !userStore.userId) return;
			try {
				const { error } = await supabase
					.from("user_favorites")
					.delete()
					.eq("user_id", userStore.userId);
				if (error) throw error;
			} catch (error) {
				favoriteIds.value = oldFavorites;
				if (import.meta.env.DEV) {
					console.error("[favorites] Failed to clear favorites:", error);
				}
			}
		};

		const fetchFavorites = async () => {
			if (!userStore.isAuthenticated || !userStore.userId) return;

			syncStatus.value = "syncing";
			try {
				const { data, error } = await supabase
					.from("user_favorites")
					.select("venue_id")
					.eq("user_id", userStore.userId);

				if (error) throw error;
				favoriteIds.value = data?.map((item) => item.venue_id) || [];
				lastSyncTime.value = Date.now();
				syncStatus.value = "idle";
			} catch (error) {
				syncStatus.value = "error";
				if (import.meta.env.DEV) {
					console.error("[favorites] Failed to fetch favorites:", error);
				}
			}
		};

		const flushOfflineFavorites = async () => {
			if (!userStore.isAuthenticated || !userStore.userId) return;
			if (!getNetworkOnlineState()) return;

			const rawQueue = await loadOfflineActionQueue();
			if (rawQueue.length === 0) {
				pendingSync.value = [];
				return;
			}

			// CRDT intent deduplication: cancel opposing add/remove pairs
			const queue = deduplicateQueue(rawQueue);

			const failures = [];
			for (const item of queue) {
				if (item.type !== "favorite") continue;
				if (item.status === "dead_letter") continue;

				// Skip items that need backoff delay
				if (item.retries > 0) {
					const delay = getBackoffDelay(item.retries);
					const age = Date.now() - item.timestamp;
					if (age < delay) {
						failures.push(item);
						continue;
					}
				}

				try {
					await syncFavoriteAction(item.shopId, item.action === "add", null, {
						queueOnFailure: false,
					});
				} catch {
					const nextRetries = item.retries + 1;
					if (nextRetries >= MAX_RETRIES) {
						// Dead letter — stop retrying
						if (import.meta.env.DEV) {
							console.warn(`[favorites] Dead letter: ${item.shopId}`);
						}
						failures.push({ ...item, retries: nextRetries, status: "dead_letter" });
					} else {
						failures.push({ ...item, retries: nextRetries, timestamp: Date.now() });
					}
				}
			}

			if (failures.length > 0) {
				await saveOfflineActionQueue(failures);
				pendingSync.value = failures;
				return;
			}

			await clearOfflineActionQueue();
			pendingSync.value = [];
		};

		const processPendingSync = async () => {
			await flushOfflineFavorites();
		};

		const createCollection = (name, icon = "❤️") => {
			const id = `col_${Date.now()}`;
			collections.value.push({
				id,
				name,
				icon,
				items: [],
				createdAt: new Date(),
			});
			return id;
		};

		const addToCollection = (collectionId, shopId) => {
			const collection = collections.value.find(
				(item) => item.id === collectionId,
			);
			if (collection && !collection.items.includes(shopId)) {
				collection.items.push(shopId);
				return true;
			}
			return false;
		};

		const removeFromCollection = (collectionId, shopId) => {
			const collection = collections.value.find(
				(item) => item.id === collectionId,
			);
			if (collection) {
				collection.items = collection.items.filter((id) => id !== shopId);
				return true;
			}
			return false;
		};

		const deleteCollection = (collectionId) => {
			collections.value = collections.value.filter(
				(item) => item.id !== collectionId,
			);
		};

		watch(
			() => userStore.isAuthenticated,
			(isAuth) => {
				if (!isAuth) return;
				void fetchFavorites();
				void flushOfflineFavorites();
			},
			{ immediate: true },
		);

		void hydrateOfflineQueue();

		// Auto-flush when coming back online
		if (typeof window !== "undefined") {
			window.addEventListener("online", () => void flushOfflineFavorites());

			// sendBeacon fallback: flush pending mutations on page close
			window.addEventListener("beforeunload", () => {
				if (pendingSync.value.length > 0 && navigator.sendBeacon) {
					const payload = JSON.stringify(pendingSync.value);
					navigator.sendBeacon("/api/sync-favorites", payload);
				}
			});
		}

		return {
			favoriteIds,
			collections,
			syncStatus,
			lastSyncTime,
			pendingSync,
			animatingFavoriteId,
			count,
			favoriteSet,
			hasFavorites,
			isFavorite,
			toggleFavorite,
			addFavorite,
			removeFavorite,
			clearAll,
			fetchFavorites,
			processPendingSync,
			flushOfflineFavorites,
			createCollection,
			addToCollection,
			removeFromCollection,
			deleteCollection,
		};
	},
	{
		persist: {
			paths: ["favoriteIds", "collections"],
			key: "vibe-favorites",
		},
	},
);
