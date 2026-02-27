// --- C:\vibecity.live\src\components\map\MapboxContainer.vue ---

<script setup>
import mapboxgl from "mapbox-gl";
import { DEFAULT_CITY } from "@/config/cityConfig";
import "mapbox-gl/dist/mapbox-gl.css";
import {
	computed,
	nextTick,
	onMounted,
	onUnmounted,
	ref,
	shallowRef,
	watch,
} from "vue";
import { useI18n } from "vue-i18n";
import "../../assets/map-atmosphere.css";
import { useMapAtmosphere } from "../../composables/map/useMapAtmosphere";
import { useMapCore } from "../../composables/map/useMapCore";
import { useMapHeatmap } from "../../composables/map/useMapHeatmap";
import { useMapInteractions } from "../../composables/map/useMapInteractions";
import { useMapLayers } from "../../composables/map/useMapLayers";
import { useMapMarkers } from "../../composables/map/useMapMarkers";
import { useMapPopups } from "../../composables/map/useMapPopups";
import { useMapRealtime } from "../../composables/map/useMapRealtime";
import { useMapRenderScheduler } from "../../composables/map/useMapRenderScheduler";
import { useAudioSystem } from "../../composables/useAudioSystem";
import { useHaptics } from "../../composables/useHaptics";
import { useWeather } from "../../composables/useWeather";
import { apiFetch } from "../../services/apiClient";
import { useFeatureFlagStore } from "../../store/featureFlagStore";
import { useShopStore } from "../../store/shopStore";
import { useUserPreferencesStore } from "../../store/userPreferencesStore";
import "../../styles/map-atmosphere.css";
import { openExternal } from "../../utils/browserUtils";
import { createPopupHTML } from "../../utils/mapRenderer";
import { calculateDistance } from "../../utils/shopUtils";
import LiveActivityChips from "./LiveActivityChips.vue";
import MapLoadingSkeleton from "./MapLoadingSkeleton.vue";

const PRIMARY_STYLE_URL = "mapbox://styles/phirrr/cmlktq68u002601se295iazmm";
const DARK_STYLE = PRIMARY_STYLE_URL;
const LIGHT_STYLE = PRIMARY_STYLE_URL;
const STRICT_E2E_STYLE = PRIMARY_STYLE_URL;
const PIN_SOURCE_ID = "pins_source";
const PIN_LAYER_ID = "unclustered-pins";
const PIN_HITBOX_LAYER_ID = "unclustered-pins-hitbox";
const CLUSTER_LAYER_ID = "clusters";
const CLUSTER_COUNT_LAYER_ID = "cluster-count";
const DISTANCE_LINE_SOURCE_ID = "distance-line";
const IS_E2E = import.meta.env.VITE_E2E === "true";
const IS_STRICT_MAP_E2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
const SHOULD_EXPOSE_MAP_DEBUG =
	import.meta.env.DEV || IS_E2E || IS_STRICT_MAP_E2E;
const TRAFFIC_RADIUS_KM = 1;
const TRAFFIC_REFRESH_INTERVAL_MS = 30000;
const TRAFFIC_RECOMPUTE_DISTANCE_KM = 0.12;
const TRAFFIC_CENTER_FALLBACK_DISTANCE_KM = 35;
const TRAFFIC_NEON_SOURCE_ID = "neon-roads";

const sanitizeEnvToken = (value) =>
	typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";

const { t, te, locale } = useI18n();
const tt = (key, fallback) => (te(key) ? t(key) : fallback);

const shopStore = useShopStore();
const prefs = useUserPreferencesStore();
const featureFlagStore = useFeatureFlagStore();
const enableMapRenderSchedulerV2 = computed(() =>
	featureFlagStore.isEnabled("enable_map_render_scheduler_v2"),
);
const enableMapEffectsPipelineV2 = computed(() =>
	featureFlagStore.isEnabled("enable_map_effects_pipeline_v2"),
);
const enablePerfGuardrailsV2 = computed(() =>
	featureFlagStore.isEnabled("enable_perf_guardrails_v2"),
);
const styleUrlForTheme = (isDarkMode) => {
	if (IS_STRICT_MAP_E2E) return STRICT_E2E_STYLE;
	return isDarkMode ? DARK_STYLE : LIGHT_STYLE;
};

import { useVibeEffects } from "../../composables/useVibeEffects";
import { socketService } from "../../services/socketService";

const { activeVibeEffects, triggerVibeEffect } = useVibeEffects();
const { impactFeedback } = useHaptics();
const handleMotionChange = (e) => {
	prefersReducedMotion.value = e.matches;
};
const handleVisibilityChange = () => {
	isDocumentHidden.value =
		typeof document !== "undefined" ? document.hidden : false;
};
const handleNetworkChange = () => {
	isOffline.value =
		typeof navigator !== "undefined" ? !navigator.onLine : false;
};

const isPlainObject = (value) =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => Number.isFinite(Number(value));

const handleSocketMessage = (data) => {
	if (!data || typeof data !== "object") return;
	// 1. Vibe Effects
	if (
		data.type === "vibe" &&
		isFiniteNumber(data.lat) &&
		isFiniteNumber(data.lng)
	) {
		triggerVibeEffect(
			{ id: data.shopId, lat: Number(data.lat), lng: Number(data.lng) },
			data.content,
		);
	}

	// 2. Heatmap Update
	if (data.type === "heatmap" && map.value && isPlainObject(data.data)) {
		updateHeatmapData(data.data);
	}

	// 3. Realtime hotspot snapshot
	if (data.type === "hotspot_update" && isPlainObject(data.data)) {
		consumeHotspotUpdate(data.data);
	}

	// 4. Burst map effects from backend queue
	if (data.type === "map_effect") {
		// Cars-only mode: disable atmospheric tap ripple effects.
		return;
	}
};

onMounted(() => {
	socketService.addListener(handleSocketMessage);
	if (!IS_E2E && !IS_STRICT_MAP_E2E) {
		void featureFlagStore.refreshFlags().catch(() => {});
	}
});

const getFirstExistingLayerId = (candidateIds = []) => {
	if (!map.value) return null;
	for (const id of candidateIds) {
		if (id && map.value.getLayer(id)) return id;
	}
	return null;
};

// Add Heatmap Layer
// Heatmap layer handled by composable

const props = defineProps({
	shops: Array,
	userLocation: Array,
	highlightedShopId: [Number, String],
	isDarkMode: { type: Boolean, default: true },
	activeZone: { type: String, default: null },
	uiTopOffset: { type: Number, default: 0 },
	uiBottomOffset: { type: Number, default: 0 },
	activeProvince: { type: String, default: null },
	activeBuilding: { type: Object, default: null },
	buildings: { type: Array, default: () => [] },
	isSidebarOpen: { type: Boolean, default: false },
	legendHeight: { type: Number, default: 0 },
	selectedShopCoords: { type: Array, default: null },
	isLowPowerMode: { type: Boolean, default: false },
	priorityShopIds: { type: Array, default: () => [] },
	isImmersive: { type: Boolean, default: false },
	isGiantPinView: { type: Boolean, default: false },
});

const prefersReducedMotion = ref(false);
let motionMediaQuery = null;
const isPerfRestricted = computed(
	() =>
		props.isLowPowerMode || prefs.isReducedMotion || prefersReducedMotion.value,
);
const mapEffectsEnabled = computed(
	() => enableMapEffectsPipelineV2.value && !IS_E2E && !IS_STRICT_MAP_E2E,
);
const allowAmbientFx = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isAmbientFxEnabled &&
		!isPerfRestricted.value,
);
const allowNeonPulse = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isNeonPulseEnabled &&
		!isPerfRestricted.value,
);
const allowHeatmap = computed(
	() => mapEffectsEnabled.value && prefs.isHeatmapEnabled,
);
const allow3dBuildings = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.is3dBuildingsEnabled &&
		!isPerfRestricted.value,
);
const allowMapFog = computed(
	() =>
		mapEffectsEnabled.value && prefs.isMapFogEnabled && !isPerfRestricted.value,
);
const allowViewportGlow = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isViewportGlowEnabled &&
		!isPerfRestricted.value,
);
const viewportGlowOpacity = ref(0);
const allowWeatherFx = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isWeatherFxEnabled &&
		!isPerfRestricted.value &&
		!isOffline.value,
);
const soundEnabled = computed(() => Boolean(prefs.isSoundEnabled));
const effectiveMotionBudget = computed(() => {
	if (isPerfRestricted.value) return "micro";
	return prefs.motionBudget || "micro";
});
const shouldRunAtmosphere = computed(
	() =>
		mapEffectsEnabled.value && (allowAmbientFx.value || allowNeonPulse.value),
);
const isDocumentHidden = ref(
	typeof document !== "undefined" ? document.hidden : false,
);
const isOffline = ref(
	typeof navigator !== "undefined" ? !navigator.onLine : false,
);
let webVitalsModulePromise = null;
const syncWebVitalsMapContext = () => {
	webVitalsModulePromise ??= import("../../services/webVitalsService");
	void webVitalsModulePromise
		.then(({ webVitalsService }) =>
			webVitalsService.setContext({
				mapMode: isPerfRestricted.value ? "low-power" : "full",
				frameBudgetMissCount: enablePerfGuardrailsV2.value
					? frameBudgetMissCount.value
					: 0,
				longTaskCount: enablePerfGuardrailsV2.value ? longTaskCount.value : 0,
			}),
		)
		.catch(() => {});
};

const emit = defineEmits([
	"select-shop",
	"open-detail",
	"open-building",
	"exit-indoor",
	"open-ride-modal",
	"map-ready-change",
]);

const mapContainer = ref(null);
const { map, isMapReady, initMap, setMapStyle } = useMapCore(mapContainer);
const { scheduleSourceUpdate, frameBudgetMissCount, longTaskCount } =
	useMapRenderScheduler(map, {
		trackLongTasks: true,
	});
const applySourceData = (sourceId, data) => {
	if (!map.value || !sourceId || !data) return;
	if (enableMapRenderSchedulerV2.value) {
		scheduleSourceUpdate(sourceId, data);
		return;
	}
	const source = map.value.getSource(sourceId);
	source?.setData?.(data);
};
const mapReadyFallbackArmed = ref(false);
const currentStyleUrl = ref(null);
let styleApplySeq = 0;
const showMapRecoveryHint = ref(false);
const mapLoadTimeoutReached = ref(false);
let mapRecoveryTimeoutId = null;
let coinLayerRetryTimer = null;
let coinLayerRetryAttempt = 0;
let resizeRaf = null;
let lastResizeAt = 0;
const RESIZE_DEBOUNCE_MS = 120;

const initMapOnce = (styleOverride = null) => {
	if (mapInitRequested.value) return;
	if (!mapContainer.value) return;

	mapInitRequested.value = true;

	if (IS_E2E && !IS_STRICT_MAP_E2E) {
		isMapReady.value = true;
		return;
	}

	webGLSupported.value = checkWebGLSupport();
	if (!webGLSupported.value) return;

	if (!ensureMapboxLoaded()) return;

	// Defer telemetry disabling until map actually initializes (not at module-eval)
	if (typeof mapboxgl.setTelemetryEnabled === "function") {
		mapboxgl.setTelemetryEnabled(false);
	}

	const initialStyleUrl =
		styleOverride ?? styleUrlForTheme(Boolean(props.isDarkMode));
	currentStyleUrl.value = initialStyleUrl;
	mapTeardownDone = false;
	initMap(center.value, zoom.value, initialStyleUrl);
	armStrictStyleGate();
};

const maplessMode = ref(false); // User chose to continue without map
let mapTeardownDone = false;

const teardownMap = () => {
	if (mapTeardownDone) return;
	mapTeardownDone = true;
	progressiveEffectsSeq += 1;
	clearProgressiveEffectsTimer();

	stopCarAnimation();
	stopCoinAnimation();
	stopAtmosphereLoop();
	removeFirefliesLayer();
	stopSmartPulseLoop();
	stopRouteTrailAnimation();
	tapRipplesData.value = { type: "FeatureCollection", features: [] };
	removeSoundGestureListener();
	if (!IS_E2E) {
		audio.stop();
	}
	hideBuildingInfoPopup();
	closeActivePopup();
	clearVibeEffectMarkers();
	if (routeAbortController) {
		routeAbortController.abort();
		routeAbortController = null;
	}

	socketService.removeListener(handleSocketMessage);

	markersMap.value.forEach((entry) => {
		const marker = entry?.marker ?? entry;
		if (marker?.remove) marker.remove();
	});
	eventMarkersMap.value.forEach((m) => {
		if (m?.remove) m.remove();
	});
	coinMarkersMap.value.forEach((m) => {
		if (m?.remove) m.remove();
	});

	if (map.value) {
		if (SHOULD_EXPOSE_MAP_DEBUG && typeof window !== "undefined") {
			window.__vibecityMapDebug = null;
		}
		map.value.off("moveend", scheduleMapRefresh);
		map.value.off("zoomend", scheduleMapRefresh);
		map.value.off("move", handleMapMoveForEnhancements);
		map.value.off("zoom", handleMapMoveForEnhancements);
		map.value.off("moveend", handleMapMoveEndForWeather);
		map.value.off("style.load", handleMapStyleLoad);
		map.value.off("click", PIN_LAYER_ID, handlePointClick);
		map.value.off("mouseenter", PIN_LAYER_ID, setPointer);
		map.value.off("mouseleave", PIN_LAYER_ID, resetPointer);
		map.value.off("click", PIN_HITBOX_LAYER_ID, handlePointClick);
		map.value.off("mouseenter", PIN_HITBOX_LAYER_ID, setPointer);
		map.value.off("mouseleave", PIN_HITBOX_LAYER_ID, resetPointer);
		map.value.off("click", CLUSTER_LAYER_ID, handleClusterClick);
		map.value.off("mouseenter", CLUSTER_LAYER_ID, setPointer);
		map.value.off("mouseleave", CLUSTER_LAYER_ID, resetPointer);
		map.value.remove();
		map.value = null;
	}

	isMapReady.value = false;
};

const armMapRecoveryTimeout = () => {
	if (mapRecoveryTimeoutId) {
		clearTimeout(mapRecoveryTimeoutId);
		mapRecoveryTimeoutId = null;
	}
	if (IS_E2E) return;
	if (maplessMode.value) return;
	if (!mapInitRequested.value || isMapReady.value) return;
	mapRecoveryTimeoutId = window.setTimeout(() => {
		if (!isMapReady.value && mapInitRequested.value) {
			mapLoadTimeoutReached.value = true;
			showMapRecoveryHint.value = true;
		}
	}, 9000);
};

const handleMapRecovery = () => {
	showMapRecoveryHint.value = false;
	mapLoadTimeoutReached.value = false;
	if (map.value) {
		queueMapResize(true);
		scheduleMapRefresh({ force: true });
		return;
	}
	mapInitRequested.value = false;
	initMapOnce(currentStyleUrl.value);
};

const continueWithoutMap = () => {
	maplessMode.value = true;
	showMapRecoveryHint.value = false;
	mapLoadTimeoutReached.value = false;
	teardownMap();
};

const reloadPage = () => {
	if (typeof window === "undefined") return;
	window.location.reload();
};

const armStrictStyleGate = () => {
	if (!IS_STRICT_MAP_E2E) return;
	mapReadyFallbackArmed.value = true;
	const pollStyle = () => {
		if (!mapReadyFallbackArmed.value) return;
		if (map.value?.isStyleLoaded?.()) {
			mapReadyFallbackArmed.value = false;
			return;
		}
		requestAnimationFrame(pollStyle);
	};
	requestAnimationFrame(pollStyle);
};

onMounted(() => {
	if (typeof window === "undefined" || !window.matchMedia) return;
	motionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	prefersReducedMotion.value = motionMediaQuery.matches;
	motionMediaQuery.addEventListener?.("change", handleMotionChange);
});

onMounted(() => {
	if (typeof document === "undefined") return;
	handleVisibilityChange();
	document.addEventListener("visibilitychange", handleVisibilityChange, {
		passive: true,
	});
});

onMounted(() => {
	if (typeof window === "undefined") return;
	handleNetworkChange();
	window.addEventListener("online", handleNetworkChange);
	window.addEventListener("offline", handleNetworkChange);
});

const {
	addNeonRoads,
	addCarAnimation,
	upsertTrafficRoads,
	stopCarAnimation,
	ensureCoinAnimation,
	upsertCoinLayer,
	removeCoinLayer,
	stopCoinAnimation,
} = useMapLayers(map, {
	effectsMode: () => "full",
	scheduler: (sourceId, data) => applySourceData(sourceId, data),
	coinMinZoom: 0,
});

const {
	markersMap,
	coinMarkersMap,
	eventMarkersMap,
	updateMarkers: updateMarkersCore,
	updateEventMarkers: updateEventMarkersCore,
} = useMapMarkers(map);

import { getMapPins } from "../../services/shopService";

const zoom = ref(16.5);
const center = ref([DEFAULT_CITY.lng, DEFAULT_CITY.lat]);
const pitch = ref(60);
const bearing = ref(-17.6);
const mapLoaded = ref(false);
const activePopup = shallowRef(null);
const mapInitRequested = ref(false);
const nowTick = ref(Date.now());
let nowTickInterval = null;
let progressiveEffectsSeq = 0;
let progressiveEffectsTimer = null;
let routeAbortController = null;
const currentMapZoom = ref(zoom.value);
const shopsByIdRef = ref(new Map());
const allowedIdsRef = ref(null);
const vibeMarkersMap = new Map();
const clearVibeEffectMarkers = () => {
	for (const marker of vibeMarkersMap.values()) {
		marker?.remove?.();
	}
	vibeMarkersMap.clear();
};

const { updateHeatmapData, addHeatmapLayer, removeHeatmapLayer } =
	useMapHeatmap(map, allowHeatmap, shopsByIdRef);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getWeatherCenter = () => {
	if (map.value) {
		const mapCenter = map.value.getCenter();
		return { lng: mapCenter.lng, lat: mapCenter.lat };
	}
	if (Array.isArray(center.value) && center.value.length >= 2) {
		return { lng: Number(center.value[0]), lat: Number(center.value[1]) };
	}
	return null;
};
const {
	weatherCondition,
	isNight: isWeatherNight,
	refresh: refreshWeather,
} = useWeather({
	getMapCenter: getWeatherCenter,
});

// Audio Sync Watcher (Restored)
watch(weatherCondition, (newVal) => {
	if (soundEnabled.value && !IS_E2E) {
		audio.setWeather(newVal);
	}
});

// watch([weatherCondition, isMapReady], updateWeatherVisuals); // Moved to composable
// Watch for sound pref changes to re-sync
watch(soundEnabled, (enabled) => {
	if (enabled && !IS_E2E) {
		audio.setWeather(weatherCondition.value);
		syncSoundZoneFromSelection();
	} else {
		audio.stop();
	}
});

// Fog logic moved to composable

const audio = useAudioSystem();
let hasSoundGestureListener = false;
let lastAudioVolumeAt = 0;
const attachSoundGestureListener = () => {
	if (IS_E2E || hasSoundGestureListener || !mapContainer.value) return;
	mapContainer.value.addEventListener("pointerdown", handleSoundGesture, {
		passive: true,
	});
	mapContainer.value.addEventListener("touchstart", handleSoundGesture, {
		passive: true,
	});
	hasSoundGestureListener = true;
};
const removeSoundGestureListener = () => {
	if (!hasSoundGestureListener || !mapContainer.value) return;
	mapContainer.value.removeEventListener("pointerdown", handleSoundGesture);
	mapContainer.value.removeEventListener("touchstart", handleSoundGesture);
	hasSoundGestureListener = false;
};
const handleSoundGesture = () => {
	if (IS_E2E || !soundEnabled.value) return;
	audio.ensureStarted();
	removeSoundGestureListener();
};
const updateSoundVolumeFromZoom = (force = false) => {
	if (IS_E2E || !soundEnabled.value || !map.value) return;
	const now = performance.now();
	if (!force && now - lastAudioVolumeAt < 120) return;
	lastAudioVolumeAt = now;
	audio.setVolume(clamp(map.value.getZoom() / 16, 0.2, 1.0));
};
const mapCategoryToZone = (category) => {
	const raw = String(category || "")
		.trim()
		.toLowerCase();
	if (
		raw.includes("nightlife") ||
		raw.includes("bar") ||
		raw.includes("club")
	) {
		return "nightlife";
	}
	if (raw.includes("temple")) return "temple";
	if (raw.includes("park")) return "nature";
	return "default";
};
const syncSoundZoneFromSelection = () => {
	if (IS_E2E || !soundEnabled.value) return;
	const highlightedId =
		props.highlightedShopId != null ? String(props.highlightedShopId) : null;
	if (!highlightedId) {
		audio.setZone("default");
		return;
	}
	const selectedShop = props.shops?.find(
		(shop) => String(shop?.id ?? "") === highlightedId,
	);
	const zone = mapCategoryToZone(selectedShop?.category);
	audio.setZone(zone);
};

const {
	buildingPopupX,
	buildingPopupY,
	buildingPopupVisible,
	buildingPopupName,
	buildingPopupCategoryIcon,
	buildingPopupVisitors,
	buildingPopupShop,
	selectedShopVisitors: selectedShopVisitorsById,
	hideBuildingInfoPopup,
	syncBuildingPopupContent: syncBuildingPopupContentCore,
	updateBuildingInfoPopupPosition,
	syncBuildingInfoPopupFromSelection: syncBuildingInfoPopupFromSelectionCore,
} = useMapPopups(map, mapContainer, {
	uiTopOffset: computed(() => props.uiTopOffset),
	uiBottomOffset: computed(() => props.uiBottomOffset),
});

const selectedShopVisitors = computed(() =>
	selectedShopVisitorsById(props.highlightedShopId),
);
const syncBuildingPopupContent = (shop) => {
	syncBuildingPopupContentCore(shop, props.highlightedShopId);
};
const syncBuildingInfoPopupFromSelection = () => {
	syncBuildingInfoPopupFromSelectionCore(props.shops, props.highlightedShopId);
};
const showPopupScanline = computed(
	() =>
		buildingPopupVisible.value &&
		allowNeonPulse.value &&
		!prefs.isReducedMotion &&
		!prefersReducedMotion.value,
);

// Realtime composable
const {
	hotspotSnapshot,
	liveVenueRefs,
	tapRipplesData,
	liveActivityChips,
	consumeHotspotUpdate,
	spawnTapRipple,
	refreshSmartPulseTargets,
	stopSmartPulseLoop,
} = useMapRealtime(
	map,
	isMapReady,
	isPerfRestricted,
	effectiveMotionBudget,
	computed(() => props.highlightedShopId),
	computed(() => props.shops),
);

// 3D Buildings & Fog removal moved to composable
const {
	startAtmosphereLoop,
	stopAtmosphereLoop,
	applyFogSettings,
	updateWeatherVisuals,
	removeFirefliesLayer,
	remove3dBuildingLayers,
	resetTrafficDashState,
} = useMapAtmosphere(map, isMapReady, {
	allowAmbientFx,
	allowNeonPulse,
	allowWeatherFx,
	allowMapFog,
	isPerfRestricted,
	weatherCondition,
	isWeatherNight,
	shouldRunAtmosphere,
});

// Route neon trail state (Keep here or extract later)
let routeTrailTimer = null;
let routeTrailFrame = 0;
const hasActiveRoute = ref(false);
const lastTrafficCenter = ref(null);
const lastTrafficRefreshAt = ref(0);
let trafficRefreshInterval = null;
const ROUTE_TRAIL_DASH_FRAMES = [
	[1.2, 2.2],
	[0.8, 2.6],
	[0.4, 3.0],
	[0.8, 2.6],
];

const resolveTrafficAnchor = () => {
	const userLoc = Array.isArray(props.userLocation) ? props.userLocation : null;
	const userLat = Number(userLoc?.[0]);
	const userLng = Number(userLoc?.[1]);
	const hasUserLocation = Number.isFinite(userLat) && Number.isFinite(userLng);

	const mapCenter = map.value?.getCenter?.();
	const centerLat = Number(mapCenter?.lat);
	const centerLng = Number(mapCenter?.lng);
	const hasMapCenter = Number.isFinite(centerLat) && Number.isFinite(centerLng);

	if (hasUserLocation && hasMapCenter) {
		const userToCenterKm = calculateDistance(
			userLat,
			userLng,
			centerLat,
			centerLng,
		);
		if (userToCenterKm <= TRAFFIC_CENTER_FALLBACK_DISTANCE_KM) {
			return { lat: userLat, lng: userLng };
		}
		return { lat: centerLat, lng: centerLng };
	}

	if (hasUserLocation) return { lat: userLat, lng: userLng };
	if (hasMapCenter) return { lat: centerLat, lng: centerLng };
	return null;
};

// Realtime logic handled by composable

// Pulse logic handled by composable

const refreshTrafficSubset = async ({ force = false } = {}) => {
	if (!map.value || !isMapReady.value) return;
	const anchor = resolveTrafficAnchor();

	if (!anchor) {
		lastTrafficCenter.value = null;
		lastTrafficRefreshAt.value = Date.now();
		await upsertTrafficRoads({
			userLocation: null,
			radiusKm: TRAFFIC_RADIUS_KM,
			force: true,
		});
		return;
	}

	const now = Date.now();
	const previous = lastTrafficCenter.value;
	const movedKm =
		previous && Number.isFinite(previous.lat) && Number.isFinite(previous.lng)
			? calculateDistance(previous.lat, previous.lng, anchor.lat, anchor.lng)
			: Number.POSITIVE_INFINITY;
	const stale = now - lastTrafficRefreshAt.value >= TRAFFIC_REFRESH_INTERVAL_MS;

	if (!force && movedKm < TRAFFIC_RECOMPUTE_DISTANCE_KM && !stale) return;

	lastTrafficCenter.value = { lat: anchor.lat, lng: anchor.lng };
	lastTrafficRefreshAt.value = now;
	await upsertTrafficRoads({
		userLocation: { lat: anchor.lat, lng: anchor.lng },
		radiusKm: TRAFFIC_RADIUS_KM,
		force,
	});
};

const applyRouteTrailVisibility = () => {
	if (!map.value) return;
	if (map.value.getLayer("distance-line-layer")) {
		map.value.setPaintProperty("distance-line-layer", "line-opacity", 0);
	}
	if (map.value.getLayer("distance-line-glow")) {
		map.value.setPaintProperty("distance-line-glow", "line-opacity", 0);
	}
};

const applyRouteTrailStatic = () => {
	if (!map.value) return;
	if (map.value.getLayer("distance-line-layer")) {
		map.value.setPaintProperty("distance-line-layer", "line-opacity", 0.82);
		map.value.setPaintProperty("distance-line-layer", "line-dasharray", [3, 2]);
		map.value.setPaintProperty("distance-line-layer", "line-width", 3);
	}
	if (map.value.getLayer("distance-line-glow")) {
		map.value.setPaintProperty("distance-line-glow", "line-opacity", 0.3);
		map.value.setPaintProperty("distance-line-glow", "line-width", 6);
	}
};

const stopRouteTrailAnimation = () => {
	if (routeTrailTimer) {
		cancelAnimationFrame(routeTrailTimer);
		routeTrailTimer = null;
	}
	routeTrailFrame = 0;
	applyRouteTrailVisibility();
};

const startRouteTrailAnimation = () => {
	if (!map.value || !hasActiveRoute.value) return;
	const prefersReduce =
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
	if (isPerfRestricted.value || prefersReduce) {
		applyRouteTrailStatic();
		return;
	}
	if (routeTrailTimer) {
		cancelAnimationFrame(routeTrailTimer);
		routeTrailTimer = null;
	}
	routeTrailFrame = 0;
	let _lastRafTime = 0;
	const applyFrame = () => {
		if (!map.value) return;
		const glowPulse = 0.22 + (Math.sin(Date.now() / 320) + 1) * 0.12;
		if (map.value.getLayer("distance-line-layer")) {
			map.value.setPaintProperty("distance-line-layer", "line-opacity", 0.9);
			map.value.setPaintProperty(
				"distance-line-layer",
				"line-dasharray",
				ROUTE_TRAIL_DASH_FRAMES[routeTrailFrame],
			);
		}
		if (map.value.getLayer("distance-line-glow")) {
			map.value.setPaintProperty(
				"distance-line-glow",
				"line-opacity",
				glowPulse,
			);
			map.value.setPaintProperty("distance-line-glow", "line-width", 6.2);
		}
	};
	applyFrame();
	const rafTick = (timestamp) => {
		if (!map.value || !hasActiveRoute.value) {
			stopRouteTrailAnimation();
			return;
		}
		if (timestamp - _lastRafTime >= 160) {
			_lastRafTime = timestamp;
			routeTrailFrame = (routeTrailFrame + 1) % ROUTE_TRAIL_DASH_FRAMES.length;
			applyFrame();
		}
		routeTrailTimer = requestAnimationFrame(rafTick);
	};
	routeTrailTimer = requestAnimationFrame(rafTick);
};

const clearProgressiveEffectsTimer = () => {
	if (progressiveEffectsTimer) {
		clearTimeout(progressiveEffectsTimer);
		progressiveEffectsTimer = null;
	}
};

const runProgressiveHeavyEffects = (seq) => {
	if (!map.value || !isMapReady.value) return;
	if (seq !== progressiveEffectsSeq) return;
	addNeonRoads();
	if (allowHeatmap.value) addHeatmapLayer();
	else removeHeatmapLayer();
	if (shouldRunAtmosphere.value) {
		startAtmosphereLoop();
	} else {
		stopAtmosphereLoop();
		removeFirefliesLayer();
		resetTrafficDashState();
	}
	if (!allow3dBuildings.value) {
		remove3dBuildingLayers();
	}
	ensureCoinAnimation();
	void refreshTrafficSubset({ force: true });
	if (hasActiveRoute.value) {
		if (allowNeonPulse.value && !isPerfRestricted.value) {
			startRouteTrailAnimation();
		} else {
			stopRouteTrailAnimation();
			applyRouteTrailStatic();
		}
	} else {
		stopRouteTrailAnimation();
		applyRouteTrailVisibility();
	}
	applyFogSettings();
	if (allowWeatherFx.value) {
		updateWeatherVisuals();
	}
};

const scheduleProgressiveHeavyEffects = () => {
	if (!map.value || !isMapReady.value) return;
	const mapInstance = map.value;
	const seq = ++progressiveEffectsSeq;

	clearProgressiveEffectsTimer();
	progressiveEffectsTimer = window.setTimeout(() => {
		progressiveEffectsTimer = null;
		runProgressiveHeavyEffects(seq);
	}, 1200);

	mapInstance.once("idle", () => {
		if (
			!map.value ||
			map.value !== mapInstance ||
			seq !== progressiveEffectsSeq
		) {
			return;
		}
		clearProgressiveEffectsTimer();
		progressiveEffectsTimer = window.setTimeout(() => {
			progressiveEffectsTimer = null;
			runProgressiveHeavyEffects(seq);
		}, 140);
	});
};

// ✅ Dynamic Data Fetching State
const MAP_REFRESH_DEBOUNCE_MS = 350;
const MAP_REFRESH_MIN_INTERVAL_MS = 3000;
const MAP_REFRESH_DATA_MIN_INTERVAL_MS = 1200;
const MAP_REFRESH_FORCE_MIN_INTERVAL_MS = 1800;
let rafToken = null;
let refreshDebounceTimer = null;
let pinsRefreshSeq = 0;
let lastMapRefreshAt = 0;
let lastForcedMapRefreshAt = 0;
let lastViewportKey = "";
let lastGoodPinFeatures = [];
let pinsAbortController = null; // AbortController to cancel stale getMapPins requests
let mapPinsRpcDisabledUntil = 0;
let isPinsRefreshInFlight = false;
let queuedPinsRefreshForce = false;
let queuedPinsRefreshAllowSameViewport = false;

const getViewportKey = () => {
	if (!map.value) return "";
	const b = map.value.getBounds();
	const zoom = map.value.getZoom();
	const round = (value, digits) => Number(value).toFixed(digits);
	return [
		round(b.getSouth(), 4),
		round(b.getWest(), 4),
		round(b.getNorth(), 4),
		round(b.getEast(), 4),
		round(zoom, 2),
	].join("|");
};

// Schedule fetching pins based on map movement (debounced + cooldown + viewport dedupe)
const scheduleMapRefresh = (options = null) => {
	const force =
		Boolean(options) &&
		typeof options === "object" &&
		"force" in options &&
		Boolean(options.force);
	const allowSameViewport =
		Boolean(options) &&
		typeof options === "object" &&
		"allowSameViewport" in options &&
		Boolean(options.allowSameViewport);

	if (!map.value || !isMapReady.value) return;
	if (props.isGiantPinView) return;
	if (refreshDebounceTimer) {
		clearTimeout(refreshDebounceTimer);
	}

	refreshDebounceTimer = setTimeout(() => {
		refreshDebounceTimer = null;
		if (!map.value || !isMapReady.value) return;

		const now = Date.now();
		const viewportKey = getViewportKey();
		const nonForceMinInterval = allowSameViewport
			? MAP_REFRESH_DATA_MIN_INTERVAL_MS
			: MAP_REFRESH_MIN_INTERVAL_MS;

		if (
			!force &&
			!allowSameViewport &&
			viewportKey &&
			viewportKey === lastViewportKey
		)
			return;
		if (!force && now - lastMapRefreshAt < nonForceMinInterval) return;
		if (
			force &&
			now - lastForcedMapRefreshAt < MAP_REFRESH_FORCE_MIN_INTERVAL_MS
		)
			return;

		lastViewportKey = viewportKey;
		lastMapRefreshAt = now;
		if (force) lastForcedMapRefreshAt = now;

		if (rafToken) cancelAnimationFrame(rafToken);
		rafToken = requestAnimationFrame(() => {
			rafToken = null;
			if (isPinsRefreshInFlight) {
				queuedPinsRefreshForce = queuedPinsRefreshForce || force;
				queuedPinsRefreshAllowSameViewport =
					queuedPinsRefreshAllowSameViewport || allowSameViewport;
				return;
			}
			isPinsRefreshInFlight = true;
			Promise.resolve(refreshPins()).finally(() => {
				isPinsRefreshInFlight = false;
				if (queuedPinsRefreshForce || queuedPinsRefreshAllowSameViewport) {
					const nextForce = queuedPinsRefreshForce;
					const nextAllowSameViewport =
						queuedPinsRefreshAllowSameViewport || nextForce;
					queuedPinsRefreshForce = false;
					queuedPinsRefreshAllowSameViewport = false;
					scheduleMapRefresh(
						nextForce
							? { force: true }
							: { allowSameViewport: nextAllowSameViewport },
					);
				}
			});
		});
	}, MAP_REFRESH_DEBOUNCE_MS);
};

const refreshPins = async () => {
	if (!map.value || !isMapReady.value) return;
	if (props.isGiantPinView) return;

	const seq = ++pinsRefreshSeq;
	const b = map.value.getBounds();
	const currentZoom = map.value.getZoom();
	const shops = Array.isArray(props.shops) ? props.shops : [];
	const allowedIds = allowedIdsRef.value;
	const normalizeId = (value) => String(value ?? "").trim();

	const isAllowedId = (id) => {
		const idStr = normalizeId(id);
		if (!idStr) return false;
		if (allowedIds === null) return true;
		return allowedIds.has(idStr);
	};
	const isCoinCollectedForId = (id) => {
		const collected = shopStore.collectedCoins;
		if (!collected?.has) return false;
		if (collected.has(id)) return true;
		const idStr = String(id ?? "").trim();
		if (idStr && collected.has(idStr)) return true;
		const idNum = Number(idStr);
		if (Number.isFinite(idNum) && collected.has(idNum)) return true;
		return false;
	};
	const resolvePinHasCoin = (id, rawHasCoin) => {
		const collected = isCoinCollectedForId(id);
		if (rawHasCoin === null || rawHasCoin === undefined) {
			return !collected;
		}
		if (typeof rawHasCoin === "boolean") {
			return rawHasCoin && !collected;
		}
		const raw = String(rawHasCoin).trim().toLowerCase();
		if (raw === "true" || raw === "1") return !collected;
		if (raw === "false" || raw === "0") return false;
		return !collected;
	};

	const resolveFeaturePinState = ({
		pin_state,
		pin_type,
		is_event,
		is_live,
		status,
	}) => {
		const pinStateRaw = String(pin_state || "")
			.trim()
			.toLowerCase();
		const pinTypeRaw = String(pin_type || "")
			.trim()
			.toLowerCase();
		const statusRaw = String(status || "")
			.trim()
			.toLowerCase();
		const eventLike =
			Boolean(is_event) ||
			pinStateRaw === "event" ||
			pinTypeRaw === "event" ||
			pinTypeRaw === "giant";
		if (eventLike) return "event";
		const liveLike =
			Boolean(is_live) || pinStateRaw === "live" || statusRaw === "live";
		return liveLike ? "live" : "off";
	};

	const toPinFeature = ({
		id,
		name,
		lat,
		lng,
		pin_type,
		pin_state,
		verified,
		glow,
		boost,
		giant,
		has_coin,
		visibility_score,
		image,
		status,
		is_event,
		is_live,
	}) => {
		const latNum = Number(lat);
		const lngNum = Number(lng);
		if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
		if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180)
			return null;

		const idStr = String(id ?? "").trim();
		if (!idStr) return null;
		const normalizedPinState = resolveFeaturePinState({
			pin_state,
			pin_type,
			is_event,
			is_live,
			status,
		});
		const normalizedPinType =
			String(pin_type || "")
				.trim()
				.toLowerCase() || "normal";

		return {
			type: "Feature",
			geometry: { type: "Point", coordinates: [lngNum, latNum] },
			properties: {
				id: idStr,
				name: name || "",
				pin_type: normalizedPinType,
				pin_state: normalizedPinState,
				verified: Boolean(verified),
				glow: Boolean(glow),
				boost: Boolean(boost),
				giant: Boolean(giant),
				has_coin: Boolean(has_coin),
				visibility_score: Number(visibility_score ?? 0) || 0,
				is_event: normalizedPinState === "event",
				is_live:
					normalizedPinState === "live" || liveVenueRefs.value.has(idStr),
				status: normalizedPinState === "live" ? "LIVE" : "OFF",
				vibe_score: Number(visibility_score ?? 0) || 0,
				image: image || null,
			},
		};
	};

	const pinFeatureFromShop = (shop) => {
		if (!shop) return null;
		const pinTypeRaw = String(shop.pin_type || "").toLowerCase();
		const isGiant =
			pinTypeRaw === "giant" ||
			shop.is_giant_active === true ||
			shop.isGiantPin === true ||
			shop.giantActive === true;

		return toPinFeature({
			id: shop.id,
			name: shop.name,
			lat: shop.lat ?? shop.latitude,
			lng: shop.lng ?? shop.longitude,
			pin_type: isGiant ? "giant" : pinTypeRaw || "normal",
			pin_state: shop.pin_state || shop.statusNormalized || null,
			verified: shop.is_verified || shop.verifiedActive || shop.verified_active,
			glow: shop.is_glowing || shop.glowActive || shop.glow_active,
			boost: shop.is_boost_active || shop.boostActive || shop.boost_active,
			giant: isGiant || shop.giant_active,
			has_coin: resolvePinHasCoin(shop.id, shop.has_coin ?? shop.hasCoin),
			visibility_score: shop.visibility_score ?? shop.visibilityScore,
			image: shop.Image_URL1 || shop.coverImage || shop.image_urls?.[0],
			status: shop.status,
			is_event: shop.is_event,
			is_live: shop.is_live,
		});
	};

	const pinFeatureFromRpc = (p) => {
		if (!p) return null;
		return toPinFeature({
			id: p.id,
			name: p.name,
			lat: p.lat,
			lng: p.lng,
			pin_type: p.pinType || p.pin_type,
			pin_state: p.pinState || p.pin_state,
			verified: p.verifiedActive,
			glow: p.glowActive,
			boost: p.boostActive,
			giant: p.giantActive,
			has_coin: resolvePinHasCoin(p.id, p.hasCoin ?? p.has_coin),
			visibility_score: p.visibilityScore,
			image: p.coverImage,
			status: p.status,
			is_event: p.isEvent || p.is_event,
			is_live: p.isLive || p.is_live,
		});
	};

	const ensureHighlightedShop = (features) => {
		const highlightedId =
			props.highlightedShopId != null
				? normalizeId(props.highlightedShopId)
				: null;
		if (!highlightedId) return features;
		if (!shops?.length) return features;
		if (allowedIds !== null && !allowedIds.has(highlightedId)) return features;

		const shop = shops.find((s) => normalizeId(s?.id) === highlightedId);
		const feature = pinFeatureFromShop(shop);
		if (!feature) return features;

		const next = [...features];
		const idx = next.findIndex(
			(f) => String(f?.properties?.id ?? "") === highlightedId,
		);
		if (idx >= 0) {
			next[idx] = feature;
		} else {
			next.unshift(feature);
		}
		return next;
	};

	const mergeFeaturesById = (baseFeatures = [], overlayFeatures = []) => {
		const merged = new Map();
		for (const feature of baseFeatures) {
			const id = String(feature?.properties?.id ?? "").trim();
			if (!id) continue;
			merged.set(id, feature);
		}
		for (const feature of overlayFeatures) {
			const id = String(feature?.properties?.id ?? "").trim();
			if (!id) continue;
			if (!merged.has(id)) {
				merged.set(id, feature);
				continue;
			}
			const prev = merged.get(id);
			merged.set(id, {
				...prev,
				...feature,
				geometry: feature?.geometry || prev?.geometry,
				properties: {
					...(prev?.properties || {}),
					...(feature?.properties || {}),
				},
			});
		}
		return Array.from(merged.values());
	};

	const buildFallbackFeaturesFromShopsInBounds = () => {
		if (!shops?.length) return [];
		const south = b.getSouth();
		const west = b.getWest();
		const north = b.getNorth();
		const east = b.getEast();

		const limit = 5000;

		const features = [];
		for (const shop of shops) {
			if (!isAllowedId(shop?.id)) continue;

			const lat = Number(shop?.lat ?? shop?.latitude);
			const lng = Number(shop?.lng ?? shop?.longitude);
			if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
			if (lat < south || lat > north || lng < west || lng > east) continue;

			const feature = pinFeatureFromShop(shop);
			if (!feature) continue;
			features.push(feature);
			if (features.length >= limit) break;
		}
		return features;
	};

	const applyFeatures = (features) => {
		if (seq !== pinsRefreshSeq) return;
		if (!map.value) return;
		applySourceData(PIN_SOURCE_ID, {
			type: "FeatureCollection",
			features,
		});
		refreshSmartPulseTargets();
	};

	if (IS_E2E) {
		const fallback = ensureHighlightedShop(
			buildFallbackFeaturesFromShopsInBounds(),
		);
		applyFeatures(fallback);
		return;
	}

	if (Date.now() < mapPinsRpcDisabledUntil) {
		const localFallback = ensureHighlightedShop(
			buildFallbackFeaturesFromShopsInBounds(),
		);
		const fallback = localFallback.length
			? localFallback
			: ensureHighlightedShop(lastGoodPinFeatures);
		applyFeatures(fallback);
		return;
	}

	// ★ Instant-pins: show fallback data immediately so the map is never empty
	// while waiting for the RPC. If we have cached RPC data, use it; otherwise
	// build from the shops prop. RPC data will upgrade these when it arrives.
	const immediateFallback = ensureHighlightedShop(
		lastGoodPinFeatures.length > 0
			? lastGoodPinFeatures
			: buildFallbackFeaturesFromShopsInBounds(),
	);
	if (immediateFallback.length > 0) {
		applyFeatures(immediateFallback);
	}

	// Cancel any in-flight getMapPins before starting a new one
	if (pinsAbortController) pinsAbortController.abort();
	pinsAbortController = new AbortController();
	const { signal } = pinsAbortController;

	try {
		const pins = await getMapPins({
			p_min_lat: b.getSouth(),
			p_min_lng: b.getWest(),
			p_max_lat: b.getNorth(),
			p_max_lng: b.getEast(),
			p_zoom: currentZoom,
			signal,
		});

		if (seq !== pinsRefreshSeq) return;

		const rpcFeatures = (pins || [])
			.filter((p) => isAllowedId(p?.id))
			.map(pinFeatureFromRpc)
			.filter(Boolean);
		const fallbackFeatures = buildFallbackFeaturesFromShopsInBounds();
		const mergedFeatures = mergeFeaturesById(fallbackFeatures, rpcFeatures);
		if (mergedFeatures.length > 0) {
			lastGoodPinFeatures = mergedFeatures;
		}

		let features = ensureHighlightedShop(mergedFeatures);
		if (!features.length && lastGoodPinFeatures.length) {
			features = ensureHighlightedShop(lastGoodPinFeatures);
		}
		applyFeatures(features);
	} catch (err) {
		if (err?.name === "AbortError" || signal?.aborted) return;
		const statusCode = Number(err?.status || err?.code || 0);
		const isServerError =
			(statusCode >= 500 && statusCode < 600) ||
			String(err?.message || "").includes("500");
		if (isServerError) {
			mapPinsRpcDisabledUntil = Date.now() + 60_000;
		}
		// On failure, fallback data is already displayed — only log the error
		if (import.meta.env.DEV) {
			console.warn(
				"Map pins RPC failed, using displayed fallback:",
				err?.message || err,
			);
		}
		// Re-apply with latest fallback to ensure consistency
		const localFallback = ensureHighlightedShop(
			buildFallbackFeaturesFromShopsInBounds(),
		);
		const fallback = localFallback.length
			? localFallback
			: ensureHighlightedShop(lastGoodPinFeatures);
		applyFeatures(fallback);
	}
};

// Bind events
watch(isMapReady, (ready) => {
	if (ready && map.value) {
		if (SHOULD_EXPOSE_MAP_DEBUG && typeof window !== "undefined") {
			window.__vibecityMapDebug = map.value;
		}
		map.value.off("moveend", scheduleMapRefresh);
		map.value.off("zoomend", scheduleMapRefresh);
		map.value.off("move", handleMapMoveForEnhancements);
		map.value.off("zoom", handleMapMoveForEnhancements);
		map.value.off("moveend", handleMapMoveEndForWeather);
		map.value.off("style.load", handleMapStyleLoad);

		map.value.on("moveend", scheduleMapRefresh);
		map.value.on("zoomend", scheduleMapRefresh);
		map.value.on("move", handleMapMoveForEnhancements);
		map.value.on("zoom", handleMapMoveForEnhancements);
		map.value.on("moveend", handleMapMoveEndForWeather);
		map.value.on("style.load", handleMapStyleLoad);
		currentMapZoom.value = map.value.getZoom();
		scheduleMapRefresh({ force: true }); // Initial load
		refreshSmartPulseTargets();
		syncBuildingInfoPopupFromSelection();

		// Atmosphere updates now handled by composable watcher
		if (allowWeatherFx.value) {
			refreshWeather();
			// applyFogSettings(); // Handled by composable
			// updateWeatherVisuals(); // Handled by composable
		}

		if (soundEnabled.value && !IS_E2E) {
			attachSoundGestureListener();
			syncSoundZoneFromSelection();
			updateSoundVolumeFromZoom(true);
		}
	}
});

watch(
	[isMapReady, mapInitRequested],
	([ready]) => {
		if (ready) {
			showMapRecoveryHint.value = false;
			mapLoadTimeoutReached.value = false;
			if (mapRecoveryTimeoutId) {
				clearTimeout(mapRecoveryTimeoutId);
				mapRecoveryTimeoutId = null;
			}
			return;
		}
		armMapRecoveryTimeout();
	},
	{ immediate: true },
);

const roadDistance = ref(null);
const roadDuration = ref(null);

// ✅ Fetch Road-based Directions
// ✅ Update Popup UI with new distance
const updatePopupUi = (distance, duration) => {
	if (activePopup.value?.isOpen()) {
		const popupEl = activePopup.value.getElement();
		const distLabel = popupEl.querySelector(".road-dist-label");
		if (distLabel) {
			const distTxt =
				distance < 1000
					? `${Math.round(distance)} m`
					: `${(distance / 1000).toFixed(1)} km`;
			const timeTxt = `${Math.round(duration / 60)} min`;
			distLabel.innerHTML = `📍 ${distTxt} (${timeTxt})`;
		}
	}
};

const updateRoadDirections = async () => {
	// 1. Validate Inputs
	if (
		!props.userLocation ||
		props.userLocation.length < 2 ||
		!props.selectedShopCoords ||
		props.selectedShopCoords.length < 2
	) {
		roadDistance.value = null;
		roadDuration.value = null;
		hasActiveRoute.value = false;
		stopRouteTrailAnimation();
		applySourceData(DISTANCE_LINE_SOURCE_ID, {
			type: "FeatureCollection",
			features: [],
		});
		return;
	}

	const [uLat, uLng] = props.userLocation;
	const [sLat, sLng] = props.selectedShopCoords;

	if (!mapboxgl?.accessToken) return;
	const coords = [uLat, uLng, sLat, sLng];

	// 2. Validate Coordinates
	if (!coords.every(Number.isFinite)) return;
	if (
		Math.abs(uLat) > 90 ||
		Math.abs(sLat) > 90 ||
		Math.abs(uLng) > 180 ||
		Math.abs(sLng) > 180
	)
		return;

	try {
		if (!navigator.onLine) return;

		if (routeAbortController) {
			routeAbortController.abort();
		}
		routeAbortController = new AbortController();

		const params = new URLSearchParams({
			start_lat: String(uLat),
			start_lng: String(uLng),
			end_lat: String(sLat),
			end_lng: String(sLng),
			profile: "walking",
			geometries: "geojson",
		});
		const res = await apiFetch(
			`/proxy/mapbox-directions?${params.toString()}`,
			{
				signal: routeAbortController.signal,
				includeVisitor: false,
				headers: { "X-Mapbox-Token": mapboxgl.accessToken },
			},
		);

		if (!res.ok) {
			if (!IS_E2E) console.warn("Route proxy request failed:", res.status);
			return;
		}

		const data = await res.json();
		if (data.routes?.[0]) {
			const route = data.routes[0].geometry;

			// Update Map Source
			applySourceData(DISTANCE_LINE_SOURCE_ID, {
				type: "Feature",
				geometry: route,
			});

			// Update State & UI
			roadDistance.value = data.routes[0].distance;
			roadDuration.value = data.routes[0].duration;
			updatePopupUi(roadDistance.value, roadDuration.value);
			hasActiveRoute.value = true;
			if (allowNeonPulse.value && !isPerfRestricted.value) {
				startRouteTrailAnimation();
			} else {
				stopRouteTrailAnimation();
				applyRouteTrailStatic();
			}
		} else {
			hasActiveRoute.value = false;
			stopRouteTrailAnimation();
		}
	} catch (err) {
		if (err.name !== "AbortError" && !IS_E2E) {
			console.warn("Route fetch failed", err);
		}
		hasActiveRoute.value = false;
		stopRouteTrailAnimation();
	}
};

watch(() => props.selectedShopCoords, updateRoadDirections);

let updateMarkersRequested = false;
let lastMarkerUpdate = 0;
const MARKER_UPDATE_THROTTLE = 200;

const requestUpdateMarkers = () => {
	const timeSinceLastUpdate = Date.now() - lastMarkerUpdate;
	if (timeSinceLastUpdate < MARKER_UPDATE_THROTTLE) {
		// Throttle: wait remaining time
		setTimeout(() => {
			if (!updateMarkersRequested) {
				updateMarkersRequested = true;
				requestAnimationFrame(() => {
					updateMarkers();
					updateMarkersRequested = false;
					lastMarkerUpdate = Date.now();
				});
			}
		}, MARKER_UPDATE_THROTTLE - timeSinceLastUpdate);
	} else {
		updateMarkersRequested = true;
		requestAnimationFrame(() => {
			updateMarkers();
			updateMarkersRequested = false;
			lastMarkerUpdate = Date.now();
		});
	}
};
// ... (existing throttled marker update)

// ✅ Vibe Effect Markers Sync

watch(
	activeVibeEffects,
	(effects) => {
		if (!map.value || !mapboxgl) return;

		// 1. Remove markers not in list
		for (const [id, marker] of vibeMarkersMap.entries()) {
			if (!effects.some((e) => e.id === id)) {
				marker.remove();
				vibeMarkersMap.delete(id);
			}
		}

		// 2. Add new markers
		effects.forEach((effect) => {
			if (!vibeMarkersMap.has(effect.id)) {
				const el = document.createElement("div");
				el.className = "vibe-float-marker";
				el.innerHTML = effect.emoji;

				const marker = new mapboxgl.Marker({
					element: el,
					anchor: "bottom",
				})
					.setLngLat([effect.lng, effect.lat])
					.addTo(map.value);

				vibeMarkersMap.set(effect.id, marker);
			}
		});
	},
	{ deep: false },
);

// ✅ Visibility Logic (User Request)
const pinsVisible = ref(true);

watch(
	[() => props.isImmersive, () => props.isGiantPinView],
	([immersive, giantView]) => {
		const shouldHide = immersive || giantView;
		pinsVisible.value = !shouldHide;
		if (giantView) {
			stopAtmosphereLoop();
			stopRouteTrailAnimation();
			stopSmartPulseLoop();
			closeActivePopup();
			hideBuildingInfoPopup();
		} else {
			refreshSmartPulseTargets();
			if (map.value && isMapReady.value) {
				scheduleProgressiveHeavyEffects();
			}
			scheduleMapRefresh({ force: true });
		}

		// Toggle DOM Markers
		markersMap.value.forEach(({ marker }) => {
			const el = marker.getElement();
			if (el) el.style.opacity = shouldHide ? "0" : "1";
		});

		eventMarkersMap.value.forEach((marker) => {
			const el = marker.getElement();
			if (el) el.style.opacity = shouldHide ? "0" : "1";
		});

		// Toggle Mapbox Layers (Clusters & Points)
		if (map.value && isMapReady.value) {
			const opacity = shouldHide ? 0 : 1;
			const textOpacity = shouldHide ? 0 : 1;

			const layers = [
				CLUSTER_LAYER_ID,
				PIN_LAYER_ID,
				"pin-coins",
				"pin-coins-fallback",
				CLUSTER_COUNT_LAYER_ID,
				"pin-glow",
				"pin-smart-pulse",
				"giant-glow",
				"giant-pin-marker",
			];

			layers.forEach((layerId) => {
				if (map.value.getLayer(layerId)) {
					// Check layer type to set correct property
					const type = map.value.getLayer(layerId).type;
					if (type === "circle") {
						map.value.setPaintProperty(layerId, "circle-opacity", opacity);
						map.value.setPaintProperty(
							layerId,
							"circle-stroke-opacity",
							opacity,
						);
					} else if (type === "symbol") {
						map.value.setPaintProperty(layerId, "text-opacity", textOpacity);
						map.value.setPaintProperty(layerId, "icon-opacity", opacity);
					}
				}
			});
		}
	},
	{ immediate: true },
);

const clearCoinLayerRetryTimer = () => {
	if (coinLayerRetryTimer) {
		clearTimeout(coinLayerRetryTimer);
		coinLayerRetryTimer = null;
	}
};

const scheduleCoinLayerRetry = () => {
	if (!map.value || !isMapReady.value) return;
	if (coinLayerRetryAttempt >= 4) return;
	clearCoinLayerRetryTimer();
	const delayMs = Math.min(2400, 280 * 2 ** coinLayerRetryAttempt);
	coinLayerRetryAttempt += 1;
	coinLayerRetryTimer = window.setTimeout(() => {
		coinLayerRetryTimer = null;
		void attachCoinLayerWithFallback({ allowRetry: true });
	}, delayMs);
};

const attachCoinLayerWithFallback = ({ allowRetry = true } = {}) => {
	if (!map.value || !isMapReady.value) return false;
	if (!map.value.isStyleLoaded?.()) return false;

	ensureCoinAnimation();
	const attachedAnimatedCoins = upsertCoinLayer({
		sourceId: PIN_SOURCE_ID,
		layerId: "pin-coins",
		staticText: false,
	});
	if (attachedAnimatedCoins) {
		removeCoinLayer("pin-coins-fallback");
		clearCoinLayerRetryTimer();
		coinLayerRetryAttempt = 0;
		return true;
	}

	upsertCoinLayer({
		sourceId: PIN_SOURCE_ID,
		layerId: "pin-coins-fallback",
		staticText: true,
	});
	if (allowRetry) {
		scheduleCoinLayerRetry();
	}
	return false;
};

/**
 * Setup static map layers (sources and layers).
 * This is called once on map load or style change.
 */
const setupMapLayers = () => {
	if (!map.value) return;
	stopAtmosphereLoop();
	removeFirefliesLayer();
	if (!allow3dBuildings.value) remove3dBuildingLayers();
	if (!allowHeatmap.value) removeHeatmapLayer();
	stopRouteTrailAnimation();
	applyRouteTrailVisibility();
	applyFogSettings();
	addNeonRoads();
	addCarAnimation({ sourceId: TRAFFIC_NEON_SOURCE_ID });
	if (allowHeatmap.value) {
		addHeatmapLayer();
	}

	// 2. Main Pins Source (No clustering — always show individual pins)
	if (!map.value.getSource(PIN_SOURCE_ID)) {
		map.value.addSource(PIN_SOURCE_ID, {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
			promoteId: "id",
			cluster: false,
		});
	}

	// 3. Unclustered Pins (The main view — all individual)
	// Shows varying icons based on Giant/Boost/Normal status
	if (!map.value.getLayer(PIN_LAYER_ID)) {
		map.value.addLayer({
			id: PIN_LAYER_ID,
			type: "symbol",
			source: PIN_SOURCE_ID,
			filter: [
				"all",
				["!", ["has", "point_count"]],
				["!=", ["get", "pin_type"], "giant"],
			],
			layout: {
				"icon-image": [
					"case",
					["==", ["get", "pin_state"], "event"],
					"pin-purple",
					["==", ["get", "pin_state"], "live"],
					"pin-red",
					"pin-grey",
				],
				"icon-size": ["case", ["==", ["get", "pin_type"], "giant"], 0.42, 0.3],
				"icon-allow-overlap": true,
				"icon-anchor": "bottom",
				"text-field": ["get", "name"], // Show name for ALL pins
				"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
				"text-offset": [0, 1.2],
				"text-anchor": "top",
				"text-size": 12,
			},
			paint: {
				"text-color": "#ffffff",
				"text-halo-color": "#000000",
				"text-halo-width": 1,
				"icon-opacity": 1,
			},
		});
	}

	// Fix 1G: coin animation handled exclusively by DOM markers (useMapMarkers)

	if (!map.value.getLayer(PIN_HITBOX_LAYER_ID)) {
		map.value.addLayer(
			{
				id: PIN_HITBOX_LAYER_ID,
				type: "circle",
				source: PIN_SOURCE_ID,
				filter: [
					"all",
					["!", ["has", "point_count"]],
					["!=", ["get", "pin_type"], "giant"],
				],
				paint: {
					"circle-radius": [
						"case",
						["==", ["get", "pin_type"], "giant"],
						18,
						["==", ["get", "boost"], true],
						16,
						14,
					],
					"circle-color": "#ffffff",
					"circle-opacity": 0.01,
					"circle-stroke-opacity": 0,
				},
			},
			PIN_LAYER_ID,
		);
	}

	// Cars-only map mode: disable aura/pulse/ripple cinematic effects.
	if (map.value.getLayer("pin-glow")) map.value.removeLayer("pin-glow");
	if (map.value.getLayer("pin-smart-pulse"))
		map.value.removeLayer("pin-smart-pulse");
	if (map.value.getLayer("giant-glow")) map.value.removeLayer("giant-glow");
	if (map.value.getLayer("tap-ripples-layer"))
		map.value.removeLayer("tap-ripples-layer");
	if (map.value.getSource("tap-ripples")) map.value.removeSource("tap-ripples");

	map.value.setPitch(0);
	map.value.setBearing(0);
	resetTrafficDashState();
	applyFogSettings();

	// 5. Distance Line
	if (!map.value.getSource(DISTANCE_LINE_SOURCE_ID)) {
		map.value.addSource(DISTANCE_LINE_SOURCE_ID, {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
			lineMetrics: true,
		});
		map.value.addLayer({
			id: "distance-line-layer",
			type: "line",
			source: DISTANCE_LINE_SOURCE_ID,
			layout: { "line-join": "round", "line-cap": "round" },
			paint: {
				"line-color": "#00ffff",
				"line-width": 3,
				"line-dasharray": [3, 2],
				"line-opacity": 0,
			},
		});
		map.value.addLayer({
			id: "distance-line-glow",
			type: "line",
			source: DISTANCE_LINE_SOURCE_ID,
			layout: { "line-join": "round", "line-cap": "round" },
			paint: {
				"line-color": "#00ffff",
				"line-width": 6,
				"line-opacity": 0,
				"line-blur": 2,
			},
		});
	}
	applyRouteTrailVisibility();
	scheduleProgressiveHeavyEffects();

	// 6. User Location
	if (!map.value.getSource("user-location")) {
		map.value.addSource("user-location", {
			type: "geojson",
			data: { type: "FeatureCollection", features: [] },
		});
		map.value.addLayer({
			id: "user-location-outer",
			type: "circle",
			source: "user-location",
			paint: {
				"circle-radius": 15,
				"circle-color": "#3B82F6",
				"circle-opacity": 0.2,
			},
		});
		map.value.addLayer({
			id: "user-location-inner",
			type: "circle",
			source: "user-location",
			paint: {
				"circle-radius": 6,
				"circle-color": "#3B82F6",
				"circle-stroke-width": 2,
				"circle-stroke-color": "#fff",
			},
		});
	}
};

// Update GeoJSON sources
const updateMapSources = () => {
	if (!map.value || !isMapReady.value) return;

	// 1. Update user location
	if (map.value.getSource("user-location") && props.userLocation) {
		applySourceData("user-location", {
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [props.userLocation[1], props.userLocation[0]],
			},
		});
	}

	void refreshTrafficSubset();
};

const COLLECT_DISTANCE_KM = 0.05; // 50 meters to collect
// Check if user is close enough to collect
const checkCoinCollection = (shop) => {
	if (!props.userLocation || shopStore.collectedCoins?.has?.(shop.id)) return;
	const [uLat, uLng] = props.userLocation;
	const distance = calculateDistance(uLat, uLng, shop.lat, shop.lng);
	if (distance <= COLLECT_DISTANCE_KM) {
		shopStore.addCoin(shop.id);
	}
};

// ✅ Active Events (Timed Giant Pins)
const activeEvents = computed(() => {
	void nowTick.value;
	if (!props.buildings || !Array.isArray(props.buildings)) return [];
	const now = new Date(nowTick.value);
	return props.buildings.filter((event) => {
		if (!event.startTime || !event.endTime) return true; // Always show if no time limits
		const start = new Date(event.startTime);
		const end = new Date(event.endTime);
		return now >= start && now <= end;
	});
});

// ✅ Fireflies Effect - Reduced for performance
const fireflies = Array.from({ length: 8 }, (_, i) => ({
	id: i,
	left: `${10 + ((i * 12) % 80)}%`,
	bottom: `${5 + ((i * 9) % 30)}%`,
	delay: `${(i * 2) % 10}s`,
	duration: `${12 + (i % 6)}s`,
}));

const distanceToSelectedShop = computed(() => {
	if (!props.userLocation || !props.selectedShopCoords) return null;
	const [uLat, uLng] = props.userLocation;
	const [sLat, sLng] = props.selectedShopCoords;
	const distance = calculateDistance(uLat, uLng, sLat, sLng);
	return distance < 1
		? `${Math.round(distance * 1000)} m`
		: `${distance.toFixed(1)} km`;
});

// ✅ Check Token Validity
const isTokenInvalid = ref(false);

// ✅ Mapbox token (shared with useMapCore)
const MAPBOX_TOKEN = sanitizeEnvToken(import.meta.env.VITE_MAPBOX_TOKEN || "");

// ✅ Ensure Mapbox is configured
const ensureMapboxLoaded = () => {
	if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.")) {
		isTokenInvalid.value = true;
		return false;
	}

	if (mapboxgl) {
		mapboxgl.accessToken = MAPBOX_TOKEN;
		return true;
	}

	return false;
};

// ✅ WebGL Support Detection - More robust check
const checkWebGLSupport = () => {
	try {
		const canvas = document.createElement("canvas");
		// Try WebGL2 first, then WebGL1
		const gl =
			canvas.getContext("webgl2") ||
			canvas.getContext("webgl") ||
			canvas.getContext("experimental-webgl");

		if (!gl) {
			console.error("❌ WebGL context could not be created");
			return false;
		}

		// Check for required extensions
		const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
		if (debugInfo) {
			const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
			const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
			if (import.meta.env.DEV) {
				console.log("🎮 GPU:", vendor, renderer);
			}

			// Some software renderers may cause issues
			if (renderer?.toLowerCase().includes("swiftshader")) {
				if (import.meta.env.DEV) {
					console.warn("⚠️ Software WebGL renderer detected, map may be slow");
				}
			}
		}

		if (import.meta.env.DEV) {
			console.log("✅ WebGL is supported");
		}
		return true;
	} catch (e) {
		console.error("❌ WebGL check failed:", e);
		return false;
	}
};

const webGLSupported = ref(true);
const shouldShowMapLoadingSkeleton = computed(
	() =>
		mapInitRequested.value &&
		!isMapReady.value &&
		!isTokenInvalid.value &&
		webGLSupported.value &&
		!maplessMode.value,
);
const mapA11yLabel = computed(() => {
	if (isTokenInvalid.value)
		return tt("map.token_error.title", "Map unavailable");
	if (!webGLSupported.value && !maplessMode.value) {
		return tt("map.webgl_error.title", "Map unavailable");
	}
	if (maplessMode.value) return tt("map.mapless.unavailable", "List mode");
	if (shouldShowMapLoadingSkeleton.value || showMapRecoveryHint.value) {
		return tt("map.loading", "Loading map");
	}
	return tt("map.ready", "Interactive city map");
});

const queueMapResize = (force = false) => {
	if (!map.value) return;
	const now = performance.now();
	if (!force && resizeRaf && now - lastResizeAt < RESIZE_DEBOUNCE_MS) {
		return;
	}
	if (resizeRaf) {
		cancelAnimationFrame(resizeRaf);
	}
	resizeRaf = requestAnimationFrame(() => {
		resizeRaf = null;
		if (!map.value) return;
		lastResizeAt = performance.now();
		map.value.resize();
	});
};

// Navigation controls removed (user prefers cleaner map)

// Enable smooth scrolling and pinch-zoom

// ✅ Map Initialization (Composables)
let resizeObserver = null;
onMounted(() => {
	if (import.meta.env.DEV) {
		console.log("🗺️ Initializing Mapbox Core...");
	}
	initMapOnce();
	if (!trafficRefreshInterval) {
		trafficRefreshInterval = window.setInterval(() => {
			void refreshTrafficSubset();
		}, TRAFFIC_REFRESH_INTERVAL_MS);
	}

	// Use ResizeObserver instead of manual resize() calls
	if (mapContainer.value && typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => {
			queueMapResize();
		});
		resizeObserver.observe(mapContainer.value);
	}
});

// ✅ Watch for Map Ready
watch(isMapReady, (ready) => {
	if (ready && map.value) {
		if (import.meta.env.DEV) {
			console.log("✅ Map Core Ready - Setting up Layers");
		}
		setupMapLayers();
		updateMapSources();
		refreshSmartPulseTargets();
		requestUpdateMarkers();
		updateEventMarkers();
		setTimeout(() => {
			mapLoaded.value = true;
		}, 300);
	}
});

// MVP Unicorn Popup - Logic extracted to mapRenderer.js
const getPopupHTML = (item) => {
	return createPopupHTML({
		item,
		isDarkMode: props.isDarkMode,
		hasCoins: !(shopStore.collectedCoins?.has?.(item.id) ?? false),
		roadDistance: roadDistance.value,
		roadDuration: roadDuration.value,
		tt, // translation function
	});
};

// ✅ Close Active Popup
const closeActivePopup = () => {
	if (activePopup.value && typeof activePopup.value.remove === "function") {
		activePopup.value.remove();
	}
	activePopup.value = null;
};
const getPopupLiftOffset = () => {
	if (typeof window === "undefined") return 80;
	const isMobile = window.innerWidth < 768;
	return isMobile ? 64 : 72;
};

// ✅ Show Popup for Item (Fixed button handling)
const showPopup = (item) => {
	closeActivePopup();

	// Guard: Ensure both map and mapboxgl are ready
	if (!map.value || !mapboxgl) {
		console.warn("⚠️ Map or mapboxgl not ready for popup");
		return;
	}

	const popup = new mapboxgl.Popup({
		closeButton: false,
		closeOnClick: false,
		className: "vibe-mapbox-popup",
		maxWidth: "360px",
		offset: [0, -getPopupLiftOffset()],
		anchor: "bottom",
	})
		.setLngLat([item.lng, item.lat])
		.setHTML(getPopupHTML(item))
		.addTo(map.value);

	activePopup.value = popup;

	// ✅ Give popup time to mount before any measurements
	requestAnimationFrame(() => {
		// Popup height measurement removed - was causing unused variable warning
	});

	// Attach event listeners with delay for DOM to be ready
	setTimeout(() => {
		const popupEl = popup.getElement();
		if (!popupEl) return;

		// Close button
		const closeBtn = popupEl.querySelector(".popup-close-btn");
		if (closeBtn) {
			closeBtn.onclick = (e) => {
				e.stopPropagation();
				e.preventDefault();
				closeActivePopup();
			};
		}

		// Navigate button
		const navBtn = popupEl.querySelector(".popup-nav-btn");
		if (navBtn) {
			navBtn.onclick = (e) => {
				e.stopPropagation();
				const userLat = Number(props.userLocation?.[0]);
				const userLng = Number(props.userLocation?.[1]);
				const hasOrigin = Number.isFinite(userLat) && Number.isFinite(userLng);
				const originParam = hasOrigin
					? `&origin=${encodeURIComponent(`${userLat},${userLng}`)}`
					: "";
				openExternal(
					`https://www.google.com/maps/dir/?api=1${originParam}&destination=${item.lat},${item.lng}&travelmode=driving`,
				);
			};
		}

		// Ride button
		const rideBtn = popupEl.querySelector(".popup-ride-btn");
		if (rideBtn) {
			const onRideClick = (e) => {
				e.stopPropagation();
				e.preventDefault();
				emit("open-ride-modal", item);
			};
			rideBtn.onclick = onRideClick;
			rideBtn.ontouchend = onRideClick;
		}
	}, 100);
};

const updateMarkers = () => {
	if (!props.shops) return;
	// Only giant pins get DOM markers; regular pins use GeoJSON symbol layer
	updateMarkersCore(props.shops, props.highlightedShopId, {
		pinsVisible: pinsVisible.value,
		allowedIds: allowedIdsRef.value,
		enableDomCoinMarkers: true,
		renderRegularDomMarkers: IS_STRICT_MAP_E2E,
		onSelect: (shop) => handleMarkerClick(shop),
		onOpenBuilding: (shop) => emit("open-building", shop),
	});
};

const updateEventMarkers = () => {
	updateEventMarkersCore(activeEvents.value, {
		pinsVisible: pinsVisible.value,
		onOpenBuilding: (event) => {
			if (IS_STRICT_MAP_E2E) {
				const eventId = String(event?.id ?? "").trim();
				const eventVenueId = String(event?.venueId ?? "").trim();
				const resolvedShop =
					shopStore.getShopById?.(eventId) ||
					shopStore.getShopById?.(eventVenueId) ||
					props.shops?.find((shop) => String(shop?.id ?? "") === eventId) ||
					props.shops?.find(
						(shop) => String(shop?.id ?? "") === eventVenueId,
					) ||
					event;
				emit("select-shop", resolvedShop);
				emit("open-detail", resolvedShop);
				return;
			}
			emit("open-building", event);
		},
	});
};

const resolveFeatureItem = (shopData = {}, feature = null) => {
	const rawId =
		shopData?.id ??
		feature?.properties?.id ??
		feature?.id ??
		shopData?.shop_id ??
		null;
	if (rawId === null || rawId === undefined) return shopData;
	const id = String(rawId).trim();
	if (!id) return shopData;

	const fromVisible = shopsByIdRef.value.get(id);
	if (fromVisible) return fromVisible;
	const fromStore = shopStore.getShopById?.(id);
	if (fromStore) return fromStore;
	return { ...shopData, id };
};

// ✅ Map Interactions moved to useMapInteractions
const {
	handlePointClick,
	handleClusterClick,
	handleMarkerClick: handleMarkerClickCore,
	setPointer,
	resetPointer,
	setupMapInteractions: setupInteractionsCore,
	focusLocation: focusLocationCore,
	centerOnUser: centerOnUserCore,
	flyTo: flyToCore,
} = useMapInteractions(map, isMapReady, emit, props, mapContainer, {
	spawnTapRipple,
	resolveFeatureItem,
	enableTapRipple: false,
	pinLayerId: PIN_LAYER_ID,
	pinHitboxLayerId: PIN_HITBOX_LAYER_ID,
	clusterLayerId: CLUSTER_LAYER_ID,
	pinSourceId: PIN_SOURCE_ID,
});

const setupMapInteractions = () => {
	setupInteractionsCore();
};

const handleMarkerClick = (item) => {
	handleMarkerClickCore(item);
	showPopup(item); // Keep local popup logic
	emit("open-detail", item);
};

// ✅ Setup Map Interactions & Watch for Ready (Performance Fix)
watch(isMapReady, (ready) => {
	emit("map-ready-change", !!ready);
	if (!ready || !map.value) return;
	queueMapResize(true);
	setupMapInteractions();
	refreshSmartPulseTargets();
});

// handleMarkerClick defined above with composable

// ✅ Update User Location
const updateUserLocation = () => {
	if (!map.value || !isMapReady.value) return;
	if (!map.value.getSource("user-location")) return;

	if (props.userLocation && props.userLocation.length >= 2) {
		const [lat, lng] = props.userLocation;
		applySourceData("user-location", {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: {
						type: "Point",
						coordinates: [lng, lat],
					},
				},
			],
		});
	} else {
		applySourceData("user-location", {
			type: "FeatureCollection",
			features: [],
		});
	}
};

let lastMoveEnhanceAt = 0;
let moveEnhanceRaf = null;
const MAP_MOVE_ENHANCE_THROTTLE_MS = 200;
const handleMapMoveForEnhancements = () => {
	if (moveEnhanceRaf) return;
	moveEnhanceRaf = requestAnimationFrame(() => {
		moveEnhanceRaf = null;
		if (!map.value) return;
		const now = performance.now();
		if (now - lastMoveEnhanceAt < MAP_MOVE_ENHANCE_THROTTLE_MS) return;
		lastMoveEnhanceAt = now;
		currentMapZoom.value = map.value.getZoom();
		updateBuildingInfoPopupPosition();
		updateSoundVolumeFromZoom();
	});
};

const handleMapMoveEndForWeather = () => {
	void refreshTrafficSubset();
	if (!allowWeatherFx.value) return;
	refreshWeather();
	applyFogSettings();
};

const handleMapStyleLoad = () => {
	resetTrafficDashState();
	applyFogSettings();
	syncBuildingInfoPopupFromSelection();
	updateSoundVolumeFromZoom(true);
	addCarAnimation({ sourceId: TRAFFIC_NEON_SOURCE_ID });
	void refreshTrafficSubset({ force: true });
	scheduleProgressiveHeavyEffects();
};

// ✅ Focus Location (Fly To) - Smooth & Precise Centering
// Focus Location moved to composable
const focusLocation = (coords, targetZoom, pitch, extraBottomOffset) => {
	focusLocationCore(coords, targetZoom, pitch ?? 60, extraBottomOffset);
};

// Center on User moved to composable
const centerOnUser = () => {
	centerOnUserCore();
};

const applyStyleIfNeeded = (isDarkMode) => {
	if (!map.value) return;

	const nextStyleUrl = styleUrlForTheme(Boolean(isDarkMode));
	if (currentStyleUrl.value === nextStyleUrl) return;

	currentStyleUrl.value = nextStyleUrl;
	styleApplySeq += 1;
	const seq = styleApplySeq;

	try {
		map.value.setStyle(nextStyleUrl, { diff: false });
	} catch (e) {
		console.error("Map style switch failed:", e);
		return;
	}

	map.value.once("style.load", () => {
		if (!map.value) return;
		if (seq !== styleApplySeq) return;
		setupMapLayers();
		setupMapInteractions();
		updateMapSources();
		updateMarkers();
		updateEventMarkers();
		updateUserLocation();
		refreshSmartPulseTargets();
		scheduleMapRefresh({ force: true });
		handleMapStyleLoad();
	});
};

// ✅ Watchers
watch(
	() => props.isDarkMode,
	(newVal) => {
		applyStyleIfNeeded(newVal);
	},
);

watch(
	[
		allowAmbientFx,
		allowNeonPulse,
		allowHeatmap,
		allow3dBuildings,
		allowMapFog,
		allowWeatherFx,
		enableMapEffectsPipelineV2,
	],
	() => {
		if (!map.value || !isMapReady.value) return;
		setupMapLayers();
		if (hasActiveRoute.value) {
			if (allowNeonPulse.value && !isPerfRestricted.value) {
				startRouteTrailAnimation();
			} else {
				stopRouteTrailAnimation();
				applyRouteTrailStatic();
			}
		} else {
			stopRouteTrailAnimation();
		}
		refreshSmartPulseTargets();
		if (allowWeatherFx.value) {
			refreshWeather();
		}
		applyFogSettings();
	},
);

watch([effectiveMotionBudget, isPerfRestricted], () => {
	refreshSmartPulseTargets();
	if (isPerfRestricted.value) {
		resetTrafficDashState();
	}
});

watch(
	[
		isPerfRestricted,
		frameBudgetMissCount,
		longTaskCount,
		enablePerfGuardrailsV2,
	],
	() => {
		syncWebVitalsMapContext();
	},
	{ immediate: true },
);

watch([weatherCondition, isWeatherNight], () => {
	applyFogSettings();
});

watch(
	soundEnabled,
	(enabled) => {
		if (IS_E2E) return;
		if (enabled) {
			attachSoundGestureListener();
			syncSoundZoneFromSelection();
			updateSoundVolumeFromZoom(true);
			return;
		}
		removeSoundGestureListener();
		audio.stop();
	},
	{ immediate: true },
);

watch(selectedShopVisitors, (value) => {
	buildingPopupVisitors.value = Number(value || 0);
});

const shopRefreshSignature = (shops) => {
	if (!Array.isArray(shops) || shops.length === 0) return "";
	let count = 0;
	let sumHash = 0;
	let xorHash = 0;
	const hashRow = (row) => {
		let hash = 2166136261;
		for (let i = 0; i < row.length; i += 1) {
			hash ^= row.charCodeAt(i);
			hash = Math.imul(hash, 16777619) >>> 0;
		}
		return hash >>> 0;
	};
	for (const shop of shops) {
		const id = String(shop?.id ?? "").trim();
		const lat = Number(shop?.lat ?? shop?.latitude);
		const lng = Number(shop?.lng ?? shop?.longitude);
		const status = String(shop?.status ?? "");
		const latSig = Number.isFinite(lat) ? lat.toFixed(4) : "na";
		const lngSig = Number.isFinite(lng) ? lng.toFixed(4) : "na";
		const rowHash = hashRow(`${id}:${latSig}:${lngSig}:${status}`);
		sumHash = (sumHash + rowHash) >>> 0;
		xorHash ^= rowHash;
		count += 1;
	}
	return `${count}:${sumHash.toString(36)}:${(xorHash >>> 0).toString(36)}`;
};

watch(
	() => props.shops,
	(newShops, oldShops) => {
		if (!Array.isArray(newShops)) {
			shopsByIdRef.value = new Map();
			allowedIdsRef.value = null;
			return;
		}
		const nextMap = new Map();
		for (const shop of newShops) {
			const id = String(shop?.id ?? "").trim();
			if (!id) continue;
			nextMap.set(id, shop);
		}
		shopsByIdRef.value = nextMap;
		allowedIdsRef.value =
			newShops.length === 0 ? new Set() : new Set(nextMap.keys());

		const nextSig = shopRefreshSignature(newShops);
		const prevSig = shopRefreshSignature(oldShops);
		if (nextSig === prevSig) return;

		if (props.highlightedShopId != null) {
			const highlightedId = String(props.highlightedShopId);
			const shopInNewList = newShops?.some(
				(s) => String(s.id) === highlightedId,
			);
			if (
				shopInNewList &&
				!oldShops?.some((s) => String(s.id) === highlightedId)
			) {
				updateMarkers();
				scheduleMapRefresh({ allowSameViewport: true });
				return;
			}
		}
		requestUpdateMarkers();
		scheduleMapRefresh({ allowSameViewport: true });
	},
	{ deep: false, immediate: true },
);

watch(
	() => shopStore.collectedCoins,
	() => {
		if (!map.value || !isMapReady.value) return;
		scheduleMapRefresh({ allowSameViewport: true });
	},
	{ deep: false },
);

watch(
	() => props.highlightedShopId,
	async (newId) => {
		await nextTick();
		updateMarkers();
		refreshSmartPulseTargets();
		scheduleMapRefresh({ allowSameViewport: true });
		syncSoundZoneFromSelection();
		syncBuildingInfoPopupFromSelection();
		if (!newId) {
			// Keep pin popup visible (don't call closeActivePopup here)
			// Popup will be replaced when a different shop is selected
			hideBuildingInfoPopup();
			return;
		}
		const shop =
			shopStore.getShopById?.(newId) ||
			props.shops?.find((s) => String(s.id) === String(newId));
		if (shop) {
			// Fix 1H: skip regular popup when giant pin modal is open
			if (!props.isGiantPinView) showPopup(shop);
			buildingPopupShop.value = shop;
			syncBuildingPopupContent(shop);
			updateBuildingInfoPopupPosition(true);
			if (!map.value) return;
			const shopLng = Number(shop.lng);
			const shopLat = Number(shop.lat);
			if (!Number.isFinite(shopLng) || !Number.isFinite(shopLat)) return;
			// ✅ Smooth Pan to Shop — pin ล็อคอยู่กลาง visible area
			const containerH = mapContainer.value?.clientHeight || 600;
			const topPad = Number(props.uiTopOffset || 0);
			const bottomPad = Number(props.uiBottomOffset || 0);
			const visibleH = containerH - topPad - bottomPad;
			const targetPinY = topPad + visibleH * 0.4;
			const offsetY = Math.round(containerH / 2 - targetPinY);
			map.value.flyTo({
				center: [shopLng, shopLat],
				zoom: 16,
				pitch: 60,
				bearing: 0,
				duration: 650,
				essential: true,
				offset: [0, offsetY],
				padding: {
					top: topPad,
					bottom: bottomPad,
					left: 0,
					right: 0,
				},
			});
		}
	},
);

watch(
	[() => props.userLocation, () => props.selectedShopCoords],
	() => {
		updateMapSources();
		updateRoadDirections();
		if (props.userLocation) {
			props.shops?.forEach((shop) => {
				checkCoinCollection(shop);
			});
		}
	},
	{ immediate: true },
);

watch(
	[() => props.buildings, activeEvents],
	() => {
		updateEventMarkers();
	},
	{ deep: true },
);

onMounted(async () => {
	// ⚡ SKIP HEAVY MAP INIT IN E2E
	if (IS_E2E && !IS_STRICT_MAP_E2E) {
		console.log("E2E Mode: Skipping Mapbox Initialization");
		isMapReady.value = true;
		return;
	}

	nowTickInterval = setInterval(() => {
		nowTick.value = Date.now();
	}, 60000);
});

onUnmounted(() => {
	if (SHOULD_EXPOSE_MAP_DEBUG && typeof window !== "undefined") {
		window.__vibecityMapDebug = null;
	}
	mapReadyFallbackArmed.value = false;
	showMapRecoveryHint.value = false;
	mapLoadTimeoutReached.value = false;
	if (mapRecoveryTimeoutId) {
		clearTimeout(mapRecoveryTimeoutId);
		mapRecoveryTimeoutId = null;
	}
	clearCoinLayerRetryTimer();
	coinLayerRetryAttempt = 0;
	if (refreshDebounceTimer) {
		clearTimeout(refreshDebounceTimer);
		refreshDebounceTimer = null;
	}
	if (rafToken) {
		cancelAnimationFrame(rafToken);
		rafToken = null;
	}
	if (resizeRaf) {
		cancelAnimationFrame(resizeRaf);
		resizeRaf = null;
	}
	queuedPinsRefreshForce = false;
	queuedPinsRefreshAllowSameViewport = false;
	lastViewportKey = "";
	lastMapRefreshAt = 0;
	lastForcedMapRefreshAt = 0;
	if (typeof document !== "undefined") {
		document.removeEventListener("visibilitychange", handleVisibilityChange);
	}
	if (typeof window !== "undefined") {
		window.removeEventListener("online", handleNetworkChange);
		window.removeEventListener("offline", handleNetworkChange);
	}
	if (motionMediaQuery) {
		motionMediaQuery.removeEventListener?.("change", handleMotionChange);
		motionMediaQuery = null;
	}
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	if (moveEnhanceRaf) {
		cancelAnimationFrame(moveEnhanceRaf);
		moveEnhanceRaf = null;
	}
	if (pinsAbortController) {
		pinsAbortController.abort();
		pinsAbortController = null;
	}
	if (routeAbortController) {
		routeAbortController.abort();
		routeAbortController = null;
	}
	clearVibeEffectMarkers();

	if (nowTickInterval) {
		clearInterval(nowTickInterval);
		nowTickInterval = null;
	}
	if (trafficRefreshInterval) {
		clearInterval(trafficRefreshInterval);
		trafficRefreshInterval = null;
	}

	teardownMap();
});

defineExpose({
	map,
	isMapReady,
	focusLocation,
	centerOnUser,
	webGLSupported,
	maplessMode,
	initMapOnce,
	resize: () => map.value?.resize(),
	// Handles (options) object or (coords, zoom) legacy signatures.
	flyTo: flyToCore,
});
</script>

<template>
  <div
    data-testid="map-shell"
    :data-map-ready="isMapReady ? 'true' : 'false'"
    :data-map-init-requested="mapInitRequested ? 'true' : 'false'"
    :data-map-token-invalid="isTokenInvalid ? 'true' : 'false'"
    :aria-label="mapA11yLabel"
    :aria-busy="shouldShowMapLoadingSkeleton ? 'true' : 'false'"
    :class="[
      'relative w-full h-full z-0 transition-colors duration-500',
      isDarkMode ? 'bg-[#09090b]' : 'bg-gray-200',
    ]"
  >
    <div
      ref="mapContainer"
      data-testid="map-canvas"
      class="w-full h-full absolute inset-0 opacity-100"
      tabindex="0"
      :aria-label="tt('map.ready', 'Interactive city map')"
    ></div>

    <MapLoadingSkeleton
      v-if="shouldShowMapLoadingSkeleton"
      class="absolute inset-0 z-[1100] pointer-events-none"
    />

    <div
      v-if="isOffline"
      class="absolute top-4 right-4 z-[2300] px-3 py-2 rounded-lg bg-amber-500/85 text-black text-xs font-semibold"
      role="status"
      aria-live="polite"
    >
      {{ $t("common.offline") || "Offline mode" }}
    </div>

    <div
      v-if="showMapRecoveryHint"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-[2200] px-3 py-2 rounded-xl bg-black/75 border border-white/15 backdrop-blur text-xs text-white flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <span>{{ $t("map.loading") }}</span>
      <button
        type="button"
        class="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        :aria-label="$t('common.retry') || 'Retry'"
        @click="handleMapRecovery"
      >
        {{ $t("common.retry") || "Retry" }}
      </button>
      <button
        v-if="mapLoadTimeoutReached"
        type="button"
        class="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        :aria-label="
          $t('map.webgl_error.continue_mapless') || 'Continue list mode'
        "
        @click="continueWithoutMap"
      >
        {{ $t("map.webgl_error.continue_mapless") || "Continue list mode" }}
      </button>
    </div>

    <div
      v-if="allowViewportGlow"
      class="absolute inset-0 z-[2] pointer-events-none viewport-focus-glow"
      :style="{ opacity: viewportGlowOpacity }"
    ></div>

    <!-- Zeppelin removed for cleaner UI -->

    <!-- ✅ WebGL Not Supported Fallback - HIGH Z-INDEX to cover all UI -->
    <div
      v-if="!webGLSupported && !maplessMode"
      class="fixed inset-0 z-[6000] flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-black"
      role="alertdialog"
      aria-modal="true"
      :aria-label="$t('map.webgl_error.title')"
    >
      <div
        class="max-w-md mx-4 p-8 rounded-3xl bg-zinc-800/80 border border-white/10 text-center backdrop-blur-xl shadow-2xl"
      >
        <div
          class="webgl-fallback-icon w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500/30 to-red-500/30 flex items-center justify-center text-5xl animate-pulse"
        >
          🗺️
        </div>
        <h2 class="text-2xl font-black text-white mb-3">
          {{ $t("map.webgl_error.title") }}
        </h2>
        <p class="text-sm text-zinc-300 mb-6 leading-relaxed">
          {{ $t("map.webgl_error.desc") }}
        </p>

        <!-- Instructions -->
        <div
          class="text-left bg-black/30 rounded-xl p-4 mb-6 text-xs text-zinc-400"
        >
          <p class="font-bold text-white mb-2">
            {{ $t("map.webgl_error.fix_title") }}
          </p>
          <ol class="list-decimal list-inside space-y-1">
            <li>
              <code class="bg-white/10 px-1 rounded">chrome://settings</code>
            </li>
            <li>{{ $t("map.webgl_error.step_2") }}</li>
            <li>{{ $t("map.webgl_error.step_3") }}</li>
            <li>{{ $t("map.webgl_error.step_4") }}</li>
          </ol>
        </div>

        <div class="space-y-3">
          <button
            @click="reloadPage"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-xl transition shadow-lg shadow-blue-500/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            🔄 {{ $t("map.webgl_error.reload") }}
          </button>
          <button
            @click="continueWithoutMap"
            class="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold rounded-xl transition shadow-lg shadow-orange-500/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            📱 {{ $t("map.webgl_error.continue_mapless") }}
          </button>
          <a
            href="https://get.webgl.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="block w-full py-3.5 bg-white/10 text-white/80 font-bold rounded-xl hover:bg-white/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            🌐 {{ $t("map.webgl_error.check_webgl") }}
          </a>
        </div>
      </div>
    </div>

    <!-- ✅ Mapless Mode Background -->
    <div
      v-if="maplessMode"
      class="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black"
      role="status"
      aria-live="polite"
    >
      <div class="absolute inset-0 opacity-20">
        <div
          class="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"
        ></div>
        <div
          class="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"
        ></div>
      </div>
      <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white/20"
      >
        <div class="text-6xl mb-2">🗺️</div>
        <p v-if="!webGLSupported" class="text-sm">
          {{ $t("map.mapless.unavailable") }}
        </p>
        <p v-else class="text-sm">{{ $t("map.loading") }}...</p>
      </div>
    </div>

    <!-- ✅ Entertainment Atmosphere Effects (simplified) -->
    <div
      class="absolute inset-0 z-[1] pointer-events-none transition-colors duration-500"
    ></div>

    <div class="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
      <!-- Fireflies -->
      <div v-if="allowAmbientFx" class="firefly-container">
        <div
          v-for="ff in fireflies"
          :key="`firefly-${ff.id}`"
          class="firefly"
          :style="{
            left: ff.left,
            bottom: ff.bottom,
            animationDelay: ff.delay,
            animationDuration: ff.duration,
          }"
        ></div>
      </div>
    </div>

    <div
      class="building-info-popup"
      :class="{
        'is-visible': buildingPopupVisible,
        'scanline-enabled': showPopupScanline,
      }"
      :style="{
        left: `${buildingPopupX}px`,
        transform: `translate(-50%, ${buildingPopupY}px)`,
      }"
      aria-live="polite"
    >
      <div class="building-info-popup__row">
        <span class="building-info-popup__icon">{{
          buildingPopupCategoryIcon
        }}</span>
        <span class="building-info-popup__title">{{ buildingPopupName }}</span>
      </div>
      <div class="building-info-popup__meta">
        <span>{{ $t("map.building.live_visitors") }}</span>
        <strong>{{ buildingPopupVisitors }}</strong>
      </div>
    </div>

    <LiveActivityChips
      v-if="prefs.isLiveChipsEnabled && liveActivityChips.length"
      :chips="liveActivityChips"
      class="absolute top-20 left-3 z-[25] pointer-events-none"
    />

    <!-- ✅ Token Error Overlay -->
    <div
      v-if="isTokenInvalid"
      class="absolute inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      :aria-label="$t('map.token_error.title')"
    >
      <div
        class="max-w-xs p-8 rounded-3xl bg-zinc-900 border border-red-500/30 text-center shadow-2xl"
      >
        <div
          class="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center text-4xl"
        >
          🗺️
        </div>
        <h2 class="text-xl font-black text-white mb-2 uppercase tracking-wider">
          {{ $t("map.token_error.title") }}
        </h2>
        <p class="text-sm text-zinc-400 mb-6 leading-relaxed">
          {{ $t("map.token_error.desc") }}
        </p>
        <button
          @click="reloadPage"
          class="w-full py-3 bg-white text-black font-bold rounded-xl active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {{ $t("map.token_error.check_again") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* Mapbox Popup Overrides */
.mapboxgl-popup {
  position: relative;
  z-index: 3000 !important;
}

.mapboxgl-popup-content {
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 12px !important;
  pointer-events: auto !important;
}

.mapboxgl-popup-tip {
  display: none !important;
}

.vibe-mapbox-popup .mapboxgl-popup-content {
  overflow: visible;
}

.viewport-focus-glow {
  background: radial-gradient(
    circle at 50% 45%,
    rgba(56, 189, 248, 0.1) 0%,
    rgba(15, 23, 42, 0.08) 36%,
    rgba(2, 6, 23, 0.42) 100%
  );
  transition: opacity 220ms ease;
}

/* Coin badge with bounce animation - canonical definition */
.coin-badge {
  position: absolute;
  top: -10px;
  right: -5px;
  font-size: 14px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  z-index: 300;
  animation: bounce-slow 2s infinite ease-in-out;
}

@keyframes bounce-slow {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

/* Coin badge with spin animation - use .coin-badge-spin class where needed */
.coin-badge-spin {
  position: absolute;
  top: -6px;
  left: -6px;
  font-size: 14px;
  animation: coin-spin 3s ease-in-out infinite;
  filter: drop-shadow(0 0 4px rgba(234, 179, 8, 0.8));
}

.vibe-mapbox-popup {
  z-index: 10000 !important;
}

.vibe-popup button {
  pointer-events: auto !important;
  cursor: pointer !important;
  transition:
    transform 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.vibe-popup button:active {
  transform: scale(0.95);
}

/* Custom Marker Styles - GPU Optimized for 60fps */
.vibe-marker {
  z-index: 50;
  will-change: transform;
}

.vibe-marker[data-highlighted="true"] {
  z-index: 200 !important;
}

.vibe-marker[data-highlighted="true"] .marker-wrapper {
  transform: scale(1.2) translateY(-5px);
}

.vibe-marker:hover {
  z-index: 210 !important;
}

.vibe-marker:hover .marker-wrapper {
  transform: scale(1.1);
}

/* Ensure markers clickable */

.marker-aura {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100px;
  height: 100px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(239, 68, 68, 0.25) 0%,
    transparent 70%
  );
  border-radius: 50%;
  animation: aura-pulse 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes aura-pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.3;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0.7;
  }
}

.vibe-marker {
  transition: opacity 0.3s ease;
}

.marker-wrapper {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  animation: marker-pop 0.4s cubic-bezier(0.5, 1, 0.7, 1) forwards;
}

@keyframes marker-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.marker-svg {
  width: 100%;
  height: 100%;
}

/* Premium LIVE Marker Styles */
.vibe-marker-live {
  z-index: 200 !important;
}

.vibe-live-badge,
.vibe-giant-badge {
  pointer-events: none;
}

.live-pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50px;
  height: 50px;
  border: 2px solid #ff2d55;
  border-radius: 50%;
  transform: translate(-50%, -60%);
  animation: live-ring-pulse 1.5s ease-out infinite;
  pointer-events: none;
}

@keyframes live-ring-pulse {
  0% {
    transform: translate(-50%, -60%) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -60%) scale(1.5);
    opacity: 0;
  }
}

/* ✅ Highlight pulse ring for selected markers */
.highlight-pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60px;
  height: 60px;
  border: 3px solid #3b82f6;
  border-radius: 50%;
  transform: translate(-50%, -60%);
  animation: highlight-ring-pulse 1.2s ease-out infinite;
  pointer-events: none;
}

@keyframes highlight-ring-pulse {
  0% {
    transform: translate(-50%, -60%) scale(0.6);
    opacity: 0.8;
  }
  100% {
    transform: translate(-50%, -60%) scale(1.4);
    opacity: 0;
  }
}

.highlighted-marker {
  animation: marker-bounce 0.5s ease-out;
}

@keyframes marker-bounce {
  0% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
  50% {
    transform: translateY(-5px);
  }
  70% {
    transform: translateY(-8px);
  }
  100% {
    transform: translateY(0);
  }
}

.live-label {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #ff2d55, #c9002b);
  color: white;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(255, 45, 85, 0.6);
  animation: live-glow 1s ease-in-out infinite alternate;
  white-space: nowrap;
}

@keyframes live-glow {
  0% {
    box-shadow: 0 2px 8px rgba(255, 45, 85, 0.6);
  }
  100% {
    box-shadow: 0 2px 16px rgba(255, 45, 85, 1);
  }
}

/* Day/Night Overlay */
.day-night-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: background 2s ease;
}

@keyframes slide-up {
  from {
    transform: translateY(100%) scale(0.9);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* Hide Mapbox Logo & Controls Container per requirement */
.mapboxgl-ctrl-bottom-left {
  display: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .webgl-fallback-icon,
  .coin-badge,
  .coin-badge-spin,
  .marker-wrapper,
  .marker-aura,
  .live-pulse-ring,
  .highlight-pulse-ring,
  .highlighted-marker,
  .live-label {
    animation: none !important;
    transition: none !important;
  }

  .vibe-marker[data-highlighted="true"] .marker-wrapper,
  .vibe-marker:hover .marker-wrapper,
  .vibe-popup button:active {
    transform: none !important;
  }
}
</style>
