import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { openRideApp as openRideAppService } from "../services/DeepLinkService";
// ✅ Utils
import { socketService } from "../services/socketService";
import { useRoomStore } from "../store/roomStore";
import { useShopStore } from "../store/shopStore";
import { useUserStore } from "../store/userStore";
import { calculateDistance } from "../utils/shopUtils";
import {
    loadFavoritesWithTTL,
    removeFavoriteItem,
    saveFavoriteItem,
} from "../utils/storageHelper";
import { useAudioSystem } from "./useAudioSystem";
// ✅ Modular Composables
import { useEventLogic } from "./useEventLogic";
import { useEdgeSwipe } from "./useGestures";
import { useHaptics } from "./useHaptics";
import { useIdle } from "./useIdle";
import { useMapLogic } from "./useMapLogic";
import { usePerformance } from "./usePerformance";
import { useScrollSync } from "./useScrollSync";
import { useShopFilters } from "./useShopFilters";
import { useUILogic } from "./useUILogic";

export function useAppLogic() {
	const { t, locale } = useI18n();
	const userStore = useUserStore();
	const shopStore = useShopStore();

	// --- 1. Init UI & State ---
	const uiLogic = useUILogic(); // Drawers, Modals, Responsive
	const {
		isMobileView,
		isLandscape,
		bottomUiHeight,
		mobileCardScrollRef,
		showSidebar,
		showMallDrawer,
		errorMessage,
		showConfetti,
		activePopup,
	} = uiLogic;

	// --- 2. Init Stores ---
	const {
		rawShops,
		currentTime,
		activeShopId,
		activeCategories,
		activeStatus,
		isDataLoading,
		totalCoins,
		userLevel,
		nextLevelXP,
		levelProgress,
		rotationSeed,
		userLocation,
        visibleShops, // Destructure this!
	} = storeToRefs(shopStore);

    watch(visibleShops, (val) => {
        console.log(`🔍 [useAppLogic] visibleShops changed: ${val?.length}`);
    });

	const { preferences } = storeToRefs(userStore);
	const isDarkMode = computed(() => preferences.value.isDarkMode);
	const roomStore = useRoomStore();

	// --- 3. Init Map Logic ---
	const mapLogic = useMapLogic({
		isMobileView,
		bottomUiHeight,
		userLocation,
	});
	const { mapRef, smoothFlyTo, handleLocateMe } = mapLogic;

	// --- 4. Init Event Logic ---
	const eventLogic = useEventLogic();
	const {
		activeEvents,
		buildingsData,
		realTimeEvents,
		updateEventsData,
		timedEvents,
	} = eventLogic;

	// --- 5. Init Utils (Audio, Haptics, Perf) ---
	const { tapFeedback, selectFeedback, successFeedback } = useHaptics();
	const { isIdle, kick: wakeUi } = useIdle(8000);
	const { isMuted, toggleMute, setZone } = useAudioSystem();
	const { initPerformanceMonitoring, isLowPowerMode } = usePerformance();

	const isUiVisible = computed(() => {
		if (
			showSidebar.value ||
			uiLogic.showProfileDrawer.value ||
			showMallDrawer.value ||
			selectedShop.value ||
			uiLogic.rideModalShop.value ||
			uiLogic.showSearchResults.value ||
			activeShopId.value
		) {
			return true;
		}
		return !isIdle.value;
	});

	// --- 6. Init Scroll Sync ---
	const scrollSync = useScrollSync({
		activeShopId,
		shops: computed(() => shopStore.visibleShops),
		mapRef,
		smoothFlyTo,
		selectFeedback,
		mobileCardScrollRef,
	});
	const { handleHorizontalScroll, scrollToCard, onScrollStart, onScrollEnd } =
		scrollSync;

	// --- 7. Local State & Glue Logic ---
	const selectedShop = ref(null);
	const activeFloor = ref("GF"); // Mall Navigation
	const activeBuilding = ref(null); // IMPORTANT: Bridges UI and Map
	const activeBuildingId = ref(null);
	const activeProvince = ref(null);
	const activeZone = ref(null);
	const isOwnerDashboardOpen = ref(false); // ✅ New Owner State
	const favorites = ref([]);
	const homeLocation = ref(null);

	// Search Logic (Kept here as it spans multiple domains)
	const globalSearchQuery = ref("");

	const globalSearchResults = computed(() => {
		if (!globalSearchQuery.value || globalSearchQuery.value.length < 2)
			return [];

		const emojiMap = {
			"☕": "cafe",
			"🍽️": "restaurant",
			"🍜": "food",
			"🍺": "bar",
			"🍷": "wine",
			"💃": "club",
			"🎵": "live music",
			"🎨": "art",
			"🛍️": "fashion",
			"🏢": "mall",
		};

		let searchQuery = globalSearchQuery.value.toLowerCase();
		for (const [emoji, term] of Object.entries(emojiMap)) {
			if (searchQuery.includes(emoji)) {
				searchQuery = searchQuery.replace(emoji, term);
			}
		}

		const matches = shopStore.visibleShops.filter(
			(s) =>
				(s.name || "").toLowerCase().includes(searchQuery) ||
				(s.category || "").toLowerCase().includes(searchQuery),
		);

		if (userLocation.value) {
			const [uLat, uLng] = userLocation.value;
			return matches
				.map((s) => ({
					...s,
					distance:
						s.lat && s.lng
							? calculateDistance(uLat, uLng, s.lat, s.lng)
							: Infinity,
				}))
				.sort((a, b) => a.distance - b.distance)
				.slice(0, 10);
		}
		return matches.slice(0, 10);
	});

	// --- 8. Core Coordinator Functions ---

	// ✅ Apply Shop Selection (The Coordinator)
	const applyShopSelection = (shopId, autoImmersive = false) => {
		if (!shopId) return;

		activeShopId.value = Number(shopId);
		shopStore.setActiveShop(shopId);

		if (autoImmersive) {
			uiLogic.toggleImmersive?.(); // If defined
		}

		const shop = shopStore.visibleShops.find(
			(s) => Number(s.id) == Number(shopId),
		);
		if (shop) {
			if (shop.lat && shop.lng) {
				smoothFlyTo([shop.lat, shop.lng]);
			}

			// Sync Carousel
			if (isMobileView.value) {
				scrollToCard(shopId);
			}

			// Sync Panel/Drawer logic
			selectedShop.value = shop; // For details modal

			// Detect Building/Mall context
			const buildingKey = shop.Building;
			const buildingRaw = buildingKey ? buildingsData.value[buildingKey] : null;

			if (buildingRaw) {
				activeBuilding.value = { ...buildingRaw, key: buildingKey };
				showMallDrawer.value = true;
			} else {
				activeBuilding.value = null;
			}
		}
	};

	const handleMarkerClick = (shop) => {
		if (!shop) {
			activeShopId.value = null;
			return;
		}
		selectFeedback();
		if (activeShopId.value == shop.id) {
			activeShopId.value = null;
			return;
		}
		applyShopSelection(shop.id);
		socketService.joinRoom(shop.id);
	};

	const handleCardClick = (shop) => {
		if (!shop) return;

		// Stop user scroll processing
		scrollSync.isUserScrolling.value = false;

		applyShopSelection(shop.id);

		// Video sync logic
		const videoEl = document.querySelector(
			`div[data-shop-id="${shop.id}"] video`,
		);
		if (videoEl) {
			shop.initialTime = videoEl.currentTime;
		}
	};

	const handlePanelScroll = (shop) => {
		activeShopId.value = shop.id;
		activeProvince.value = shop.Province || null;
		activeZone.value = shop.Zone || null;

		if (mapRef.value && shop.lat && shop.lng) {
			// Panel scroll might be less smooth/cinematic than selection
			// But we can use smoothFlyTo or direct focus
			// smoothFlyTo([shop.lat, shop.lng]);
			// Original used focusLocation with zoom 16
			if (mapRef.value.focusLocation) {
				mapRef.value.focusLocation([shop.lat, shop.lng], 16);
			}
		}
	};

	// --- 9. Watchers & Lifecycle ---

	// Metadata & Title
	const updateMetadata = () => {
		const baseTitle = "VibeCity.live | Local Entertainment Map";
		const shopName = selectedShop.value?.name;
		// Note: selectedShop ref might not always be set if just activeId changed
		// Better to find from store
		const currentShop = shopStore.visibleShops.find(
			(s) => s.id == activeShopId.value,
		);
		const activeCat = activeCategories.value[0];

		if (currentShop) {
			document.title = `${currentShop.name} - VibeCity.live`;
		} else if (activeCat) {
			document.title = `${activeCat} in Chiang Mai - VibeCity.live`;
		} else {
			document.title = baseTitle;
		}
	};

	watch(() => [activeShopId.value, activeCategories.value], updateMetadata, {
		immediate: true,
	});

	// Zone Audio
	watch(activeCategories, (newCats) => {
		if (newCats.length === 0) {
			setZone("default");
			return;
		}
		const cat = newCats[0].toLowerCase();
		if (["nightlife", "bar", "club", "wine"].some((k) => cat.includes(k)))
			setZone("nightlife");
		else if (["nature", "park", "camp"].some((k) => cat.includes(k)))
			setZone("nature");
		else if (["temple", "culture"].some((k) => cat.includes(k)))
			setZone("temple");
		else setZone("default");
	});

	// Mall/Building Drawer
	watch(activeBuilding, (newVal) => {
		if (newVal) {
			showMallDrawer.value = true;
		}
	});

	// Gestures (Must be called in setup, not inside onMounted)
	useEdgeSwipe(() => {
		showSidebar.value = true;
	});

	// --- OnMounted ---
	const activeUserCount = ref(0);

	// --- Initialization Logic ---
	const initApp = async () => {
		// Init Real-time Vibe Stream
		socketService.connect();

		socketService.addListener((data) => {
			if (data.type === "error") {
				// handle error
			}
			if (data.type === "presence") {
				// If the presence update is for the ACTIVE shop, update state
				// Note: shopId might be string vs number
				if (activeShopId.value && data.shopId == activeShopId.value) {
					activeUserCount.value = data.count;
				}
				// Also update store
				roomStore.updateSingleCount(data.shopId, data.count);
			}
			if (data.type === "heatmap") {
				// { type: 'heatmap', data: { shopId: count, ... } }
				roomStore.updateCounts(data.data);
			}
		});

		isDataLoading.value = true;
		try {
			initPerformanceMonitoring();

			locale.value = userStore.preferences.language;
			favorites.value = loadFavoritesWithTTL();

			// Load saved coins/stats if needed
			// (Assumed handled by shopStore persistence, but original had manual load)

			// Fetch Data
			await Promise.all([
				shopStore.fetchShops(),
				shopStore.fetchUserStats(), // ✅ Load real user stats
				updateEventsData(),
				fetch("/data/buildings.json")
					.then((r) => r.json())
					.then((d) => {
						buildingsData.value = d;
					})
					.catch(() => {}),
				fetch("/data/events.json")
					.then((r) => r.json())
					.then((d) => {
						timedEvents.value = d;
					})
					.catch(() => {}),
			]);

			// Geolocation with Throttling (Real Data Smoothness)
			if (navigator.geolocation) {
				let lastLat = 0;
				let lastLng = 0;
				const MIN_DIST = 0.0002; // Approx 20 meters

				navigator.geolocation.watchPosition(
					(pos) => {
						const { latitude, longitude } = pos.coords;
						// Simple Taxicab geometry check for throttle
						if (
							Math.abs(latitude - lastLat) > MIN_DIST ||
							Math.abs(longitude - lastLng) > MIN_DIST
						) {
							shopStore.setUserLocation([latitude, longitude]);
							lastLat = latitude;
							lastLng = longitude;
						}
					},
					(err) => {
						console.warn("Geolocation warning:", err.message);
						// Fallback only if no location set yet
						if (!shopStore.userLocation) {
							shopStore.setUserLocation([18.7883, 98.9853]);
						}
					},
					{ enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
				);
			}

			// Url params
			const urlParams = new URLSearchParams(window.location.search);
			const shopIdParam = urlParams.get("shop");
			if (shopIdParam) {
				setTimeout(() => applyShopSelection(Number(shopIdParam)), 1500);
			}

			// Intervals
			setInterval(() => {
				currentTime.value = new Date();
				// Refresh logic using shopStore actions if needed
			}, 60000);
		} catch (e) {
			console.error("Init Error", e);
			errorMessage.value = "Failed to load VibeCity.";
		} finally {
			isDataLoading.value = false;
		}
	};

	onMounted(() => {
		initApp();
	});

	// Wrapper for favorites
	const toggleFavorite = (shopId) => {
		const id = Number(shopId);
		const index = favorites.value.indexOf(id);
		if (index === -1) {
			favorites.value.push(id);
			saveFavoriteItem(id);
			successFeedback();
		} else {
			favorites.value.splice(index, 1);
			removeFavoriteItem(id);
			selectFeedback();
		}
	};
	const isFavorited = (id) => favorites.value.includes(Number(id));

	// Ride App
	const openRideModal = (shop) => {
		uiLogic.rideModalShop.value = shop;
	};
	const closeRideModal = () => {
		uiLogic.rideModalShop.value = null;
	};
	const openRideApp = (appName) => {
		if (!uiLogic.rideModalShop.value) return;
		openRideAppService(appName, uiLogic.rideModalShop.value);
		closeRideModal();
	};

	// Filters wrapper
	const { filteredShops } = useShopFilters(
		computed(() => shopStore.visibleShops), // Pass computed
		activeCategories,
		activeStatus,
		activeShopId,
	);

	const toggleLanguage = () => {
		const newLang = locale.value === "th" ? "en" : "th";
		locale.value = newLang;
		userStore.setLanguage(newLang);
		tapFeedback();
	};

	const toggleTheme = () => {
		userStore.toggleDarkMode();
		tapFeedback();
	};

	const handleLocateMeWrapper = () => handleLocateMe(selectFeedback);

	// Export everything expected by App.vue
	return {
		// ...uiLogic
		...uiLogic, // Spread UI logic refs directly

		// Map
		mapRef,
		smoothFlyTo,
		handleLocateMe: handleLocateMeWrapper,
		mapUiTopOffset: mapLogic.mapUiTopOffset,
		mapUiBottomOffset: mapLogic.mapUiBottomOffset,
		handleEnterGiantView: (b) =>
			mapLogic.handleEnterGiantView(b, selectFeedback),
		handleExitGiantView: () => mapLogic.handleExitGiantView(tapFeedback),

		// Event
		activeEvents,
		realTimeEvents,

		// Scroll
		handleHorizontalScroll,
		scrollToCard,
		onScrollStart,
		onScrollEnd,

		// Stores & Data
		shops: computed(() => shopStore.visibleShops),
		filteredShops,
		currentTime,
		activeShopId,
		activeCategories,
		activeStatus,
		activeBuilding,
		activeProvince,
		activeZone,
		favorites,
		userLocation,
		isDataLoading,
		errorMessage,
		activeUserCount, // ✅ New
		isOwnerDashboardOpen, // ✅ New Owner State
		toggleOwnerDashboard: () => {
			isOwnerDashboardOpen.value = !isOwnerDashboardOpen.value;
		},
		clearError: () => {
			errorMessage.value = null;
		},
		retryInitialLoad: initApp,

		// Methods
		applyShopSelection,
    handleMarkerClick,
    handleCardClick,
    handleOpenDetail: (shop) => {
      // ✅ Fix: Ensure detailed view opens when swiping up
      if (!shop) {
        selectedShop.value = null;
        return;
      }
      applyShopSelection(shop.id);
      selectedShop.value = shop;
    },
    handlePanelScroll,
		toggleFavorite,
		isFavorited,
		openRideModal,
		closeRideModal,
		openRideApp,
		toggleLanguage,
		toggleTheme,
		t,
		locale,

		// Utils
		isMuted,
		toggleMute,
		wakeUi,
		isUiVisible,

		// Search
		globalSearchQuery,
		globalSearchResults,
		handleGlobalSearchSelect: (shop) => {
			handleMarkerClick(shop);
			globalSearchQuery.value = "";
			uiLogic.showSearchResults.value = false;
		},
		handleSearchBlur: () =>
			setTimeout(() => {
				uiLogic.showSearchResults.value = false;
			}, 200),

		// Misc (Keep compatibility)
		carouselShops: computed(() => {
			// simplified logic: visible shops are already limited by store?
			// Or recreate the pagination logic if needed.
			// Shop store has pagination? useShopStore implemented "visibleShops" which is sliced to 30.
			return shopStore.visibleShops;
		}),
		carouselShopIds: computed(() => shopStore.visibleShops.map((s) => s.id)),
		loadMoreVibes: () => {}, // Store handles max limit, or implements pagination
		retryLoad: () => window.location.reload(),

		// These might be needed if template uses them directly
		activeMall: activeBuilding,
		mallShops: computed(() => {
			if (!activeBuilding.value) return [];
			const targetKey = String(activeBuilding.value.key || "")
				.trim()
				.toLowerCase();
			return shopStore.rawShops.filter(
				(s) =>
					String(s.Building || "")
						.trim()
						.toLowerCase() === targetKey,
			);
		}),
		activeFloor,

		// Stats
		currentUserStats: ref({ coins: 0 }), // Placeholder
		isDev: import.meta.env.DEV,
		handleTakeMeHome: () => alert("Take Me Home - Reimplement if needed"),
	};
}
