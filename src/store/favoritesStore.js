/**
 * 📁 src/store/favoritesStore.js
 * ✅ Favorites Store with Backend Sync
 * Features: Optimistic updates, Offline support, Collections
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { supabase } from "../lib/supabase";
import { useUserStore } from "./userStore";

export const useFavoritesStore = defineStore(
	"favorites",
	() => {
		const userStore = useUserStore();

		// ═══════════════════════════════════════════
		// 📦 State
		// ═══════════════════════════════════════════
		const favoriteIds = ref([]); // Array for better serialization
		const collections = ref([]); // Named collections/lists
		const syncStatus = ref("idle"); // idle | syncing | error
		const lastSyncTime = ref(null);
		const pendingSync = ref([]); // Offline queue

		// ═══════════════════════════════════════════
		// 📊 Computed
		// ═══════════════════════════════════════════
		const count = computed(() => favoriteIds.value.length);
		const favoriteSet = computed(() => new Set(favoriteIds.value));
		const isFavorite = (shopId) => favoriteSet.value.has(shopId);
		const hasFavorites = computed(() => count.value > 0);

		// ═══════════════════════════════════════════
		// 🎯 Actions
		// ═══════════════════════════════════════════

		/**
		 * Toggle favorite status
		 */
		const toggleFavorite = async (shopId, shopData = null) => {
			const wasAdded = !isFavorite(shopId);

			// Optimistic update
			if (wasAdded) {
				favoriteIds.value = [...favoriteIds.value, shopId];
			} else {
				favoriteIds.value = favoriteIds.value.filter((id) => id !== shopId);
			}

			// Haptic feedback on mobile
			if (navigator.vibrate) navigator.vibrate(wasAdded ? [20, 10, 20] : 10);

			// Sync to backend if authenticated
			if (userStore.isAuthenticated) {
				await syncFavoriteAction(shopId, wasAdded, shopData);
			}

			return wasAdded;
		};

		/**
		 * Add to favorites
		 */
		const addFavorite = async (shopId, shopData = null) => {
			if (isFavorite(shopId)) return false;
			return toggleFavorite(shopId, shopData);
		};

		/**
		 * Remove from favorites
		 */
		const removeFavorite = async (shopId) => {
			if (!isFavorite(shopId)) return false;
			return toggleFavorite(shopId);
		};

		/**
		 * Clear all favorites
		 */
		const clearAll = async () => {
			const oldFavorites = [...favoriteIds.value];
			favoriteIds.value = [];

			if (userStore.isAuthenticated) {
				try {
					await supabase
						.from("user_favorites")
						.delete()
						.eq("user_id", userStore.userId);
				} catch (e) {
					favoriteIds.value = oldFavorites; // Rollback
					console.error("❌ Failed to clear favorites:", e);
				}
			}
		};

		/**
		 * Sync single favorite action to backend
		 */
		const syncFavoriteAction = async (shopId, isAdding, shopData) => {
			try {
				if (isAdding) {
					await supabase.from("user_favorites").upsert({
						user_id: userStore.userId,
						venue_id: shopId,
						venue_name: shopData?.name,
						created_at: new Date().toISOString(),
					});
				} else {
					await supabase
						.from("user_favorites")
						.delete()
						.eq("user_id", userStore.userId)
						.eq("venue_id", shopId);
				}
			} catch (e) {
				console.error("❌ Favorite sync failed:", e);
				// Queue for retry
				pendingSync.value.push({
					shopId,
					action: isAdding ? "add" : "remove",
					timestamp: Date.now(),
				});
			}
		};

		/**
		 * Fetch favorites from backend
		 */
		const fetchFavorites = async () => {
			if (!userStore.isAuthenticated) return;

			syncStatus.value = "syncing";
			try {
				const { data, error } = await supabase
					.from("user_favorites")
					.select("venue_id")
					.eq("user_id", userStore.userId);

				if (error) throw error;
				favoriteIds.value = data?.map((f) => f.venue_id) || [];
				lastSyncTime.value = Date.now();
				syncStatus.value = "idle";
			} catch (e) {
				console.error("❌ Failed to fetch favorites:", e);
				syncStatus.value = "error";
			}
		};

		/**
		 * Process pending sync queue
		 */
		const processPendingSync = async () => {
			if (pendingSync.value.length === 0 || !userStore.isAuthenticated) return;

			const queue = [...pendingSync.value];
			pendingSync.value = [];

			for (const item of queue) {
				await syncFavoriteAction(item.shopId, item.action === "add", null);
			}
		};

		// ═══════════════════════════════════════════
		// 📂 Collections Management
		// ═══════════════════════════════════════════
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
			const col = collections.value.find((c) => c.id === collectionId);
			if (col && !col.items.includes(shopId)) {
				col.items.push(shopId);
				return true;
			}
			return false;
		};

		const removeFromCollection = (collectionId, shopId) => {
			const col = collections.value.find((c) => c.id === collectionId);
			if (col) {
				col.items = col.items.filter((id) => id !== shopId);
				return true;
			}
			return false;
		};

		const deleteCollection = (collectionId) => {
			collections.value = collections.value.filter(
				(c) => c.id !== collectionId,
			);
		};

		// Auto-sync when auth state changes
		watch(
			() => userStore.isAuthenticated,
			(isAuth) => {
				if (isAuth) {
					fetchFavorites();
					processPendingSync();
				}
			},
			{ immediate: true },
		);

		return {
			// State
			favoriteIds,
			collections,
			syncStatus,
			lastSyncTime,
			pendingSync,
			// Computed
			count,
			favoriteSet,
			hasFavorites,
			isFavorite,
			// Actions
			toggleFavorite,
			addFavorite,
			removeFavorite,
			clearAll,
			fetchFavorites,
			processPendingSync,
			// Collections
			createCollection,
			addToCollection,
			removeFromCollection,
			deleteCollection,
		};
	},
	{
		persist: {
			paths: ["favoriteIds", "collections", "pendingSync"],
			key: "vibe-favorites",
		},
	},
);
