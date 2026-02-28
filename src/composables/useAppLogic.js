import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import i18n from "../i18n.js";
import { setClientCookie } from "../lib/cookies";
import { supabase } from "../lib/supabase";
import { openRideApp as openRideAppService } from "../services/DeepLinkService";
// ✅ Utils
import { socketService } from "../services/socketService";
import { useCoinStore } from "../store/coinStore";
import { useLocationStore } from "../store/locationStore";
import { useRoomStore } from "../store/roomStore";
import { useShopStore } from "../store/shopStore";
import { useUserPreferencesStore } from "../store/userPreferencesStore";
import { useUserStore } from "../store/userStore";
import { openExternal } from "../utils/browserUtils";
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
import { useHomeBase } from "./useHomeBase"; // ✅ Correct Import Placement
import { useIdle } from "./useIdle";
import { useMapLogic } from "./useMapLogic";
import { useNotifications } from "./useNotifications";
import { usePerformance } from "./usePerformance";
import { useScrollSync } from "./useScrollSync";
import { useShopFilters } from "./useShopFilters";
import { useThrottledAction } from "./useThrottledAction";
import { useUILogic } from "./useUILogic";

const IS_STRICT_MAP_E2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
const DEEPLINK_NOT_FOUND_DEDUPE_MS = 3500;
let lastDeepLinkNotFoundKey = "";
let lastDeepLinkNotFoundAt = 0;

const shouldNotifyDeepLinkNotFound = (key) => {
	const safeKey = String(key || "").trim();
	const now = Date.now();
	if (
		safeKey &&
		lastDeepLinkNotFoundKey === safeKey &&
		now - lastDeepLinkNotFoundAt < DEEPLINK_NOT_FOUND_DEDUPE_MS
	) {
		return false;
	}
	lastDeepLinkNotFoundKey = safeKey;
	lastDeepLinkNotFoundAt = now;
	return true;
};

const looksLikeVenueId = (value) => {
	const raw = String(value || "").trim();
	if (!raw) return false;
	if (/^\d+$/.test(raw)) return true;
	if (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			raw,
		)
	) {
		return true;
	}
	return /^[0-9a-f-]{12,}$/i.test(raw);
};

export function useAppLogic() {
	const { t, locale } = useI18n();
	const getLocaleValue = () => {
		try {
			const globalLocale = i18n?.global?.locale;
			if (typeof globalLocale === "string") return globalLocale;
			if (globalLocale && typeof globalLocale === "object") {
				return String(globalLocale.value || "en");
			}
		} catch {
			// no-op
		}
		return "en";
	};
	const setLocaleValue = (nextLocale) => {
		try {
			const globalLocale = i18n?.global?.locale;
			if (
				globalLocale &&
				typeof globalLocale === "object" &&
				"value" in globalLocale
			) {
				globalLocale.value = nextLocale;
				return;
			}
			if (i18n?.global) {
				i18n.global.locale = nextLocale;
			}
		} catch {
			if (i18n?.global) {
				i18n.global.locale = nextLocale;
			}
		}
	};
	const router = useRouter();
	const userStore = useUserStore();
	const shopStore = useShopStore();
	const locationStore = useLocationStore();
	const coinStore = useCoinStore();
	const { preferences, isDarkMode } = storeToRefs(userStore);
	const { totalCoins, userLevel, nextLevelXP, levelProgress } =
		storeToRefs(coinStore);
	const userPrefsStore = useUserPreferencesStore(); // ✅ Take Me Home
	const { notifyError } = useNotifications();
	// Snapshot the initial URL early so internal URL syncing (e.g. carousel scroll sync)
	// cannot accidentally trigger "deep link" behaviors.
	const initialUrlSnapshot =
		typeof window === "undefined"
			? { pathname: "", search: "" }
			: { pathname: window.location.pathname, search: window.location.search };

	// --- 1. Init UI & State ---
	const uiLogic = useUILogic(); // Drawers, Modals, Responsive
	const { getDirectionsUrl, hasHomeBase } = useHomeBase(); // ✅ Correct Destructuring
	const {
		isMobileView,
		isTabletView,
		isDesktopView,
		bottomUiHeight,
		mobileCardScrollRef,
		showSidebar, // Used in isUiVisible
		showMallDrawer, // Used in isUiVisible
	} = uiLogic;

	// --- 2. Init Stores ---
	const {
		activeShopId,
		activeCategories,
		activeStatus,
		visibleShops, // Feed & Carousel (Slice)
		processedShops, // Map & Logic (Full data) ✅ Source of Truth
		currentTime,
		isLoading: isDataLoading,
	} = storeToRefs(shopStore);

	// ✅ Location from new store
	const { userLocation } = storeToRefs(locationStore);

	watch(userLocation, (loc) => {
		if (loc) {
			userPrefsStore.saveFirstVisit(loc);
		}
	});

	watch(visibleShops, (val) => {
		if (import.meta.env.DEV) {
			console.log(`🔍 [useAppLogic] visibleShops changed: ${val?.length}`);
		}
	});

	const roomStore = useRoomStore();
	const { totalActiveUsers } = storeToRefs(roomStore);

	// --- 3. Init Map Logic ---
	const mapLogic = useMapLogic({
		isMobileView,
		isTabletView,
		isDesktopView,
		bottomUiHeight,
		userLocation, // Now reactive from locationStore
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
	const { tapFeedback, selectFeedback, successFeedback, microFeedback } =
		useHaptics();
	const { createThrottledAction } = useThrottledAction({ delayMs: 1000 });
	const { isIdle, kick: wakeUi } = useIdle(300000);
	const { isMuted, toggleMute, setZone } = useAudioSystem();
	const { initPerformanceMonitoring, isLowPowerMode } = usePerformance();

	// --- 7. Local State & Glue Logic (Moved Up for TDZ Fix) ---
	const selectedShop = ref(null);
	const errorMessage = ref(null);
	const activeFloor = ref("GF");
	const activeBuilding = ref(null);
	const activeProvince = ref(null);
	const activeZone = ref(null);
	const isOwnerDashboardOpen = ref(false);
	const favorites = ref([]);
	const showSafetyPanel = ref(false); // ✅ Moved up
	const showFavoritesModal = ref(false); // ✅ Moved up
	const isRefreshing = ref(false);
	const legendHeight = computed(() => bottomUiHeight.value || 0);
	const activeFilters = computed(() => [...activeCategories.value]);

	const isUiVisible = computed(() => {
		if (import.meta.env.VITE_E2E === "true") return true;
		if (
			showSidebar.value ||
			uiLogic.showProfileDrawer.value ||
			showMallDrawer.value ||
			selectedShop.value ||
			uiLogic.rideModalShop.value ||
			uiLogic.showSearchResults.value ||
			activeShopId.value ||
			showSafetyPanel.value || // ✅ Added
			showFavoritesModal.value // ✅ Added
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
	const {
		handleHorizontalScroll,
		scrollToCard,
		onScrollStart,
		onScrollEnd,
		isCenteredCard,
	} = scrollSync;

	// --- 7. Local State & Glue Logic ---
	// --- REFACTORED: Computed Base for Logic ---
	const baseShops = computed(() => processedShops.value); // ✅ Normalized Data Source

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

		const matches = processedShops.value.filter(
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
	const LOCALE_PATH_PATTERN = /^\/(th|en)(\/|$)/;
	const stripLocalePrefix = (path) =>
		String(path || "").replace(/^\/(th|en)(?=\/)/, "");
	const getLocaleFromPath = (pathname) => {
		const match = String(pathname || "").match(LOCALE_PATH_PATTERN);
		return match ? match[1] : null;
	};
	const getLocalePrefix = () => {
		if (typeof window === "undefined") return "/th";
		const fromPath = getLocaleFromPath(window.location.pathname);
		const stored =
			localStorage.getItem("locale") ||
			localStorage.getItem("vibe_locale") ||
			"";
		const resolved = fromPath || (stored === "en" ? "en" : "th");
		return `/${resolved}`;
	};
	const withLocalePrefix = (path) => {
		const safe = path.startsWith("/") ? path : `/${path}`;
		if (safe === "/") return getLocalePrefix();
		const localePrefix = getLocalePrefix();
		if (safe.startsWith("/th/") || safe.startsWith("/en/")) return safe;
		return `${localePrefix}${safe}`;
	};

	const VENUE_ID_PATH_PATTERN = /^\/venue\/([^/]+)\/?$/;
	const VENUE_SLUG_PATH_PATTERN = /^\/v\/([^/]+)\/?$/;
	const normalizeVenueId = (value) => {
		if (value === null || value === undefined) return null;
		const str = String(value).trim();
		return str ? str : null;
	};
	const normalizeVenueSlug = (value) => {
		if (value === null || value === undefined) return null;
		const str = String(value).trim().toLowerCase();
		return str ? str : null;
	};
	const getVenueRefFromPath = (pathname) => {
		if (typeof window === "undefined") return null;
		const safePath = pathname ?? window.location.pathname;
		const path = stripLocalePrefix(String(safePath || ""));

		const idMatch = path.match(VENUE_ID_PATH_PATTERN);
		if (idMatch) {
			return { kind: "id", value: normalizeVenueId(idMatch[1]) };
		}

		const slugMatch = path.match(VENUE_SLUG_PATH_PATTERN);
		if (slugMatch) {
			return { kind: "slug", value: normalizeVenueSlug(slugMatch[1]) };
		}

		return null;
	};
	const getPreferredVenuePath = (shopId) => {
		const normalizedId = normalizeVenueId(shopId);
		if (!normalizedId) return null;
		const shop = shopStore.getShopById(normalizedId);
		const slug = normalizeVenueSlug(shop?.slug);
		if (slug) return withLocalePrefix(`/v/${encodeURIComponent(slug)}`);
		return withLocalePrefix(`/venue/${encodeURIComponent(normalizedId)}`);
	};
	const syncVenueUrl = (shopId, { replace = true } = {}) => {
		if (typeof window === "undefined") return;
		const normalizedId = normalizeVenueId(shopId);
		if (!normalizedId) return;
		const targetPath =
			getPreferredVenuePath(normalizedId) ||
			withLocalePrefix(`/venue/${encodeURIComponent(normalizedId)}`);
		const currentPath = window.location.pathname;
		if (currentPath === targetPath) return;
		if (replace) window.history.replaceState({}, "", targetPath);
		else window.history.pushState({}, "", targetPath);
	};
	const redirectToHome = () => {
		if (typeof window === "undefined") return false;
		const targetPath = withLocalePrefix("/");
		const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		if (currentPath === targetPath) return false;
		window.history.replaceState({}, "", targetPath);
		return true;
	};
	const closeDetailSheet = ({ syncRoute = true, replace = true } = {}) => {
		selectedShop.value = null;
		activeShopId.value = null;
		shopStore.setActiveShop(null);
		if (syncRoute) {
			if (replace) window.history.replaceState({}, "", withLocalePrefix("/"));
			else window.history.pushState({}, "", withLocalePrefix("/"));
		}
	};

	// Fire-and-forget analytics (lazy import; must never block UI).
	const trackAnalyticsEvent = (eventType, metadata = {}, venueRef = null) => {
		try {
			void import("../services/analyticsService")
				.then(({ analyticsService }) =>
					analyticsService.trackEvent(eventType, metadata, venueRef),
				)
				.catch(() => {});
		} catch {
			// ignore
		}
	};

	// ✅ Apply Shop Selection (The Coordinator)
	const applyShopSelection = (
		shopId,
		autoImmersive = false,
		{
			syncRoute = true,
			syncRouteMode = "replace",
			trackEvent = false,
			trackEventType = "view_venue",
			shouldFly = true,
			shouldSyncCarousel = true,
			flyOffsetY,
		} = {},
	) => {
		const normalizedId = normalizeVenueId(shopId);
		if (!normalizedId) return;

		activeShopId.value = normalizedId;
		shopStore.setActiveShop(normalizedId);
		if (syncRoute) {
			syncVenueUrl(normalizedId, { replace: syncRouteMode !== "push" });
		}

		if (autoImmersive) {
			uiLogic.toggleImmersive?.(); // If defined
		}

		const shop = shopStore.getShopById(normalizedId); // ✅ Use getShopById for accuracy
		if (shop) {
			if (shouldFly && shop.lat && shop.lng) {
				smoothFlyTo([shop.lat, shop.lng], { offsetY: flyOffsetY });
			}

			// Sync Carousel
			if (shouldSyncCarousel && isMobileView.value) {
				scrollToCard(shopId);
			}

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

		if (trackEvent) {
			trackAnalyticsEvent(trackEventType, { source: "ui" }, normalizedId);
		}
	};

	const handleMarkerClick = (shop) => {
		if (!shop) {
			activeShopId.value = null;
			return;
		}
		selectFeedback();
		microFeedback();
		socketService.joinRoom(shop.id);
		handleOpenDetail(shop, {
			trackEvent: true,
			trackEventType: "open_detail",
			routeMode: "replace",
		});
	};

	const handleOpenDetail = (
		shop,
		{
			trackEvent = false,
			trackEventType = "open_detail",
			routeMode = "push",
		} = {},
	) => {
		if (!shop) {
			closeDetailSheet({ syncRoute: false });
			return;
		}

		// When opening detail sheet, the modal covers ~85-90vh of the screen on mobile,
		// so we need a much larger offsetY (e.g. 40%) to ensure the pin flies into the visible top 10%.
		const viewportHeight =
			typeof window !== "undefined" ? window.innerHeight : 800;

		applyShopSelection(shop.id, false, {
			syncRoute: true,
			syncRouteMode: routeMode,
			trackEvent,
			trackEventType,
			flyOffsetY: Math.round(viewportHeight * 0.48),
		});

		// Stagger the heavy Vue modal mount slightly to let Mapbox lock into WebGL animation first
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				selectedShop.value = shop;
			});
		});

		// Progressive enhancement: fetch full venue details lazily.
		// Must not block UI or navigation.
		try {
			void shopStore
				.fetchVenueDetail?.(shop.id)
				.then((detail) => {
					if (!detail) return;
					if (!selectedShop.value) return;
					if (String(selectedShop.value.id) !== String(detail.id)) return;
					selectedShop.value = detail;
				})
				.catch(() => {});
		} catch {
			// ignore
		}

		// Join realtime room for live vibes/metrics when the detail sheet is open.
		try {
			socketService.joinRoom(shop.id);
		} catch {
			// ignore
		}
	};

	const handleCardClick = (shop) => {
		if (!shop) return;

		// Stop user scroll processing
		scrollSync.isUserScrolling.value = false;

		const shouldSettleCardFirst =
			isMobileView.value && !isCenteredCard(normalizeVenueId(shop.id));

		if (shouldSettleCardFirst) {
			scrollToCard(shop.id);
			cardClickTimer = window.setTimeout(() => {
				applyShopSelection(shop.id, false, {
					trackEvent: true,
					trackEventType: "view_venue",
					shouldSyncCarousel: false,
				});
			}, 260);
		} else {
			applyShopSelection(shop.id, false, {
				trackEvent: true,
				trackEventType: "view_venue",
			});
		}

		// Video sync logic
		const videoEl = document.querySelector(
			`div[data-shop-id="${shop.id}"] video`,
		);
		if (videoEl) {
			shop.initialTime = videoEl.currentTime;
		}

		if (IS_STRICT_MAP_E2E) {
			handleOpenDetail(shop, {
				trackEvent: true,
				trackEventType: "open_detail",
				routeMode: "replace",
			});
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
		// Note: selectedShop ref might not always be set if just activeId changed
		// Better to find from store
		// Better to find from store
		const currentShop = shopStore.getShopById(activeShopId.value);
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

	// Local Interval for time update
	let timeInterval = null;
	let popStateHandler = null;
	let deepLinkTimer = null;
	let initRunSeq = 0;

	// --- Initialization Logic ---
	const handleSocketEvent = (data) => {
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
	};

	const initApp = async () => {
		// Clean up previous interval if exists
		if (timeInterval) clearInterval(timeInterval);
		if (deepLinkTimer) {
			clearTimeout(deepLinkTimer);
			deepLinkTimer = null;
		}
		const runSeq = ++initRunSeq;

		isDataLoading.value = true;
		try {
			initPerformanceMonitoring();

			setLocaleValue(userStore.preferences.language || "en");
			favorites.value = loadFavoritesWithTTL();

			// Load saved coins/stats if needed
			// (Assumed handled by shopStore persistence, but original had manual load)

			// Fetch the minimum required data first so the app becomes interactive ASAP.
			await shopStore.fetchShops();

			// Mark primary UI as ready (events/stats can load in the background).
			isDataLoading.value = false;

			// Background tasks (must not block initial interactivity).
			void coinStore.fetchUserStats()?.catch?.(() => {});
			void updateEventsData()?.catch?.(() => {});
			void fetch("/data/buildings.json")
				.then((r) => r.json())
				.then((d) => {
					buildingsData.value = d;
				})
				.catch(() => {});
			void fetch("/data/events.json")
				.then((r) => r.json())
				.then((d) => {
					timedEvents.value = d;
				})
				.catch(() => {});

			// Init Real-time Vibe Stream after first paint to reduce startup contention.
			try {
				requestAnimationFrame(() => {
					socketService.connect();
					socketService.addListener(handleSocketEvent);
				});
			} catch {
				// Fallback if rAF isn't available
				socketService.connect();
				socketService.addListener(handleSocketEvent);
			}

			// Geolocation (delegate to locationStore for unified lifecycle)
			if (navigator.geolocation) {
				if (!locationStore.isTracking) {
					void locationStore.startWatching();
				}
			} else if (!locationStore.userLocation) {
				locationStore.useDefaultLocation();
			}

			// Deep-link entry: /venue/:id OR /v/:slug with legacy fallback ?shop=:id|slug
			const pathVenue = getVenueRefFromPath(initialUrlSnapshot.pathname);
			const urlParams = new URLSearchParams(initialUrlSnapshot.search);
			const queryVenueRaw = urlParams.get("venue") || urlParams.get("shop");

			const resolveVenueIdFromRef = async (ref) => {
				if (!ref) return null;
				if (ref.kind === "id") return normalizeVenueId(ref.value);
				if (ref.kind === "slug") {
					const slug = normalizeVenueSlug(ref.value);
					if (!slug) return null;

					const maybeShortCode = (value) => {
						const upper = String(value || "")
							.trim()
							.toUpperCase();
						if (!upper) return null;
						// Base32 (RFC4648) 7 chars. Canonical remains /v/<slug>.
						if (!/^[A-Z2-7]{7}$/.test(upper)) return null;
						return upper;
					};

					// Short-code alias: /v/<CODE> -> resolve to venue id (best-effort; fail open)
					const code = maybeShortCode(slug);
					if (code) {
						try {
							const { data, error } = await supabase
								.from("venues")
								.select("id")
								.eq("short_code", code)
								.maybeSingle();
							if (!error && data?.id) return normalizeVenueId(data.id);
						} catch {
							// ignore
						}
					}

					// Current slug
					const shop = shopStore.getShopBySlug(slug);
					if (shop) return normalizeVenueId(shop.id);

					// Slug history redirect support (best-effort; fail open)
					try {
						const { data, error } = await supabase
							.from("venue_slug_history")
							.select("venue_id")
							.eq("slug", slug)
							.maybeSingle();
						if (!error && data?.venue_id)
							return normalizeVenueId(data.venue_id);
					} catch {
						// ignore
					}
				}
				return null;
			};

			const resolveVenueIdFromDb = async (ref) => {
				if (!ref) return null;
				try {
					if (ref.kind === "id") {
						const normalized = normalizeVenueId(ref.value);
						if (!normalized) return null;
						const { data, error } = await supabase
							.from("venues")
							.select("id")
							.eq("id", normalized)
							.maybeSingle();
						if (!error && data?.id) return normalizeVenueId(data.id);
						return null;
					}

					if (ref.kind !== "slug") return null;
					const slug = normalizeVenueSlug(ref.value);
					if (!slug) return null;

					const { data, error } = await supabase
						.from("venues")
						.select("id")
						.eq("slug", slug)
						.maybeSingle();
					if (!error && data?.id) return normalizeVenueId(data.id);
				} catch {
					// ignore
				}
				return null;
			};

			const queryRef = (() => {
				const raw = String(queryVenueRaw || "").trim();
				const normalized = normalizeVenueId(raw);
				if (!normalized) return null;
				const byId = shopStore.getShopById(normalized);
				if (byId) return { kind: "id", value: normalizeVenueId(byId.id) };
				const bySlug = shopStore.getShopBySlug(normalized);
				if (bySlug) return { kind: "id", value: normalizeVenueId(bySlug.id) };
				return looksLikeVenueId(normalized)
					? { kind: "id", value: normalized }
					: { kind: "slug", value: normalizeVenueSlug(normalized) };
			})();

			const deepLinkRef = pathVenue ?? queryRef;
			const initialVenueId =
				(await resolveVenueIdFromRef(pathVenue)) ??
				(await resolveVenueIdFromRef(queryRef)) ??
				(await resolveVenueIdFromDb(deepLinkRef));

			if (initialVenueId) {
				deepLinkTimer = setTimeout(async () => {
					if (runSeq !== initRunSeq) return;
					let shop = shopStore.getShopById(initialVenueId);
					if (!shop && typeof shopStore.fetchVenueDetail === "function") {
						try {
							const hydrated = await shopStore.fetchVenueDetail(initialVenueId);
							if (runSeq !== initRunSeq) return;
							shop = hydrated || shopStore.getShopById(initialVenueId);
						} catch {
							// ignore
						}
					}
					if (!shop && deepLinkRef) {
						const lateResolvedId = await resolveVenueIdFromDb(deepLinkRef);
						if (lateResolvedId && lateResolvedId !== initialVenueId) {
							shop = shopStore.getShopById(lateResolvedId);
							if (!shop && typeof shopStore.fetchVenueDetail === "function") {
								try {
									const hydrated =
										await shopStore.fetchVenueDetail(lateResolvedId);
									if (runSeq !== initRunSeq) return;
									shop = hydrated || shopStore.getShopById(lateResolvedId);
								} catch {
									// ignore
								}
							}
						}
					}
					if (!shop) {
						const redirected = redirectToHome();
						if (
							redirected &&
							shouldNotifyDeepLinkNotFound(
								`venue:${initialVenueId}:${deepLinkRef?.kind || "unknown"}`,
							)
						) {
							notifyError("Venue not found. Redirected to home.");
						}
						return;
					}
					handleOpenDetail(shop, {
						trackEvent: true,
						trackEventType: "deeplink_open",
						routeMode: "replace",
					});
				}, 650);
			}

			// Intervals
			timeInterval = setInterval(() => {
				currentTime.value = new Date();
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
		if (typeof window !== "undefined") {
			popStateHandler = () => {
				const venueRef = getVenueRefFromPath(window.location.pathname);
				if (!venueRef && selectedShop.value) {
					closeDetailSheet({ syncRoute: false });
				}
			};
			window.addEventListener("popstate", popStateHandler);
		}
	});

	onUnmounted(() => {
		if (timeInterval) {
			clearInterval(timeInterval);
			timeInterval = null;
		}
		if (deepLinkTimer) {
			clearTimeout(deepLinkTimer);
			deepLinkTimer = null;
		}
		if (cardClickTimer) {
			clearTimeout(cardClickTimer);
			cardClickTimer = null;
		}
		if (searchBlurTimer) {
			clearTimeout(searchBlurTimer);
			searchBlurTimer = null;
		}
		socketService.removeListener(handleSocketEvent);
		socketService.disconnect?.();
		if (typeof window !== "undefined" && popStateHandler) {
			window.removeEventListener("popstate", popStateHandler);
			popStateHandler = null;
		}
	});

	// Wrapper for favorites
	const runToggleFavorite = (shopId) => {
		const id = normalizeVenueId(shopId);
		if (!id) return;
		const index = favorites.value.findIndex((x) => String(x) === id);
		if (index === -1) {
			favorites.value.push(id);
			saveFavoriteItem(id);
			successFeedback();
			microFeedback();
			return;
		}
		favorites.value.splice(index, 1);
		removeFavoriteItem(id);
		selectFeedback();
		microFeedback();
	};
	const toggleFavorite = createThrottledAction((shopId) => {
		runToggleFavorite(shopId);
	});
	const isFavorited = (id) => {
		const normalized = normalizeVenueId(id);
		if (!normalized) return false;
		return favorites.value.some((x) => String(x) === normalized);
	};

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
		baseShops, // ✅ Use full dataset for Map & Search (was visibleShops)
		activeCategories,
		activeStatus,
		activeShopId,
	);
	const isInitialLoad = computed(
		() => isDataLoading.value && filteredShops.value.length === 0,
	);
	const suggestedShops = computed(() =>
		filteredShops.value
			.filter(
				(shop) =>
					normalizeVenueId(shop?.id) !== normalizeVenueId(activeShopId.value),
			)
			.slice(0, 12),
	);
	const selectedShopCoords = computed(() => {
		const current =
			selectedShop.value || shopStore.getShopById(activeShopId.value);
		if (!current) return null;
		const lat = Number(current.lat);
		const lng = Number(current.lng);
		return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
	});
	const liveCount = computed(() => Number(totalActiveUsers.value || 0));

	const handleFilterApply = (selectedCategoryIds = []) => {
		activeCategories.value = Array.isArray(selectedCategoryIds)
			? [...selectedCategoryIds]
			: [];
	};

	const requestGeolocation = () => {
		if (!locationStore.isTracking) {
			locationStore.startWatching();
		}
	};

	const handleCardHover = (_shop) => {};

	const handleSwipe = (direction, shop) => {
		if (!shop) return;
		if (direction === "right") {
			toggleFavorite(shop.id);
			return;
		}
		if (direction === "left") {
			openRideModal(shop);
		}
	};

	const handleEnterIndoor = (shop) => {
		if (!shop?.Building || !buildingsData.value?.[shop.Building]) return;
		activeBuilding.value = {
			...buildingsData.value[shop.Building],
			key: shop.Building,
		};
		activeFloor.value = shop.floor || "GF";
		showMallDrawer.value = true;
	};

	const handleCloseFloorSelector = () => {
		showMallDrawer.value = false;
		activeFloor.value = "GF";
	};

	const handleBuildingOpen = (building) => {
		if (!building) return;
		activeBuilding.value = building;
		showMallDrawer.value = true;
	};

	const toggleLanguage = () => {
		const newLang = getLocaleValue() === "th" ? "en" : "th";
		setLocaleValue(newLang);
		userStore.setLanguage(newLang);
		if (typeof window !== "undefined") {
			try {
				const path = window.location.pathname || "/";
				const stripped = stripLocalePrefix(path);
				const normalized = stripped === "" ? "/" : stripped;
				const nextPath =
					normalized === "/" ? `/${newLang}` : `/${newLang}${normalized}`;
				window.history.replaceState({}, "", nextPath);
				setClientCookie("vibe_locale", newLang, {
					maxAgeSeconds: 60 * 60 * 24 * 365,
				});
				localStorage.setItem("locale", newLang);
				router.replace(nextPath).catch(() => {});
			} catch {
				// ignore
			}
		}
		tapFeedback();
	};

	const toggleTheme = () => {
		userStore.toggleDarkMode();
		tapFeedback();
	};

	const handleLocateMeWrapper = () => handleLocateMe(selectFeedback);
	const handleRefresh = async () => {
		isRefreshing.value = true;
		try {
			await initApp();
		} finally {
			isRefreshing.value = false;
		}
	};

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
		suggestedShops,
		currentTime,
		activeShopId,
		activeCategories,
		activeStatus,
		activeFilters,
		activeBuilding,
		activeProvince,
		activeZone,
		favorites,
		totalCoins,
		userLevel,
		nextLevelXP,
		levelProgress,
		userLocation,
		selectedShop,
		closeDetailSheet,
		selectedShopCoords,
		isDataLoading,
		isInitialLoad,
		isRefreshing,
		isDarkMode,
		isLowPowerMode,
		legendHeight,
		liveCount,
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
		handleCardHover,
		handleOpenDetail,
		handlePanelScroll,
		handleSwipe,
		handleEnterIndoor,
		handleCloseFloorSelector,
		handleBuildingOpen,
		toggleFavorite,
		isFavorited,
		openRideModal,
		closeRideModal,
		openRideApp,
		requestGeolocation,
		toggleLanguage,
		toggleTheme,
		handleFilterApply,
		// ✅ Explicit UI Actions
		toggleSidebar: () => {
			showSidebar.value = !showSidebar.value;
			selectFeedback();
		},
		handleRefresh,
		refreshUserStats: () => coinStore.fetchUserStats(),
		t,
		locale,

		// Utils
		isMuted,
		toggleMute,
		wakeUi,
		isUiVisible,

		// Haptics - ✅ Fix: Export haptic feedback functions
		tapFeedback,
		selectFeedback,

		// Search
		globalSearchQuery,
		globalSearchResults,
		handleGlobalSearchSelect: (shop) => {
			handleOpenDetail(shop, {
				trackEvent: true,
				trackEventType: "search_open",
			});
			globalSearchQuery.value = "";
			uiLogic.showSearchResults.value = false;
		},
		handleSearchBlur: () => {
			searchBlurTimer = setTimeout(() => {
				uiLogic.showSearchResults.value = false;
			}, 200);
		},

		// Misc
		carouselShops: computed(() => shopStore.visibleShops),
		carouselShopIds: computed(() => shopStore.visibleShops.map((s) => s.id)),
		loadMoreVibes: () => {}, // Infinite scroll placeholder
		retryLoad: () => globalThis.location.reload(),

		// Template Compat
		activeMall: activeBuilding,
		mallShops: computed(() => {
			if (!activeBuilding.value) return [];
			const targetKey = String(activeBuilding.value.key || "")
				.trim()
				.toLowerCase();
			return shopStore.processedShops.filter(
				(s) =>
					String(s.Building || "")
						.trim()
						.toLowerCase() === targetKey,
			);
		}),
		activeFloor,
		currentUserStats: computed(() => ({ coins: coinStore.coins })),
		isDev: import.meta.env.DEV,

		// ✅ Safety Features
		showSafetyPanel,
		handleOpenSOS: () => {
			showSafetyPanel.value = true;
		},
		handleCloseSOS: () => {
			showSafetyPanel.value = false;
		},
		handleTakeMeHome: () => {
			if (hasHomeBase.value) {
				const url = getDirectionsUrl("google");
				if (url) openExternal(url);
			} else {
				console.warn("No home location set yet");
			}
		},

		// ✅ Favorites Modal (Fixed: Removed 'this')
		showFavoritesModal,
		handleOpenFavorites: () => {
			showFavoritesModal.value = true;
		},
		handleCloseFavorites: () => {
			showFavoritesModal.value = false;
		},
	};
}
