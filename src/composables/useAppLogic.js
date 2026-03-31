import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { DEFAULT_OG_TITLE } from "../config/appMeta";
import {
	normalizeGiantPinPayload,
	resolveCanonicalBuilding,
	resolveVenueBuildingId,
} from "../domain/venue/giantPinContext";
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
import { isAppDebugLoggingEnabled } from "../utils/debugFlags";
import { calculateDistance } from "../utils/shopUtils";
import {
	loadFavoritesWithTTL,
	removeFavoriteItem,
	saveFavoriteItem,
} from "../utils/storageHelper";
import {
	buildMapSelectionIntent,
	getCenteredSelectionSource,
} from "./map/mapSelectionIntent";
import { useAudioSystem } from "./useAudioSystem";
// ✅ Modular Composables
import { useEventLogic } from "./useEventLogic";
import { useEdgeSwipe } from "./useGestures";
import { useHaptics } from "./useHaptics";
import { useHomeBase } from "./useHomeBase"; // ✅ Correct Import Placement
import { useIdle } from "./useIdle";
import { useIntentPredictor } from "./useIntentPredictor";
import { useMapLogic } from "./useMapLogic";
import { useNotifications } from "./useNotifications";
import { usePerformance } from "./usePerformance";
import { usePrefetchEngine } from "./usePrefetchEngine";
import { useScrollSync } from "./useScrollSync";
import { useShopFilters } from "./useShopFilters";
import { useThrottledAction } from "./useThrottledAction";
import { useUILogic } from "./useUILogic";

const IS_STRICT_MAP_E2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
const DEEPLINK_NOT_FOUND_DEDUPE_MS = 3500;
const AUTO_OPENED_DETAIL_SESSION_KEY = "vibecity.autoOpenedDetailShopIds";
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

export const normalizeAutoOpenedDetailId = (value) => {
	if (value === null || value === undefined) return null;
	const normalized = String(value).trim();
	return normalized || null;
};

export const restoreAutoOpenedDetailShopIds = (storage) => {
	if (!storage?.getItem) return new Set();
	try {
		const raw = storage.getItem(AUTO_OPENED_DETAIL_SESSION_KEY);
		if (!raw) return new Set();
		const ids = JSON.parse(raw);
		if (!Array.isArray(ids)) return new Set();
		return new Set(
			ids.map((id) => normalizeAutoOpenedDetailId(id)).filter(Boolean),
		);
	} catch {
		return new Set();
	}
};

export const persistAutoOpenedDetailShopIds = (storage, ids) => {
	if (!storage?.setItem || !(ids instanceof Set)) return;
	try {
		storage.setItem(
			AUTO_OPENED_DETAIL_SESSION_KEY,
			JSON.stringify([...ids].filter(Boolean)),
		);
	} catch {
		// ignore sessionStorage failures
	}
};

export const shouldAutoOpenDetailAfterFlight = ({
	shopId,
	source,
	surface,
	selectedShopId = null,
	openedShopIds = new Set(),
} = {}) => {
	const normalizedId = normalizeAutoOpenedDetailId(shopId);
	if (!normalizedId) return false;
	if (surface !== "preview") return false;
	if (normalizeAutoOpenedDetailId(selectedShopId) === normalizedId)
		return false;
	if (source === "sentient") return !openedShopIds.has(normalizedId);
	if (source !== "carousel" && source !== "startup") return false;
	return !openedShopIds.has(normalizedId);
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
	const { notify, notifyError } = useNotifications();
	// Snapshot the initial URL early so internal URL syncing (e.g. carousel scroll sync)
	// cannot accidentally trigger "deep link" behaviors.
	const initialUrlSnapshot =
		typeof window === "undefined"
			? { pathname: "", search: "" }
			: { pathname: window.location.pathname, search: window.location.search };
	const initialDeepLinkRequested =
		/\/(?:th|en)?\/(?:venue|v)\//.test(initialUrlSnapshot.pathname) ||
		new URLSearchParams(initialUrlSnapshot.search).has("venue") ||
		new URLSearchParams(initialUrlSnapshot.search).has("shop");

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
	const { userLocation, isMockLocation } = storeToRefs(locationStore);

	watch([userLocation, isMockLocation], ([loc, isMock]) => {
		if (loc) {
			userPrefsStore.saveFirstVisit(loc);
		}
		if (!isMock && Array.isArray(loc)) {
			void shopStore.refreshLocationScopedFeed?.();
		}
	});

	watch(visibleShops, (val) => {
		if (isAppDebugLoggingEnabled()) {
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
	const activeDrawerContext = ref(null);
	const activeDrawerBuilding = ref(null);
	const activeProvince = ref(null);
	const activeZone = ref(null);
	const isOwnerDashboardOpen = ref(false);
	const favorites = ref([]);
	const showSafetyPanel = ref(false); // ✅ Moved up
	const showFavoritesModal = ref(false); // ✅ Moved up
	const isRefreshing = ref(false);
	const mapSelectionIntent = ref(null);
	const legendHeight = computed(() => bottomUiHeight.value || 0);
	const activeFilters = computed(() => [...activeCategories.value]);
	const openedDetailShopIds = reactive(new Set());
	const markDetailOpened = (id) => {
		const normalized = normalizeAutoOpenedDetailId(id);
		if (!normalized) return;
		openedDetailShopIds.add(normalized);
	};
	let mapSelectionRequestSeq = 0;
	let hasBootstrappedStartupPreview = false;
	let handleCenteredShopCommit = null;
	let drawerStateResetTimerId = null;
	const DETAIL_AUTO_REOPEN_COOLDOWN_MS = 900;
	const STARTUP_LOCATION_PRIME_TIMEOUT_MS = 2500;
	let centeredDetailAutoOpenSuppressedUntil = 0;
	const normalizeDrawerBuildingId = (value) => {
		if (value === null || value === undefined) return null;
		const normalized = String(value).trim();
		return normalized || null;
	};
	const cancelDrawerStateReset = () => {
		if (drawerStateResetTimerId === null) return;
		clearTimeout(drawerStateResetTimerId);
		drawerStateResetTimerId = null;
	};
	const createMallDrawerContext = ({
		source = "map",
		buildingId = null,
		buildingName = null,
		initialShopId = null,
	} = {}) => {
		const normalizedBuildingId = normalizeDrawerBuildingId(buildingId);
		const normalizedInitialShopId = normalizeVenueId(initialShopId);
		return {
			contextId: [
				"mall",
				source || "map",
				normalizedBuildingId || "unresolved",
				normalizedInitialShopId || "none",
			].join(":"),
			mode: "mall",
			source: source || "map",
			buildingId: normalizedBuildingId,
			buildingName:
				typeof buildingName === "string" && buildingName.trim()
					? buildingName.trim()
					: null,
			representativeShopId: null,
			initialShopId: normalizedInitialShopId,
		};
	};
	const buildDrawerBuilding = (building, drawerContext) => {
		const source = building && typeof building === "object" ? building : {};
		const buildingId =
			normalizeDrawerBuildingId(source.id) ||
			normalizeDrawerBuildingId(source.key) ||
			normalizeDrawerBuildingId(drawerContext?.buildingId);
		const buildingName =
			(typeof source.name === "string" && source.name.trim()) ||
			(typeof source.building_name === "string" &&
				source.building_name.trim()) ||
			(typeof drawerContext?.buildingName === "string" &&
				drawerContext.buildingName.trim()) ||
			null;
		if (
			!buildingId &&
			!buildingName &&
			source.lat === undefined &&
			source.lng === undefined &&
			source.latitude === undefined &&
			source.longitude === undefined
		) {
			return null;
		}
		return {
			...source,
			id: source.id ?? buildingId,
			key: source.key ?? buildingId,
			name: source.name ?? buildingName,
			lat: source.lat ?? source.latitude ?? null,
			lng: source.lng ?? source.longitude ?? null,
		};
	};
	const setDrawerState = ({
		canonicalBuilding = null,
		drawerContext = null,
		drawerBuilding = null,
		open = false,
		floor,
	} = {}) => {
		cancelDrawerStateReset();
		activeBuilding.value = canonicalBuilding;
		activeDrawerContext.value = drawerContext;
		activeDrawerBuilding.value = drawerBuilding || canonicalBuilding;
		showMallDrawer.value = open;
		if (floor !== undefined) {
			activeFloor.value = floor;
		}
	};
	const clearDrawerState = ({ resetFloor = false } = {}) => {
		cancelDrawerStateReset();
		activeBuilding.value = null;
		activeDrawerContext.value = null;
		activeDrawerBuilding.value = null;
		if (resetFloor) {
			activeFloor.value = "GF";
		}
	};
	const closeMallDrawer = ({ resetFloor = true } = {}) => {
		showMallDrawer.value = false;
		cancelDrawerStateReset();
		drawerStateResetTimerId = setTimeout(() => {
			clearDrawerState({ resetFloor });
		}, 220);
	};
	const resolveCanonicalBuildingForDrawer = (
		buildingId,
		fallbackBuilding = null,
	) => {
		const normalizedBuildingId = normalizeDrawerBuildingId(buildingId);
		const canonicalBuilding = resolveCanonicalBuilding(
			buildingsData.value,
			normalizedBuildingId,
		);
		if (canonicalBuilding) return canonicalBuilding;
		if (fallbackBuilding && typeof fallbackBuilding === "object") {
			const fallbackId =
				normalizeDrawerBuildingId(fallbackBuilding.id) ||
				normalizeDrawerBuildingId(fallbackBuilding.key) ||
				normalizedBuildingId;
			return {
				...fallbackBuilding,
				id: fallbackBuilding.id ?? fallbackId,
				key: fallbackBuilding.key ?? fallbackId,
			};
		}
		return null;
	};
	const openMallDrawerForBuilding = ({
		building = null,
		source = "map",
		initialShopId = null,
		floor,
	} = {}) => {
		const buildingId =
			normalizeDrawerBuildingId(building?.id) ||
			normalizeDrawerBuildingId(building?.key);
		const canonicalBuilding = resolveCanonicalBuildingForDrawer(
			buildingId,
			building,
		);
		if (!canonicalBuilding) return;
		const drawerContext = createMallDrawerContext({
			source,
			buildingId: canonicalBuilding.id || canonicalBuilding.key || buildingId,
			buildingName: canonicalBuilding.name || building?.name,
			initialShopId,
		});
		setDrawerState({
			canonicalBuilding,
			drawerContext,
			drawerBuilding: buildDrawerBuilding(canonicalBuilding, drawerContext),
			open: true,
			floor,
		});
	};
	const suppressCenteredDetailAutoOpen = (
		durationMs = DETAIL_AUTO_REOPEN_COOLDOWN_MS,
	) => {
		const safeDuration = Math.max(0, Number(durationMs) || 0);
		centeredDetailAutoOpenSuppressedUntil = Date.now() + safeDuration;
	};
	const runAfterNextPaint = (task) => {
		if (typeof window === "undefined") {
			task?.();
			return;
		}
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				task?.();
			});
		});
	};
	const scheduleDetailIdleWork = (task, timeout = 1200) => {
		if (typeof window === "undefined") {
			task?.();
			return;
		}
		if (typeof window.requestIdleCallback === "function") {
			window.requestIdleCallback(
				() => {
					task?.();
				},
				{ timeout },
			);
			return;
		}
		window.setTimeout(() => {
			task?.();
		}, 180);
	};
	const awaitWithTimeout = async (task, timeoutMs) => {
		const safeTimeoutMs = Math.max(0, Number(timeoutMs) || 0);
		if (safeTimeoutMs <= 0) {
			return Promise.resolve(task);
		}
		let timeoutId = null;
		try {
			return await Promise.race([
				Promise.resolve(task),
				new Promise((resolve) => {
					timeoutId = setTimeout(() => resolve(null), safeTimeoutMs);
				}),
			]);
		} finally {
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
		}
	};
	const primeStartupLocation = async () => {
		const hasRealUserLocation =
			Array.isArray(locationStore.userLocation) &&
			!locationStore.isMockLocation;
		if (hasRealUserLocation) {
			if (!locationStore.isTracking) {
				void locationStore.startWatching();
			}
			return locationStore.userLocation;
		}
		if (typeof navigator === "undefined" || !navigator.geolocation) {
			locationStore.useDefaultLocation();
			return locationStore.userLocation;
		}
		try {
			await awaitWithTimeout(
				locationStore.getCurrentPosition(),
				STARTUP_LOCATION_PRIME_TIMEOUT_MS,
			);
		} catch {}
		if (!locationStore.userLocation) {
			locationStore.useDefaultLocation();
		}
		if (!locationStore.isTracking) {
			void locationStore.startWatching();
		}
		return locationStore.userLocation;
	};
	const publishMapSelectionIntent = ({
		shop = null,
		shopId = null,
		source = "carousel",
		surface = "preview",
		cameraMode,
		popupMode = "compact",
		routeMode = "none",
	} = {}) => {
		const nextIntent = buildMapSelectionIntent({
			requestId: ++mapSelectionRequestSeq,
			shop,
			shopId,
			source,
			surface,
			cameraMode,
			popupMode,
			routeMode,
		});
		if (!nextIntent) return null;
		mapSelectionIntent.value = nextIntent;
		return nextIntent;
	};

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

	// --- 5.5. Spatial Intent Predictor & Prefetch ---
	const intentPredictor = useIntentPredictor();
	const prefetchEngine = usePrefetchEngine();

	const scrollSync = useScrollSync({
		activeShopId,
		shops: computed(() => shopStore.visibleShops),
		mapRef,
		smoothFlyTo,
		selectFeedback,
		mobileCardScrollRef,
		onScrollDecelerate: intentPredictor.recordCarouselDeceleration,
		onCenteredShopCommit: (payload) => handleCenteredShopCommit?.(payload),
		enableInitialCenteredShopCommit: !initialDeepLinkRequested,
	});
	const { handleHorizontalScroll, scrollToCard, onScrollStart, onScrollEnd } =
		scrollSync;

	// --- 7. Local State & Glue Logic ---
	// --- REFACTORED: Computed Base for Logic ---
	const baseShops = computed(() => processedShops.value); // ✅ Normalized Data Source

	// Search Logic (Kept here as it spans multiple domains)
	const globalSearchQuery = ref("");
	const normalizeSearchText = (value) =>
		String(value || "")
			.normalize("NFKC")
			.toLowerCase()
			.replace(/[\u200B-\u200D\uFEFF]/g, "")
			.replace(/[^a-z0-9\u0E00-\u0E7F\s]/gi, " ")
			.replace(/\s+/g, " ")
			.trim();
	const emojiAliasMap = {
		"☕": "cafe coffee",
		"🍽️": "restaurant dining",
		"🍜": "food noodle",
		"🍺": "bar beer",
		"🍷": "wine cocktail",
		"💃": "club nightlife dance",
		"🎵": "live music",
		"🎨": "art gallery",
		"🛍️": "fashion shopping",
		"🏢": "mall shopping center",
		"🏨": "hotel accommodation",
		"🛏️": "hostel accommodation",
		"🕌": "temple",
	};
	const expandEmojiAliases = (value) => {
		let next = String(value || "");
		for (const [emoji, alias] of Object.entries(emojiAliasMap)) {
			if (next.includes(emoji)) {
				next = next.split(emoji).join(` ${alias} `);
			}
		}
		return next;
	};
	const tokenizeSearchText = (value) =>
		normalizeSearchText(value).split(" ").filter(Boolean);
	const editDistanceWithin = (a, b, maxDistance = 2) => {
		const left = String(a || "");
		const right = String(b || "");
		if (!left || !right) return Number.POSITIVE_INFINITY;
		if (Math.abs(left.length - right.length) > maxDistance) {
			return Number.POSITIVE_INFINITY;
		}

		const rows = left.length + 1;
		const cols = right.length + 1;
		const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
		for (let i = 0; i < rows; i += 1) dp[i][0] = i;
		for (let j = 0; j < cols; j += 1) dp[0][j] = j;

		for (let i = 1; i < rows; i += 1) {
			let rowMin = Number.POSITIVE_INFINITY;
			for (let j = 1; j < cols; j += 1) {
				const cost = left[i - 1] === right[j - 1] ? 0 : 1;
				dp[i][j] = Math.min(
					dp[i - 1][j] + 1,
					dp[i][j - 1] + 1,
					dp[i - 1][j - 1] + cost,
				);
				rowMin = Math.min(rowMin, dp[i][j]);
			}
			if (rowMin > maxDistance) return Number.POSITIVE_INFINITY;
		}
		return dp[rows - 1][cols - 1];
	};
	const tokenMatchesWord = (token, word) => {
		if (!token || !word) return false;
		if (word.startsWith(token) || word.includes(token)) return true;
		if (token.length < 4) return false;
		const maxDistance = token.length >= 7 ? 2 : 1;
		return editDistanceWithin(token, word, maxDistance) <= maxDistance;
	};
	const scoreSearchMatch = (shop, normalizedQuery, queryTokens) => {
		const name = normalizeSearchText(shop?.name || "");
		const category = normalizeSearchText(shop?.category || "");
		const description = normalizeSearchText(
			shop?.description || shop?.vibeTag || shop?.crowdInfo || "",
		);
		const locationMeta = normalizeSearchText(
			[
				shop?.zone || shop?.Zone,
				shop?.district || shop?.District,
				shop?.province || shop?.Province,
				shop?.building || shop?.Building,
				shop?.floor || shop?.Floor,
				shop?.slug,
			]
				.filter(Boolean)
				.join(" "),
		);
		const corpus = normalizeSearchText(
			[name, category, description, locationMeta].filter(Boolean).join(" "),
		);
		if (!corpus) return null;

		let score = 0;
		let matchedTokens = 0;
		let unmatchedTokens = 0;
		const corpusWords = corpus.split(" ").filter(Boolean);

		if (name.includes(normalizedQuery)) score += 220;
		else if (corpus.includes(normalizedQuery)) score += 120;

		for (const token of queryTokens) {
			if (!token) continue;
			let matched = false;

			if (name.includes(token)) {
				score += name.startsWith(token) ? 100 : 88;
				matched = true;
			} else if (category.includes(token)) {
				score += 70;
				matched = true;
			} else if (description.includes(token)) {
				score += 48;
				matched = true;
			} else if (locationMeta.includes(token)) {
				score += 52;
				matched = true;
			} else if (corpusWords.some((word) => tokenMatchesWord(token, word))) {
				score += 30;
				matched = true;
			}

			if (matched) matchedTokens += 1;
			else if (token.length > 1) unmatchedTokens += 1;
		}

		const mismatchThreshold = Math.ceil(queryTokens.length * 0.5);
		if (matchedTokens === 0 || unmatchedTokens > mismatchThreshold) return null;
		if (String(shop?.status || "").toUpperCase() === "LIVE") score += 12;
		if (shop?.is_verified || shop?.verifiedActive) score += 8;

		return {
			score,
			matchedTokens,
		};
	};

	const globalSearchResults = computed(() => {
		const expandedQuery = expandEmojiAliases(globalSearchQuery.value);
		const normalizedQuery = normalizeSearchText(expandedQuery);
		if (!normalizedQuery) return [];

		const queryTokens = tokenizeSearchText(normalizedQuery);
		if (!queryTokens.length) return [];

		let userLat = null;
		let userLng = null;
		if (
			Array.isArray(userLocation.value) &&
			Number.isFinite(Number(userLocation.value[0])) &&
			Number.isFinite(Number(userLocation.value[1]))
		) {
			userLat = Number(userLocation.value[0]);
			userLng = Number(userLocation.value[1]);
		}

		const scored = processedShops.value
			.map((shop) => {
				const match = scoreSearchMatch(shop, normalizedQuery, queryTokens);
				if (!match) return null;

				let distance = Number.POSITIVE_INFINITY;
				if (
					userLat !== null &&
					userLng !== null &&
					Number.isFinite(Number(shop?.lat)) &&
					Number.isFinite(Number(shop?.lng))
				) {
					distance = calculateDistance(
						userLat,
						userLng,
						Number(shop.lat),
						Number(shop.lng),
					);
				}
				const proximityBoost = Number.isFinite(distance)
					? Math.max(0, 24 - Math.min(distance, 24))
					: 0;

				return {
					...shop,
					distance,
					searchScore: match.score + proximityBoost,
					searchMatchedTokens: match.matchedTokens,
				};
			})
			.filter(Boolean);

		return scored
			.sort((a, b) => {
				if (b.searchScore !== a.searchScore) {
					return b.searchScore - a.searchScore;
				}
				if (a.distance !== b.distance) return a.distance - b.distance;
				return (a.name || "").localeCompare(b.name || "");
			})
			.slice(0, 30);
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
	const closeDetailSheet = ({
		syncRoute = true,
		replace = true,
		preserveActiveShop = true,
		autoOpenCooldownMs = DETAIL_AUTO_REOPEN_COOLDOWN_MS,
	} = {}) => {
		const preservedActiveId =
			normalizeVenueId(activeShopId.value) ||
			normalizeVenueId(selectedShop.value?.id);
		selectedShop.value = null;
		suppressCenteredDetailAutoOpen(autoOpenCooldownMs);
		const nextActiveId = preserveActiveShop ? preservedActiveId : null;
		activeShopId.value = nextActiveId;
		shopStore.setActiveShop(nextActiveId);
		if (nextActiveId) {
			publishMapSelectionIntent({
				shop: shopStore.getShopById(nextActiveId),
				shopId: nextActiveId,
				source: "carousel",
				surface: "preview",
				popupMode: "compact",
				routeMode: "none",
			});
		} else {
			mapSelectionIntent.value = null;
		}
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
			shouldSyncCarousel = true,
			syncDrawerContext = true,
			openMallDrawerOnBuilding = true,
			selectionSource = syncRoute ? "detail" : "carousel",
			selectionSurface = syncRoute ? "detail" : "preview",
			cameraMode,
			popupMode = "compact",
			shopOverride = null,
		} = {},
	) => {
		const normalizedId = normalizeVenueId(shopId);
		if (!normalizedId) return;

		activeShopId.value = normalizedId;
		shopStore.setActiveShop(normalizedId);
		if (selectionSurface !== "detail" && selectedShop.value) {
			closeDetailSheet({
				syncRoute: false,
				preserveActiveShop: true,
				autoOpenCooldownMs: DETAIL_AUTO_REOPEN_COOLDOWN_MS,
			});
		}
		if (syncRoute) {
			syncVenueUrl(normalizedId, { replace: syncRouteMode !== "push" });
		}

		if (autoImmersive) {
			uiLogic.toggleImmersive?.(); // If defined
		}

		const shop = shopOverride || shopStore.getShopById(normalizedId); // ✅ Use getShopById for accuracy
		if (shop) {
			// Sync Carousel
			if (shouldSyncCarousel && isMobileView.value) {
				scrollToCard(shopId);
			}

			if (syncDrawerContext) {
				const buildingId = resolveVenueBuildingId(shop);
				const buildingRaw = resolveCanonicalBuildingForDrawer(
					buildingId,
					buildingId ? buildingsData.value?.[buildingId] : null,
				);

				if (buildingRaw) {
					const drawerContext = createMallDrawerContext({
						source: selectionSource,
						buildingId: buildingRaw.id || buildingRaw.key || buildingId,
						buildingName: buildingRaw.name,
						initialShopId: normalizedId,
					});
					setDrawerState({
						canonicalBuilding: buildingRaw,
						drawerContext,
						drawerBuilding: buildDrawerBuilding(buildingRaw, drawerContext),
						open: openMallDrawerOnBuilding,
					});
				} else if (showMallDrawer.value) {
					closeMallDrawer({ resetFloor: false });
				}
			}
		}
		publishMapSelectionIntent({
			shop,
			shopId: normalizedId,
			source: selectionSource,
			surface: selectionSurface,
			cameraMode,
			popupMode,
			routeMode: syncRoute ? syncRouteMode : "none",
		});

		if (trackEvent) {
			trackAnalyticsEvent(trackEventType, { source: "ui" }, normalizedId);
		}
	};

	const handleMarkerClick = (shop) => {
		if (!shop) {
			activeShopId.value = null;
			mapSelectionIntent.value = null;
			return;
		}
		selectFeedback();
		microFeedback();
		applyShopSelection(shop.id, false, {
			syncRoute: false,
			trackEvent: true,
			trackEventType: "preview_marker",
			selectionSource: "marker",
			selectionSurface: "preview",
			popupMode: "compact",
			shopOverride: shop,
		});
	};

	const handleGiantPreviewShopChange = (shop) => {
		if (!shop) return;
		applyShopSelection(shop.id, false, {
			syncRoute: false,
			trackEvent: false,
			shouldSyncCarousel: false,
			syncDrawerContext: false,
			openMallDrawerOnBuilding: false,
			selectionSource: "giant-carousel",
			selectionSurface: "preview",
			popupMode: "none",
			shopOverride: shop,
		});
	};

	const handleGiantOpenDetail = (shop) => {
		if (!shop) return;
		closeMallDrawer({ resetFloor: false });
		nextTick(() => {
			handleOpenDetail(shop, {
				trackEvent: true,
				trackEventType: "open_detail",
				routeMode: "push",
				selectionSource: "giant-detail",
				syncDrawerContext: false,
				openMallDrawerOnBuilding: false,
			});
		});
	};

	// Sentient map auto-select now hands off to the settled preview flight.
	// The sentient controller already manages its own cooldown/re-entry rules.
	const handleSentientAutoSelect = (shop) => {
		if (!shop) return;
		applyShopSelection(shop.id, false, {
			syncRoute: false,
			trackEvent: false,
			selectionSource: "sentient",
			selectionSurface: "preview",
			popupMode: "compact",
			shopOverride: shop,
		});
	};

	const handleOpenDetail = (
		shop,
		{
			trackEvent = false,
			trackEventType = "open_detail",
			routeMode = "push",
			selectionSource = "detail",
			openShellMode = "defer",
			syncDrawerContext = true,
			openMallDrawerOnBuilding = true,
		} = {},
	) => {
		if (!shop) {
			closeDetailSheet({ syncRoute: false });
			return;
		}

		const normalizedShopId = normalizeVenueId(shop.id);
		
		// PERFORMANCE FIX: Prevent opening the detail modal if it's already open for this shop.
		// This avoids duplicate rendering and potential "hangs" when clicking multiple times.
		if (selectedShop.value && normalizeVenueId(selectedShop.value.id) === normalizedShopId) {
			return;
		}

		markDetailOpened(shop.id);

		const openDetailShell = () => {
			if (normalizeVenueId(selectedShop.value?.id) === normalizedShopId) return;
			selectedShop.value = shop;
		};

		runAfterNextPaint(() => {
			applyShopSelection(shop.id, false, {
				syncRoute: true,
				syncRouteMode: routeMode,
				trackEvent,
				trackEventType,
				syncDrawerContext,
				openMallDrawerOnBuilding,
				selectionSource,
				selectionSurface: "detail",
				cameraMode: "detail-focus",
				popupMode: "compact",
				shopOverride: shop,
			});
		});

		// Deep links should mount the sheet as soon as we have the venue so the sign
		// can clamp against the real modal surface on first open.
		if (openShellMode === "immediate" || typeof window === "undefined") {
			openDetailShell();
		} else if (typeof window !== "undefined") {
			window.setTimeout(openDetailShell, 0);
		}

		// Progressive enhancement: fetch full venue details lazily.
		// Keep the hydrated detail local to the modal so the whole feed/map does not recompute.
		try {
			scheduleDetailIdleWork(() => {
				void shopStore
					.fetchVenueDetail?.(shop.id, { syncCollection: false })
					.then((detail) => {
						if (!detail) return;
						if (!selectedShop.value) return;
						if (String(selectedShop.value.id) !== String(detail.id)) return;
						selectedShop.value = detail;
					})
					.catch(() => {});
			});
		} catch {
			// ignore
		}

		// Join realtime room after the first paint so input responsiveness wins.
		try {
			runAfterNextPaint(() => {
				socketService.joinRoom(shop.id);
			});
		} catch {
			// ignore
		}
	};

	handleCenteredShopCommit = ({ shop, shopId, reason }) => {
		const normalizedId = normalizeVenueId(shopId || shop?.id);
		if (!normalizedId) return;
		const resolvedShop = shop || shopStore.getShopById(normalizedId);
		if (!resolvedShop) return;
		if (
			selectedShop.value &&
			normalizeVenueId(selectedShop.value.id) === normalizedId
		) {
			return;
		}
		const selectionSource = getCenteredSelectionSource(reason);
		applyShopSelection(normalizedId, false, {
			syncRoute: false,
			trackEvent: false,
			shouldSyncCarousel: false,
			selectionSource,
			selectionSurface: "preview",
			popupMode: "compact",
			shopOverride: resolvedShop,
		});
	};

	const handleCardClick = (shop) => {
		if (!shop) return;
		handleOpenDetail(shop, {
			trackEvent: true,
			trackEventType: "open_detail",
			routeMode: IS_STRICT_MAP_E2E ? "replace" : "push",
			selectionSource: "detail",
		});
	};

	const handleSelectionFlightComplete = (payload = {}) => {
		const normalizedId = normalizeVenueId(payload?.shopId ?? payload?.shop?.id);
		
		// If the source is carousel or map and we finished the flight, 
		// we might want to auto-open the detail if it's not already open.
		// The original logic was likely more aggressive.
		
		if (
			!shouldAutoOpenDetailAfterFlight({
				shopId: normalizedId,
				source: payload?.source,
				surface: payload?.surface,
				selectedShopId: selectedShop.value?.id,
				openedShopIds: openedDetailShopIds,
			})
		) {
			// STRICT FIX: The user wants the detail modal to open ONLY ONCE per shop.
			// We should respect openedDetailShopIds even for manual selections (carousel/marker)
			// to prevent reopening if the user just closed it.
			return;
		}
		
		if (Date.now() < centeredDetailAutoOpenSuppressedUntil) return;
		const resolvedShop = payload?.shop || shopStore.getShopById(normalizedId);
		if (!resolvedShop) return;
		handleOpenDetail(resolvedShop, {
			trackEvent: false,
			routeMode: "replace",
			selectionSource: "auto-detect",
		});
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
				mapRef.value.focusLocation([shop.lng, shop.lat], 16);
			}
		}
	};

	// --- 9. Watchers & Lifecycle ---

	// Metadata & Title
	const updateMetadata = () => {
		const baseTitle = DEFAULT_OG_TITLE;
		// Note: selectedShop ref might not always be set if just activeId changed
		// Better to find from store
		// Better to find from store
		const currentShop = shopStore.getShopById(activeShopId.value);
		const activeCat = activeCategories.value[0];

		if (currentShop) {
			document.title = `${currentShop.name} - VibeCity.live`;
		} else if (activeCat) {
			document.title = `${activeCat} in Thailand - VibeCity.live`;
		} else {
			document.title = baseTitle;
		}
	};

	watch(() => [activeShopId.value, activeCategories.value], updateMetadata, {
		immediate: true,
	});

	watch(
		() => [
			normalizeVenueId(activeShopId.value),
			normalizeVenueId(mapSelectionIntent.value?.shopId),
			normalizeVenueId(selectedShop.value?.id),
		],
		([activeId, intentShopId, selectedId]) => {
			if (!activeId || selectedId) return;
			if (intentShopId === activeId) return;
			if (!shopStore.getShopById(activeId)) return;
			runAfterNextPaint(() => {
				const latestActiveId = normalizeVenueId(activeShopId.value);
				const latestIntentId = normalizeVenueId(
					mapSelectionIntent.value?.shopId,
				);
				const latestSelectedId = normalizeVenueId(selectedShop.value?.id);
				if (!latestActiveId || latestSelectedId) return;
				if (latestActiveId !== activeId) return;
				if (latestIntentId === latestActiveId) return;
				handleCenteredShopCommit({
					shopId: latestActiveId,
					reason: "startup",
				});
			});
		},
		{ immediate: true },
	);

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

	// Map Breathe Settle Animation
	const triggerMapBreathe = () => {
		if (!mapRef.value || !mapRef.value.isZooming || !mapRef.value.isMoving)
			return;
		// Safe check: no active map drag, no cinematic fly
		if (mapRef.value.isZooming() || mapRef.value.isMoving()) return;

		const prefersReducedMotion =
			typeof window !== "undefined"
				? window.matchMedia("(prefers-reduced-motion: reduce)").matches
				: false;
		if (prefersReducedMotion) return;

		const currentZoom = mapRef.value.getZoom();

		mapRef.value.easeTo({
			zoom: currentZoom - 0.1,
			duration: 400,
			easing: (t) => t * (2 - t),
		});
		setTimeout(() => {
			if (mapRef.value && !mapRef.value.isMoving()) {
				mapRef.value.easeTo({
					zoom: currentZoom,
					duration: 400,
					easing: (t) => t * (2 - t),
				});
			}
		}, 400);
	};

	watch(
		[() => uiLogic.showProfileDrawer?.value, showMallDrawer],
		([newProf, newMall], [oldProf, oldMall]) => {
			if ((oldProf && !newProf) || (oldMall && !newMall)) {
				// Wait slightly for drawer to clear viewport visually
				setTimeout(() => triggerMapBreathe(), 100);
			}
		},
	);

	// Gestures (Must be called in setup, not inside onMounted)
	useEdgeSwipe(() => {
		showSidebar.value = true;
	});

	// --- OnMounted ---
	const activeUserCount = ref(0);

	// Local Interval for time update
	let timeInterval = null;
	let popStateHandler = null;
	let searchBlurTimer = null;
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
		const runSeq = ++initRunSeq;

		isDataLoading.value = true;
		try {
			initPerformanceMonitoring();

			// One-time toast if hardware low-power mode was auto-detected this session
			if (
				isLowPowerMode.value &&
				!sessionStorage.getItem("vibe_lpm_notified")
			) {
				sessionStorage.setItem("vibe_lpm_notified", "1");
				notify({
					title: "⚡ Performance Mode",
					message:
						"Visual effects reduced for this device. Re-enable in Settings anytime.",
					type: "info",
					duration: 7000,
				});
			}

			setLocaleValue(userStore.preferences.language || "en");
			favorites.value = loadFavoritesWithTTL();

			// Load saved coins/stats if needed
			// (Assumed handled by shopStore persistence, but original had manual load)

			// Prime user position and venue data together so startup centers on the user
			// instead of the Thailand-wide fallback shell whenever geolocation is available.
			await Promise.allSettled([
				primeStartupLocation(),
				shopStore.fetchShops(),
			]);
			await shopStore.refreshLocationScopedFeed?.();

			// Mark primary UI as ready (events/stats can load in the background).
			isDataLoading.value = false;

			if (!initialDeepLinkRequested && !activeShopId.value) {
				const startupShop =
					shopStore.visibleShops?.[0] || shopStore.processedShops?.[0] || null;
				if (startupShop) {
					runAfterNextPaint(() => {
						if (activeShopId.value || selectedShop.value) return;
						handleCenteredShopCommit({
							shop: startupShop,
							shopId: startupShop.id,
							reason: "startup",
						});
					});
				}
			}

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
				const openInitialDeepLink = async () => {
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
						openShellMode: "immediate",
					});
				};
				runAfterNextPaint(() => {
					if (runSeq !== initRunSeq) return;
					void openInitialDeepLink();
				});
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
		intentPredictor.observeCards();
		prefetchEngine.startEngine();

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
		prefetchEngine.stopEngine();
		cancelDrawerStateReset();
		if (timeInterval) {
			clearInterval(timeInterval);
			timeInterval = null;
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
	const isDefaultNearbyView = computed(
		() =>
			activeCategories.value.length === 0 &&
			activeStatus.value === "ALL" &&
			!String(shopStore.searchQuery || "").trim(),
	);
	const surfaceShops = computed(() =>
		isDefaultNearbyView.value ? visibleShops.value : filteredShops.value,
	);
	const dedupeVenueList = (items = []) => {
		const next = [];
		const seen = new Set();
		for (const shop of items) {
			if (!shop || typeof shop !== "object") continue;
			const key =
				normalizeVenueId(shop.id) ||
				String(shop.slug || shop.name || "").trim() ||
				null;
			if (!key || seen.has(key)) continue;
			seen.add(key);
			next.push(shop);
		}
		return next;
	};
	const mapShops = computed(() => {
		const activeShop = shopStore.getShopById(activeShopId.value);
		return dedupeVenueList([
			selectedShop.value,
			activeShop,
			...surfaceShops.value,
		]);
	});
	watch(
		() => surfaceShops.value?.[0] || null,
		(startupShop) => {
			if (hasBootstrappedStartupPreview || initialDeepLinkRequested) return;
			if (!startupShop || activeShopId.value || selectedShop.value) return;
			hasBootstrappedStartupPreview = true;
			runAfterNextPaint(() => {
				if (activeShopId.value || selectedShop.value) return;
				handleCenteredShopCommit({
					shop: startupShop,
					shopId: startupShop.id,
					reason: "startup",
				});
			});
		},
		{ immediate: true },
	);
	const isInitialLoad = computed(
		() => isDataLoading.value && surfaceShops.value.length === 0,
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
		const current = selectedShop.value;
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
		const buildingId = resolveVenueBuildingId(shop);
		if (!buildingId) return;
		const canonicalBuilding = resolveCanonicalBuildingForDrawer(
			buildingId,
			buildingsData.value?.[buildingId],
		);
		if (!canonicalBuilding) return;
		openMallDrawerForBuilding({
			building: canonicalBuilding,
			source: "indoor",
			initialShopId: shop?.id,
			floor: shop?.Floor ?? shop?.floor ?? "GF",
		});
	};

	const handleCloseFloorSelector = () => {
		closeMallDrawer({ resetFloor: true });
	};

	const handleBuildingOpen = (building) => {
		if (!building) return;
		const drawerContext = normalizeGiantPinPayload(
			building,
			processedShops.value,
			buildingsData.value,
		);
		if (drawerContext.mode === "giant-pin") {
			const canonicalBuilding = resolveCanonicalBuilding(
				buildingsData.value,
				drawerContext.buildingId,
			);
			setDrawerState({
				canonicalBuilding,
				drawerContext,
				drawerBuilding: buildDrawerBuilding(
					canonicalBuilding || building,
					drawerContext,
				),
				open: true,
			});
			return;
		}
		const activeShopBuildingId = resolveVenueBuildingId(
			shopStore.getShopById(activeShopId.value),
		);
		openMallDrawerForBuilding({
			building:
				resolveCanonicalBuildingForDrawer(drawerContext.buildingId, building) ||
				building,
			source: drawerContext.source || "map",
			initialShopId:
				activeShopBuildingId &&
				activeShopBuildingId === drawerContext.buildingId
					? activeShopId.value
					: null,
		});
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

	const getRealUserLocationSnapshot = () => {
		if (
			!Array.isArray(locationStore.userLocation) ||
			locationStore.userLocation.length < 2 ||
			locationStore.isMockLocation
		) {
			return null;
		}
		const lat = Number(locationStore.userLocation[0]);
		const lng = Number(locationStore.userLocation[1]);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			return null;
		}
		return [lat, lng];
	};

	const handleLocateMeWrapper = async () => {
		const initialLocation = getRealUserLocationSnapshot();
		const shouldPrimeFreshLocation =
			!initialLocation ||
			Boolean(locationStore.isStale) ||
			!Number.isFinite(Number(locationStore.accuracy)) ||
			Number(locationStore.accuracy) > 80;

		if (initialLocation) {
			handleLocateMe(selectFeedback, { coords: initialLocation });
		} else {
			selectFeedback();
		}

		if (!shouldPrimeFreshLocation) {
			if (!locationStore.isTracking) {
				requestGeolocation();
			}
			return;
		}

		try {
			await awaitWithTimeout(
				locationStore.getCurrentPosition(),
				initialLocation ? 1800 : STARTUP_LOCATION_PRIME_TIMEOUT_MS,
			);
		} catch {}

		if (!locationStore.isTracking) {
			requestGeolocation();
		}

		const refreshedLocation = getRealUserLocationSnapshot();
		if (!refreshedLocation) {
			return;
		}

		if (!initialLocation) {
			handleLocateMe(null, { coords: refreshedLocation });
			return;
		}

		const movedKm = calculateDistance(
			initialLocation[0],
			initialLocation[1],
			refreshedLocation[0],
			refreshedLocation[1],
		);
		if (movedKm >= 0.015) {
			handleLocateMe(null, {
				coords: refreshedLocation,
				refine: true,
			});
		}
	};
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
		shops: surfaceShops,
		surfaceShops,
		mapShops,
		filteredShops,
		suggestedShops,
		currentTime,
		activeShopId,
		activeCategories,
		activeStatus,
		activeFilters,
		activeBuilding,
		activeDrawerContext,
		activeProvince,
		activeZone,
		favorites,
		totalCoins,
		userLevel,
		nextLevelXP,
		levelProgress,
		userLocation,
		isMockLocation,
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
		handleGiantPreviewShopChange,
		handleGiantOpenDetail,
		handleCardClick,
		handleCardHover,
		handleOpenDetail,
		handleSelectionFlightComplete,
		handleSentientAutoSelect,
		mapSelectionIntent,
		handlePanelScroll,
		handleSwipe,
		handleEnterIndoor,
		handleCloseFloorSelector,
		handleBuildingOpen,
		closeMallDrawer,
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
		nearbyPins: mapShops,
		loadMoreVibes: () => {}, // Infinite scroll placeholder
		retryLoad: () => globalThis.location.reload(),

		// Template Compat
		activeMall: activeDrawerBuilding,
		mallShops: computed(() => {
			const targetBuildingId =
				normalizeDrawerBuildingId(activeDrawerContext.value?.buildingId) ||
				normalizeDrawerBuildingId(activeDrawerBuilding.value?.id) ||
				normalizeDrawerBuildingId(activeDrawerBuilding.value?.key);
			if (!targetBuildingId) return [];
			return processedShops.value.filter(
				(shop) => resolveVenueBuildingId(shop) === targetBuildingId,
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
