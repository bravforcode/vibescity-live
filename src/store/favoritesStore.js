/**
 * 📁 src/store/favoritesStore.js
 * ✅ Favorites Store with Backend Sync + Offline Queue (IndexedDB)
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { supabase } from "../lib/supabase";
import { getNetworkOnlineState } from "../services/networkState";
import {
	appendOfflineAction,
	clearOfflineActionQueue,
	loadOfflineActionQueue,
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
					if (error) throw error;
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

			if (wasAdded) {
				favoriteIds.value = [...favoriteIds.value, shopId];
			} else {
				favoriteIds.value = favoriteIds.value.filter((id) => id !== shopId);
			}

			hapticPulse();

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

			const queue = await loadOfflineActionQueue();
			if (queue.length === 0) {
				pendingSync.value = [];
				return;
			}

			const latestByShop = new Map();
			for (const item of queue) {
				if (item.type !== "favorite") continue;
				latestByShop.set(String(item.shopId), item);
			}

			const failures = [];
			for (const item of latestByShop.values()) {
				try {
					await syncFavoriteAction(item.shopId, item.action === "add", null, {
						queueOnFailure: false,
					});
				} catch {
					failures.push(item);
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

		return {
			favoriteIds,
			collections,
			syncStatus,
			lastSyncTime,
			pendingSync,
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
