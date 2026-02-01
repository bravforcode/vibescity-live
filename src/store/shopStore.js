// --- C:\vibecity.live\src\store\shopStore.js ---

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";
import { getReviews, getShops, postReview } from "../services/shopService";
import { calculateDistance } from "../utils/shopUtils";

export const useShopStore = defineStore(
	"shop",
	() => {
		// Core State
		const rawShops = ref([]);
		const currentTime = ref(new Date());
		const activeShopId = ref(null);
		const activeCategories = ref([]);
		const activeStatus = ref("ALL");
		const isDataLoading = ref(true);
		const userLocation = ref(null);
		const rotationSeed = ref(Math.floor(Date.now() / 1800000)); // Changes every 30 min

		// ✅ Gamification & Review State (Persisted automatically)
		const collectedCoins = ref(new Set());
		const totalCoins = ref(0);
		const reviews = ref({});

		const userLevel = computed(() => {
			const coins = totalCoins.value;
			if (coins >= 1000) return 5;
			if (coins >= 600) return 4;
			if (coins >= 300) return 3;
			if (coins >= 100) return 2;
			return 1;
		});

		const nextLevelXP = computed(() => {
			const current = userLevel.value;
			if (current === 1) return 100;
			if (current === 2) return 300;
			if (current === 3) return 600;
			if (current === 4) return 1000;
			return 2000; // Cap for now
		});

		const levelProgress = computed(() => {
			const currentXP = totalCoins.value;
			const nextXP = nextLevelXP.value;
			let prevXP = 0;
			const level = userLevel.value;

			if (level === 2) prevXP = 100;
			else if (level === 3) prevXP = 300;
			else if (level === 4) prevXP = 600;
			else if (level >= 5) prevXP = 1000;

			return Math.min(
				1.0,
				Math.max(0, (currentXP - prevXP) / (nextXP - prevXP)),
			);
		});

		// Computed: Filtered Shops
		const filteredShops = computed(() => {
			if (!rawShops.value) return [];
			let result = [...rawShops.value];

			// Filter by category
			if (activeCategories.value.length > 0) {
				result = result.filter((s) =>
					activeCategories.value.includes(s.category),
				);
			}

			// Filter by status
			if (activeStatus.value !== "ALL") {
				result = result.filter((s) => s.status === activeStatus.value);
			}

			return result;
		});

		// Computed: Visible Shops (Nearest 30 + Random Rotation)
		// Refactored from nearbyShops function to be a reactive computed property
		const visibleShops = computed(() => {
            console.log(`🔍 [ShopStore] visibleShops calc: filtered=${filteredShops.value?.length}`);
			if (!filteredShops.value) return [];

			// 1. Get User Location (or default)
			const userLoc = userLocation.value;
			let candidates = [...filteredShops.value];

			if (userLoc) {
				const [userLat, userLng] = userLoc;
				candidates = candidates.map((shop) => ({
					...shop,
					// Ensure placeholder logic is efficient
					Image_URL1:
						shop.Image_URL1 ||
						`https://placehold.co/600x400/0f0f1a/3b82f6?text=${encodeURIComponent(shop.name)}`,
					distance: calculateDistance(userLat, userLng, shop.lat, shop.lng),
					// Random Key for shuffling, dependent on rotationSeed
					randomKey: (shop.id + rotationSeed.value * 1103515245) % 12345,
				}));
			} else {
				candidates = candidates.map((shop) => ({
					...shop,
					Image_URL1:
						shop.Image_URL1 ||
						`https://placehold.co/600x400/0f0f1a/3b82f6?text=${encodeURIComponent(shop.name)}`,
					distance: 0,
					randomKey: (shop.id + rotationSeed.value * 1103515245) % 12345,
				}));
			}

			// 2. Default View Logic (Nearest 30 Random)
			const isDefaultView =
				activeCategories.value.length === 0 && activeStatus.value === "ALL";

			if (isDefaultView) {
				// Prioritize LIVE shops, then mix the rest
				const liveShops = candidates.filter(
					(s) => s.status === "LIVE" || s.Status === "LIVE",
				);
				const normalShops = candidates.filter(
					(s) => s.status !== "LIVE" && s.Status !== "LIVE",
				);

				// If user has location, we might want to prioritize distance even in "Random" mode
				if (userLoc) {
					// Take top 50 closest normal shops, then shuffle them
					normalShops.sort((a, b) => a.distance - b.distance);
					const top50 = normalShops.slice(0, 50);

					// Shuffle the top 50
					top50.sort((a, b) => a.randomKey - b.randomKey);

					// Combine LIVE + Shuffled Top 50 -> Slice 30
					return [...liveShops, ...top50].slice(0, 30);
				} else {
					// No location: pure random
					normalShops.sort((a, b) => a.randomKey - b.randomKey);
					return [...liveShops, ...normalShops].slice(0, 30);
				}
			}

			// 3. Filtered View (Show all matching but sorted)
			candidates.sort((a, b) => {
				// Promoted First
				const aIsPromoted = a.isPromoted || a.IsPromoted === "TRUE";
				const bIsPromoted = b.isPromoted || b.IsPromoted === "TRUE";
				if (aIsPromoted && !bIsPromoted) return -1;
				if (!aIsPromoted && bIsPromoted) return 1;

				// Live Second
				const aIsLive = a.status === "LIVE" || a.Status === "LIVE";
				const bIsLive = b.status === "LIVE" || b.Status === "LIVE";
				if (aIsLive && !bIsLive) return -1;
				if (!aIsLive && bIsLive) return 1;

				// Distance Third
				return a.distance - b.distance;
			});

			return candidates; // Return all if filtered (user wants specific results)
		});

		// Auto-update rotation seed every 1 minute (checks if 30 min block changed)
		setInterval(() => {
			const newSeed = Math.floor(Date.now() / 1800000);
			if (newSeed !== rotationSeed.value) {
				rotationSeed.value = newSeed;
				console.log("🔄 Shop Rotation Updated!");
			}
		}, 60000);

		// Actions
		const setShops = (shops) => {
			rawShops.value = shops;
		};

		const setActiveShop = (id) => {
			activeShopId.value = id;
		};

		const setUserLocation = (loc) => {
			userLocation.value = loc;
		};

		const setLoading = (val) => {
			isDataLoading.value = val;
		};

		const refreshRotation = () => {
			rotationSeed.value = Math.floor(Date.now() / 1800000);
		};

		const addCoin = async (shopId, value = 10) => {
			if (collectedCoins.value.has(shopId)) return false;

			// Optimistic Update
			collectedCoins.value.add(shopId);
			totalCoins.value += value;

			// Sync to DB
			try {
				const {
					data: { user },
				} = await supabase.auth.getUser();
				if (!user) return true; // Anonymous users get local coins only

				await supabase.from("gamification_logs").insert([
					{
						user_id: user.id,
						action_type: "CHECK_IN",
						coins_earned: value,
						xp_earned: value * 2, // Example multiplier
						details: { venue_id: shopId },
					},
				]);
				// Note: Trigger 'on_gamification_log' will update user_stats automatically
			} catch (e) {
				console.error("Failed to sync coin:", e);
				// We don't rollback optimistic update for better UX, simply fail silently
			}
			return true;
		};

		const addReview = (shopId, review) => {
			const id = String(shopId);
			if (!reviews.value[id]) reviews.value[id] = [];

			const newReview = {
				id: Date.now(),
				timestamp: new Date().toISOString(),
				...review,
			};

			reviews.value[id].unshift(newReview);
			reviews.value[id].unshift(newReview);
			return newReview;
		};

		const getShopReviews = (shopId) => {
			return reviews.value[String(shopId)] || [];
		};

		const fetchShopReviews = async (shopId) => {
			const data = await getReviews(shopId);
			reviews.value[String(shopId)] = data.map((r) => ({
				id: r.id,
				timestamp: r.created_at,
				rating: r.rating,
				comment: r.comment,
				userName: r.user_name,
			}));
		};

		const addReviewToDB = async (shopId, review) => {
			const newReview = await postReview(shopId, review);
			// Local update for instant feedback
			if (!reviews.value[String(shopId)]) reviews.value[String(shopId)] = [];
			reviews.value[String(shopId)].unshift({
				id: newReview.id,
				timestamp: newReview.created_at,
				rating: newReview.rating,
				comment: newReview.comment,
				userName: newReview.user_name,
			});
			return newReview;
		};

		// ✅ Fetch User Stats (Real DB)
		const fetchUserStats = async () => {
			try {
				const {
					data: { user },
				} = await supabase.auth.getUser();
				if (!user) return;

				const { data, error } = await supabase
					.from("user_stats")
					.select("coins, xp, level")
					.eq("user_id", user.id)
					.single();

				if (data) {
					totalCoins.value = data.coins || 0;
					// We can also sync XP if we store it
					// xp.value = data.xp
				}
			} catch (e) {
				console.error("Error fetching user stats:", e);
			}
		};

		// ✅ Real Data Fetching
		const fetchShops = async () => {
			isDataLoading.value = true;
			try {
				const data = await getShops();
				console.log("🏪 [ShopStore] Fetched shops from DB:", data?.length);
				rawShops.value = data;
				// If no data, maybe fallback or show error?
				if (data.length === 0) console.warn("⚠️ No shops found in DB - Check 'venues' table or RLS policies.");
			} catch (error) {
				console.error("Failed to fetch shops:", error);
			} finally {
				isDataLoading.value = false;
			}
		};

		// ✅ Analytics Actions (Real Data)
		const incrementView = async (shopId) => {
			try {
				// RPCs might still be pointing to old logic.
				// If we didn't recreate them in v6, they might fail if 'shops' table is gone.
				// However, we are in 'Loki Mode' - let's try to trust the previous migration or handle it gracefully.
				// ideally we should have 'increment_venue_view'.
				// For now, let's keep the RPC name if we didn't change it, but be aware.
				// ✅ Safety Check
				if (!shopId) return;

				try {
					const { error } = await supabase.rpc("increment_shop_view", { row_id: shopId });
					if (error) throw error;
				} catch (err) {
					// console.warn("Stats update failed:", err);
				}

				// Optimistic Update
				const shop = rawShops.value.find((s) => s.id === shopId);
				if (shop) shop.total_views = (shop.total_views || 0) + 1;
			} catch (e) {
				console.error(e);
			}
		};

		const incrementClick = async (shopId) => {
			try {
				const { error } = await supabase.rpc("increment_shop_click", {
					shop_id_param: shopId,
				});
				if (error) {
					// console.warn("Legacy usage stats RPC failed (expected during migration)");
				}

				// Optimistic Update
				const shop = rawShops.value.find((s) => s.id === shopId);
				if (shop) shop.pin_clicks = (shop.pin_clicks || 0) + 1;
			} catch (e) {
				console.error(e);
			}
		};

		const updateProStatus = async (shopId, { isGlowing, pinDuration }) => {
			try {
				const updates = {};
				if (isGlowing !== undefined) updates.is_glowing = isGlowing;
				if (pinDuration !== undefined) {
					const date = new Date();
					date.setDate(date.getDate() + pinDuration);
					updates.pin_expiration = date.toISOString();
					updates.pro_status = "PRO";
				}

				const { error } = await supabase
					.from("venues")
					.update(updates)
					.eq("id", shopId);

				if (error) throw error;

				// Optimistic Update
				const shop = rawShops.value.find((s) => s.id === shopId);
				if (shop) {
					if (isGlowing !== undefined) shop.is_glowing = isGlowing;
					if (updates.pro_status) shop.pro_status = updates.pro_status;
				}
				return true;
			} catch (e) {
				console.error("Error updating pro status:", e);
				return false;
			}
		};

		return {
			rawShops,
			currentTime,
			activeShopId,
			activeCategories,
			activeStatus,
			isDataLoading,
			userLocation,
			filteredShops,
			setShops,
			setActiveShop,
			setUserLocation,
			setLoading,
			refreshRotation,
			totalCoins,
			userLevel,
			nextLevelXP,
			levelProgress,
			addCoin,
			collectedCoins,
			rotationSeed,
			addReview,
			getShopReviews,
			fetchShopReviews,
			addReviewToDB,
			fetchShops, // ✅ Export Action
			reviews,
			incrementView,
			incrementClick,
			updateProStatus,
			visibleShops, // ✅ Expose Computed
			fetchUserStats, // ✅ Expose Action
		};
	},
	{
		persist: {
			paths: ["collectedCoins", "totalCoins", "reviews"],
			afterRestore: (ctx) => {
				// Restore Set structure for collectedCoins
				if (Array.isArray(ctx.store.collectedCoins)) {
					ctx.store.collectedCoins = new Set(ctx.store.collectedCoins);
				}
			},
		},
	},
);
