// --- C:\vibecity.live\src\store\shopStore.js ---

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { calculateDistance } from "../utils/shopUtils";

export const useShopStore = defineStore("shop", () => {
	// Core State
	const rawShops = ref([]);
	const currentTime = ref(new Date());
	const activeShopId = ref(null);
	const activeCategories = ref([]);
	const activeStatus = ref("ALL");
	const isDataLoading = ref(true);
	const userLocation = ref(null);
	const rotationSeed = ref(Math.floor(Date.now() / 1800000)); // Changes every 30 min

	// ✅ Gamification State
	const COINS_STORAGE_KEY = "vibecity_collected_coins";
	const COINS_TOTAL_KEY = "vibecity_total_coins";

	const collectedCoins = ref(
		new Set(JSON.parse(localStorage.getItem(COINS_STORAGE_KEY) || "[]")),
	);
	const totalCoins = ref(
		parseInt(localStorage.getItem(COINS_TOTAL_KEY) || "0"),
	);

	// ✅ Review System State
	const REVIEWS_STORAGE_KEY = "vibecity_user_reviews";
	const reviews = ref(
		JSON.parse(localStorage.getItem(REVIEWS_STORAGE_KEY) || "{}"),
	);

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
		const prevXP =
			userLevel.value === 1
				? 0
				: userLevel.value === 2
					? 100
					: userLevel.value === 3
						? 300
						: userLevel.value === 4
							? 600
							: 1000;

		return Math.min(1.0, Math.max(0, (currentXP - prevXP) / (nextXP - prevXP)));
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

	// Computed: Nearby Shops (with distance + randomization)
	const nearbyShops = (userLoc) => {
		if (!filteredShops.value) return [];
		if (!userLoc) return filteredShops.value;

		const [userLat, userLng] = userLoc;
		let candidates = filteredShops.value.map((shop) => ({
			...shop,
			distance: calculateDistance(userLat, userLng, shop.lat, shop.lng),
			randomKey: (shop.id + rotationSeed.value * 1103515245) % 12345,
		}));

		// Default view: limit to 30 random shops
		const isDefaultView =
			activeCategories.value.length === 0 && activeStatus.value === "ALL";
		if (isDefaultView) {
			const liveShops = candidates.filter(
				(s) => s.status === "LIVE" || s.Status === "LIVE",
			);
			const normalShops = candidates.filter(
				(s) => s.status !== "LIVE" && s.Status !== "LIVE",
			);
			normalShops.sort((a, b) => a.randomKey - b.randomKey);
			candidates = [...liveShops, ...normalShops].slice(0, 30);
		}

		// Sort: Promoted first, then LIVE, then by distance
		candidates.sort((a, b) => {
			const aIsPromoted = a.isPromoted || a.IsPromoted === "TRUE";
			const bIsPromoted = b.isPromoted || b.IsPromoted === "TRUE";
			if (aIsPromoted && !bIsPromoted) return -1;
			if (!aIsPromoted && bIsPromoted) return 1;

			const aIsLive = a.status === "LIVE" || a.Status === "LIVE";
			const bIsLive = b.status === "LIVE" || b.Status === "LIVE";
			if (aIsLive && !bIsLive) return -1;
			if (!aIsLive && bIsLive) return 1;
			return a.distance - b.distance;
		});

		return candidates;
	};

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

	const saveCoins = () => {
		localStorage.setItem(
			COINS_STORAGE_KEY,
			JSON.stringify([...collectedCoins.value]),
		);
		localStorage.setItem(COINS_TOTAL_KEY, totalCoins.value.toString());
	};

	const addCoin = (shopId, value = 10) => {
		if (collectedCoins.value.has(shopId)) return false;
		collectedCoins.value.add(shopId);
		totalCoins.value += value;
		saveCoins();
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
		localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews.value));
		return newReview;
	};

	const getShopReviews = (shopId) => {
		return reviews.value[String(shopId)] || [];
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
		nearbyShops,
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
		reviews,
	};
});
