// --- C:\vibecity.live\src\components\map\MapLibreContainer.vue ---

<script setup>
// Wave 3: Task 3.6 — Parse/eval instrumentation.
// Mark the moment this component's script starts evaluating (before imports settle).
// This captures the time from first script byte to Vue setup() entry.
const _setupStartTime =
	typeof performance !== "undefined" ? performance.now() : 0;
if (typeof performance !== "undefined" && performance.mark) {
	performance.mark("maplibre-container-setup-start");
}

import maplibregl from "maplibre-gl";
// maplibre-gl CSS is imported eagerly in main.js — do NOT re-import here (causes ERR_INSUFFICIENT_RESOURCES in lazy chunks)
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
import { DEFAULT_CITY } from "@/config/cityConfig";
import { MAP_CONFIG } from "@/config/mapConfig";
import { resolveVenueMedia } from "@/domain/venue/viewModel";
import "../../assets/map-atmosphere.css";
import "../../assets/css/map-markers.css";
import {
	resolveMapStyleUrlForMode,
	resolveRuntimeMapStyleMode,
	shouldEnableMapTextLabels,
} from "../../composables/map/mapStyleMode";
import { useMapAtmosphere } from "../../composables/map/useMapAtmosphere";
import { useMapCore } from "../../composables/map/useMapCore";
// useMapHeatmap deferred — loaded after map idle (non-blocking)
import { useMapIdleFeatures } from "../../composables/map/useMapIdleFeatures";
import { useMapImagePrefetch } from "../../composables/map/useMapImagePrefetch";
import { useMapInteractions } from "../../composables/map/useMapInteractions";
import { useMapLayers } from "../../composables/map/useMapLayers";
import { useMapMarkers } from "../../composables/map/useMapMarkers";
import { useMapPopups } from "../../composables/map/useMapPopups";
import { useMapRealtime } from "../../composables/map/useMapRealtime";
import { useMapRenderScheduler } from "../../composables/map/useMapRenderScheduler";
import { useNeonPinsLayer } from "../../composables/map/useNeonPinsLayer";
import { useNeonSignTheme } from "../../composables/map/useNeonSignTheme";
import { useAudioSystem } from "../../composables/useAudioSystem";
import { useHaptics } from "../../composables/useHaptics";
import {
	getDetailSelectionModalGapPx,
	getDetailSelectionTargetRatio,
	getDetailSelectionVisualLiftPx,
	getPreviewPopupClearancePx,
	isNarrowDetailViewport,
} from "../../constants/mapSelectionLayout";
import { Z } from "../../constants/zIndex";
import {
	getApiV1BaseUrl,
	isFrontendOnlyDevMode,
	isLocalBrowserHostname,
} from "../../lib/runtimeConfig";
import {
	clearRuntimeLaneUnavailable,
	isKnownMissingRuntimeLane,
	isRuntimeLaneUnavailable,
	markRuntimeLaneUnavailable,
	RUNTIME_LANES,
} from "../../lib/runtimeLaneAvailability";
// useWeather deferred — loaded after map idle (non-blocking)
import { apiFetch } from "../../services/apiClient";
import { frontendObservabilityService } from "../../services/frontendObservabilityService";
import { useFeatureFlagStore } from "../../store/featureFlagStore";
import { useLocationStore } from "../../store/locationStore";
import { useShopStore } from "../../store/shopStore";
import { useUserPreferencesStore } from "../../store/userPreferencesStore";
import "../../styles/map-atmosphere.css";
import { openExternal } from "../../utils/browserUtils";
import {
	isMapDebugLoggingEnabled,
	mapDebugLog,
	mapDebugWarn,
} from "../../utils/mapDebug";
import { buildMapPinPresentation } from "../../utils/mapPinHierarchy";
import { createPopupHTML } from "../../utils/mapRenderer";
import { applyOrderedNeonLayout } from "../../utils/neonLayoutEngine";
import { isExpectedAbortError } from "../../utils/networkErrorUtils";
import { calculateDistance, calculateShopStatus } from "../../utils/shopUtils";
import LiveActivityChips from "./LiveActivityChips.vue";
import MapLoadingSkeleton from "./MapLoadingSkeleton.vue";

// MapLibre GL does not use mapbox:// style URLs — always use the production neon style by default.
const isLocalBrowserHost = () =>
	typeof window !== "undefined" &&
	isLocalBrowserHostname(window.location.hostname);
const IS_LOCALHOST_BROWSER = isLocalBrowserHost();
const LOCALHOST_STYLE_URL = "/map-styles/vibecity-localhost.json";
const NEON_STYLE_URL = "/map-styles/vibecity-neon.json";
const LOCALHOST_STYLE_MODE =
	String(import.meta.env.VITE_LOCALHOST_MAP_STYLE_MODE || "prod")
		.trim()
		.toLowerCase() === "quiet"
		? "quiet"
		: "prod";
const EXTERNAL_STYLE_OVERRIDE_ALLOWED =
	import.meta.env.DEV &&
	import.meta.env.VITE_ALLOW_EXTERNAL_MAP_STYLE === "true";
const ENV_PRIMARY_STYLE_URL =
	import.meta.env.VITE_MAP_STYLE_URL ||
	import.meta.env.VITE_MAP_STYLE_FALLBACK_URL ||
	"";
const PROD_STYLE_URL = EXTERNAL_STYLE_OVERRIDE_ALLOWED
	? ENV_PRIMARY_STYLE_URL || NEON_STYLE_URL
	: NEON_STYLE_URL;
const STRICT_E2E_STYLE = NEON_STYLE_URL;
const RESOLVED_STYLE_MODE = resolveRuntimeMapStyleMode({
	isLocalhostBrowser: IS_LOCALHOST_BROWSER,
	requestedMode: LOCALHOST_STYLE_MODE,
});
const resolveStyleUrlForMode = (styleMode = RESOLVED_STYLE_MODE) =>
	resolveMapStyleUrlForMode({
		styleMode,
		prodStyleUrl: PROD_STYLE_URL,
		quietStyleUrl: LOCALHOST_STYLE_URL,
		isStrictMapE2E: IS_STRICT_MAP_E2E,
		strictE2EStyleUrl: STRICT_E2E_STYLE,
	});
const PIN_SOURCE_ID = "pins_source";
const PIN_LAYER_ID = "unclustered-pins";
const PIN_HITBOX_LAYER_ID = "unclustered-pins-hitbox";
const SELECTED_PIN_LAYER_ID = "selected-pin-marker";
const DISTANCE_LINE_SOURCE_ID = "distance-line";
const USER_LOCATION_SOURCE_ID = "user-location";
const USER_LOCATION_PULSE_LAYER_ID = "user-location-pulse";
const USER_LOCATION_RING_LAYER_ID = "user-location-ring";
const USER_LOCATION_DOT_LAYER_ID = "user-location-dot";
const THAILAND_AGGREGATE_LEVEL = "country";
const COUNTRY_AGGREGATE_MAX_ZOOM = 6.2;
const PROVINCE_AGGREGATE_MAX_ZOOM = 7.8;
const ZONE_AGGREGATE_MAX_ZOOM = Number(
	MAP_CONFIG?.zoom?.giantPin?.aggregate?.max ?? 14.9,
);
const COUNTRY_DRILLDOWN_ZOOM = 6.9;
const PROVINCE_DRILLDOWN_ZOOM = 8.9;
const ZONE_DRILLDOWN_ZOOM = Math.max(
	Number(MAP_CONFIG?.zoom?.lod?.full?.min ?? 15),
	ZONE_AGGREGATE_MAX_ZOOM + 0.1,
);
const IS_DEV_BUILD = import.meta.env.DEV;
const IS_E2E = import.meta.env.VITE_E2E === "true";
const IS_STRICT_MAP_E2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
const ENABLE_DOM_OVERLAY_MARKERS = IS_E2E || IS_STRICT_MAP_E2E;
const ENABLE_DOM_COIN_MARKERS = false;
const SHOULD_EXPOSE_MAP_DEBUG =
	import.meta.env.DEV || IS_LOCALHOST_BROWSER || IS_E2E || IS_STRICT_MAP_E2E;
const TRAFFIC_RADIUS_KM = 1;
const TRAFFIC_REFRESH_INTERVAL_MS = 30000;
const TRAFFIC_RECOMPUTE_DISTANCE_KM = 0.12;
const TRAFFIC_FLOW_MIN_VISIBLE_ZOOM = Number(
	MAP_CONFIG?.cars?.minVisibleZoom ?? 12,
);
const TRAFFIC_LOCAL_SOURCE_ID = "traffic-roads-local";
const TRAFFIC_NEON_SOURCE_ID = "neon-roads";
const TRAFFIC_BOOTSTRAP_RETRY_DELAY_MS = 800;
const TRAFFIC_BOOTSTRAP_MAX_ATTEMPTS = 24;
const HOT_ROADS_BASE_INTERVAL_MS = 30000;
const HOT_ROADS_LOW_POWER_INTERVAL_MS = 60000;
const HOT_ROADS_MAX_INTERVAL_MS = 120000;
const HOT_ROADS_REQUEST_TIMEOUT_MS = 8000;
const HOT_ROADS_MIN_ZOOM = 8;
const API_V1_BASE_URL = getApiV1BaseUrl();
const MAP_RUNTIME_SAFE_MODE_SESSION_KEY = "vibecity.map.safe-mode-latched";
const SHOULD_FETCH_ROUTE_PROXY =
	!import.meta.env.DEV ||
	import.meta.env.VITE_API_PROXY_DEV === "true" ||
	import.meta.env.VITE_DIRECTIONS_DEV === "true";
const MAP_TEXT_LABELS_ENABLED = shouldEnableMapTextLabels(RESOLVED_STYLE_MODE);

const { t, te, locale } = useI18n();
const tt = (key, fallback) => (te(key) ? t(key) : fallback);
const queueMapIdleTask = (task, timeout = 2500) => {
	if (typeof window === "undefined") return;
	const run = () => {
		void Promise.resolve(task()).catch(() => {});
	};
	if (typeof requestIdleCallback === "function") {
		requestIdleCallback(run, { timeout });
		return;
	}
	setTimeout(run, 32);
};

const shopStore = useShopStore();
const prefs = useUserPreferencesStore();
const featureFlagStore = useFeatureFlagStore();
const enableMapRenderSchedulerV2 = computed(() =>
	featureFlagStore.isEnabled("enable_map_render_scheduler_v2"),
);
const enableMapEffectsPipelineV2 = computed(() =>
	featureFlagStore.isEnabled("enable_map_effects_pipeline_v2"),
);
const enableMapShaderSafeModeV1 = computed(() =>
	featureFlagStore.isEnabled("ff_map_shader_safe_mode_v1"),
);
const enablePerfGuardrailsV2 = computed(() =>
	featureFlagStore.isEnabled("enable_perf_guardrails_v2"),
);
const readLatchedSafeMode = () => {
	if (typeof sessionStorage === "undefined") return false;
	try {
		return sessionStorage.getItem(MAP_RUNTIME_SAFE_MODE_SESSION_KEY) === "1";
	} catch {
		return false;
	}
};
const mapRuntimeSafeModeLatched = ref(readLatchedSafeMode());
const persistLatchedSafeMode = (value) => {
	mapRuntimeSafeModeLatched.value = Boolean(value);
	if (typeof sessionStorage === "undefined") return;
	try {
		if (value) {
			sessionStorage.setItem(MAP_RUNTIME_SAFE_MODE_SESSION_KEY, "1");
			return;
		}
		sessionStorage.removeItem(MAP_RUNTIME_SAFE_MODE_SESSION_KEY);
	} catch {
		// ignore storage failures
	}
};
const shouldBootGodTierLayers = computed(
	() =>
		enableMapEffectsPipelineV2.value &&
		(!enableMapShaderSafeModeV1.value || !mapRuntimeSafeModeLatched.value) &&
		!isPerfRestricted.value &&
		!IS_E2E &&
		!IS_STRICT_MAP_E2E,
);
const styleUrlForTheme = (_isDarkMode) => {
	return resolveStyleUrlForMode();
};

// Wave 3: Task 3.6 — Record parse + setup overhead after stores and composables resolve.
// This measures the time from script-start to when Vue setup() has executed core init.
{
	const _setupEndTime =
		typeof performance !== "undefined" ? performance.now() : 0;
	const _parseOverhead =
		_setupStartTime > 0 ? _setupEndTime - _setupStartTime : 0;
	if (typeof window !== "undefined") {
		window.__mapMetrics = window.__mapMetrics || {};
		window.__mapMetrics.parseOverhead = _parseOverhead;
		window.__mapMetrics.setupStart = _setupStartTime;
		window.__mapMetrics.setupEnd = _setupEndTime;
	}
	if (_parseOverhead > 0) {
		mapDebugLog(
			`[MapLibreContainer] Parse + setup: ${_parseOverhead.toFixed(1)}ms`,
		);
	}
}

// useDollyZoom deferred — loaded after map idle (non-blocking) [Wave 3: Task 3.1]
// useFluidOverlay deferred — dynamic import in onMounted (preserves Vue lifecycle) [Wave 3: Task 3.2]
// useSDFClusters deferred — dynamic import in onMounted (preserves Vue lifecycle) [Wave 3: Task 3.3]
import { socketService } from "../../services/socketService";

// Deferred useVibeEffects — initialized after map idle
const activeVibeEffects = ref([]);
let _vibeEffectsInstance = null;
const triggerVibeEffect = (shop, content) => {
	_vibeEffectsInstance?.triggerVibeEffect?.(shop, content);
};
const { impactFeedback } = useHaptics();
const handleMotionChange = (e) => {
	prefersReducedMotion.value = e.matches;
};
const handlePointerPrecisionChange = (e) => {
	isCoarsePointerPrimary.value = e.matches;
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
	// Only auto-start when geolocation permission was already granted.
	const locationStore = useLocationStore();
	void locationStore.startWatching({ allowPrompt: false }).catch(() => {});
});

// Add Heatmap Layer
// Heatmap layer handled by composable

const props = defineProps({
	shops: Array,
	userLocation: Array,
	isMockLocation: { type: Boolean, default: false },
	highlightedShopId: [Number, String],
	selectionIntent: { type: Object, default: null },
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
	// ✅ When true, suppresses the internal flyTo triggered by highlightedShopId watcher.
	// Set by useAppLogic when it already called smoothFlyTo to avoid a race condition.
	flySkipInternal: { type: Boolean, default: false },
	isDashboardOpen: { type: Boolean, default: false },
});

const mapWrapperStyle = computed(() => ({
	pointerEvents: props.isDashboardOpen ? "none" : "auto",
	willChange: props.isDashboardOpen ? "auto" : "transform",
}));
const shouldShowLocateMeControl = computed(
	() => !maplessMode.value && !props.isDashboardOpen,
);
const locateMeControlStyle = computed(() => ({
	top: `${Math.max(12, Number(props.uiTopOffset || 0) + 8)}px`,
}));

const getMapLifecycleMode = () => {
	if (maplessMode.value) return "mapless";
	return "map";
};

const prefersReducedMotion = ref(false);
let motionMediaQuery = null;
const isCoarsePointerPrimary = ref(false);
let pointerPrecisionMediaQuery = null;
const isPerfRestricted = computed(
	() =>
		prefs.isLowPowerMode || prefs.isReducedMotion || prefersReducedMotion.value,
);
const shouldPreferSmoothMobileRuntime = computed(
	() => isCoarsePointerPrimary.value && effectiveMotionBudget.value !== "full",
);
const runtimeAnimationGuard = computed(
	() => isPerfRestricted.value || shouldPreferSmoothMobileRuntime.value,
);
const mapEffectsEnabled = computed(
	() =>
		(enableMapEffectsPipelineV2.value || import.meta.env.DEV) &&
		(!enableMapShaderSafeModeV1.value || !mapRuntimeSafeModeLatched.value) &&
		!IS_E2E &&
		!IS_STRICT_MAP_E2E,
);
const allowAmbientFx = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isAmbientFxEnabled &&
		!runtimeAnimationGuard.value,
);
const allowNeonPulse = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isNeonPulseEnabled &&
		!runtimeAnimationGuard.value,
);
const allowHeatmap = computed(
	() => mapEffectsEnabled.value && prefs.isHeatmapEnabled,
);
const allowHeatmapAnimation = computed(
	() =>
		allowHeatmap.value &&
		!prefersReducedMotion.value &&
		!shouldPreferSmoothMobileRuntime.value &&
		effectiveMotionBudget.value !== "micro",
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
		!runtimeAnimationGuard.value,
);
const viewportGlowOpacity = ref(0);
const trafficFlowQuality = computed(() => {
	if (!mapEffectsEnabled.value) return "off";
	if (prefs.isReducedMotion || prefersReducedMotion.value) return "off";
	if (isPerfRestricted.value) return "off";
	if (shouldPreferSmoothMobileRuntime.value) return "lite";
	return effectiveMotionBudget.value === "micro" ? "lite" : "full";
});
const allowTrafficFlowFx = computed(() => trafficFlowQuality.value !== "off");
const allowWeatherFx = computed(
	() =>
		mapEffectsEnabled.value &&
		prefs.isWeatherFxEnabled &&
		!runtimeAnimationGuard.value &&
		!isOffline.value,
);
const soundEnabled = computed(() => Boolean(prefs.isSoundEnabled));
const effectiveMotionBudget = computed(() => {
	if (isPerfRestricted.value) return "micro";
	return prefs.motionBudget || "full";
});
const mapLayerEffectsMode = computed(() => {
	if (IS_E2E || IS_STRICT_MAP_E2E) return "off";
	if (runtimeAnimationGuard.value) return "off";
	if (effectiveMotionBudget.value === "micro") return "off";
	return "full";
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

const reportMapLifecycle = (eventType, metadata = {}) => {
	if (IS_E2E || IS_STRICT_MAP_E2E) return;
	void frontendObservabilityService.reportMapLifecycle(eventType, {
		...metadata,
		mode: getMapLifecycleMode(),
		isDarkMode: Boolean(props.isDarkMode),
	});
};

const isShaderCompileLikeError = (error) => {
	const message = String(
		error?.error?.message || error?.message || error || "",
	).toLowerCase();
	return (
		(message.includes("shader") && message.includes("compile")) ||
		message.includes("program link") ||
		message.includes("webgl") ||
		message.includes("sdf clusters failed") ||
		message.includes("fluid overlay failed")
	);
};

const latchMapRuntimeSafeMode = (reason = "runtime_failure", error = null) => {
	if (!enableMapShaderSafeModeV1.value || mapRuntimeSafeModeLatched.value)
		return;
	persistLatchedSafeMode(true);
	reportMapLifecycle("shader_compile_failed", {
		reason,
		message: String(error?.message || error?.error?.message || ""),
	});
};

const emit = defineEmits([
	"select-shop",
	"open-detail",
	"sentient-select",
	"open-building",
	"exit-indoor",
	"open-ride-modal",
	"locate-me",
	"map-ready-change",
	"selection-flight-complete",
]);

const mapContainer = ref(null);
const hasActiveDetailSelection = computed(
	() =>
		Array.isArray(props.selectedShopCoords) &&
		props.selectedShopCoords.length >= 2,
);
const mapContextRecovering = ref(false);
const webglRecoveryAttempts = ref(0);
const MAX_WEBGL_RECOVERY_ATTEMPTS = 2;
let webglRecoveryTimer = null;
let webglRestoreGraceTimer = null;
let detailModalGestureState = null;
const getMapGestureEnabled = (handler) =>
	Boolean(
		handler && typeof handler.isEnabled === "function" && handler.isEnabled(),
	);
const setMapGestureEnabled = (handler, enabled) => {
	if (!handler) return;
	try {
		if (enabled) {
			handler.enable?.();
			return;
		}
		handler.disable?.();
	} catch {
		// Ignore gesture toggles that are unavailable in the current renderer mode.
	}
};
const syncDetailModalMapGestures = (locked) => {
	const mapInstance = map.value;
	if (!mapInstance) return;
	if (locked) {
		if (!detailModalGestureState) {
			detailModalGestureState = {
				scrollZoom: getMapGestureEnabled(mapInstance.scrollZoom),
				boxZoom: getMapGestureEnabled(mapInstance.boxZoom),
				dragRotate: getMapGestureEnabled(mapInstance.dragRotate),
				dragPan: getMapGestureEnabled(mapInstance.dragPan),
				doubleClickZoom: getMapGestureEnabled(mapInstance.doubleClickZoom),
				keyboard: getMapGestureEnabled(mapInstance.keyboard),
				touchZoomRotate: getMapGestureEnabled(mapInstance.touchZoomRotate),
			};
		}
		setMapGestureEnabled(mapInstance.scrollZoom, false);
		setMapGestureEnabled(mapInstance.boxZoom, false);
		setMapGestureEnabled(mapInstance.dragRotate, false);
		setMapGestureEnabled(mapInstance.dragPan, false);
		setMapGestureEnabled(mapInstance.doubleClickZoom, false);
		setMapGestureEnabled(mapInstance.keyboard, false);
		setMapGestureEnabled(mapInstance.touchZoomRotate, false);
		return;
	}
	if (!detailModalGestureState) return;
	setMapGestureEnabled(
		mapInstance.scrollZoom,
		detailModalGestureState.scrollZoom,
	);
	setMapGestureEnabled(mapInstance.boxZoom, detailModalGestureState.boxZoom);
	setMapGestureEnabled(
		mapInstance.dragRotate,
		detailModalGestureState.dragRotate,
	);
	setMapGestureEnabled(mapInstance.dragPan, detailModalGestureState.dragPan);
	setMapGestureEnabled(
		mapInstance.doubleClickZoom,
		detailModalGestureState.doubleClickZoom,
	);
	setMapGestureEnabled(mapInstance.keyboard, detailModalGestureState.keyboard);
	setMapGestureEnabled(
		mapInstance.touchZoomRotate,
		detailModalGestureState.touchZoomRotate,
	);
	detailModalGestureState = null;
};
const isMapOperational = () => {
	const mapInstance = map.value;
	if (!mapInstance || !isMapReady.value || mapContextRecovering.value) {
		return false;
	}
	try {
		return Boolean(mapInstance.isStyleLoaded?.() || mapInstance.loaded?.());
	} catch {
		return false;
	}
};
const getWebglRestoreGraceMs = () => {
	if (!isMapReady.value) {
		return 1200;
	}
	return 900;
};
const scheduleWebglRecovery = (
	reason = "webgl_context_lost",
	delayMs = 180,
) => {
	if (maplessMode.value) return;
	if (webglRecoveryTimer) return;
	if (webglRecoveryAttempts.value >= MAX_WEBGL_RECOVERY_ATTEMPTS) {
		showMapRecoveryHint.value = true;
		mapLoadTimeoutReached.value = true;
		reportMapLifecycle("webgl_recovery_exhausted", {
			reason,
			attempts: webglRecoveryAttempts.value,
		});
		return;
	}

	webglRecoveryAttempts.value += 1;
	reportMapLifecycle("webgl_recovery_scheduled", {
		reason,
		attempt: webglRecoveryAttempts.value,
	});
	webglRecoveryTimer = window.setTimeout(() => {
		webglRecoveryTimer = null;
		teardownMap();
		mapInitRequested.value = false;
		sentientDisposed = false;
		initMapOnce(currentStyleUrl.value);
	}, delayMs);
};
const waitForWebglRestore = (reason = "webgl_context_lost") => {
	if (maplessMode.value) return;
	if (webglRecoveryTimer || webglRestoreGraceTimer) return;
	webglRestoreGraceTimer = window.setTimeout(() => {
		webglRestoreGraceTimer = null;
		const mapInstance = map.value;
		const stillHealthy =
			Boolean(mapInstance) &&
			(isMapReady.value ||
				mapInstance?.loaded?.() ||
				mapInstance?.isStyleLoaded?.());
		if (stillHealthy) {
			showMapRecoveryHint.value = false;
			mapLoadTimeoutReached.value = false;
			return;
		}
		showMapRecoveryHint.value = true;
		scheduleWebglRecovery(reason);
	}, getWebglRestoreGraceMs());
};
const handleWebglContextLost = () => {
	mapContextRecovering.value = true;
	isMapReady.value = false;
	mapReadyReported.value = false;
	reportMapLifecycle("webgl_context_lost", {
		attempt: webglRecoveryAttempts.value + 1,
	});
	waitForWebglRestore("webgl_context_lost");
};
const settleMapAfterContextRestore = (reason = "webgl_context_restored") => {
	let attempts = 0;
	const maxAttempts = 120;
	const settle = () => {
		const mapInstance = map.value;
		if (!mapInstance) return;
		let healthy = false;
		try {
			healthy = Boolean(
				mapInstance.isStyleLoaded?.() || mapInstance.loaded?.(),
			);
		} catch {
			healthy = false;
		}
		if (healthy) {
			mapContextRecovering.value = false;
			showMapRecoveryHint.value = false;
			mapLoadTimeoutReached.value = false;
			webglRecoveryAttempts.value = 0;
			isMapReady.value = true;
			queueMapResize(true);
			scheduleMapRefresh({ force: true, allowSameViewport: true });
			return;
		}
		if (attempts >= maxAttempts) {
			scheduleWebglRecovery(`${reason}_stalled`);
			return;
		}
		attempts += 1;
		requestAnimationFrame(settle);
	};
	requestAnimationFrame(settle);
};
const handleWebglContextRestored = () => {
	if (webglRestoreGraceTimer) {
		clearTimeout(webglRestoreGraceTimer);
		webglRestoreGraceTimer = null;
	}
	if (webglRecoveryTimer) {
		clearTimeout(webglRecoveryTimer);
		webglRecoveryTimer = null;
	}
	showMapRecoveryHint.value = false;
	mapLoadTimeoutReached.value = false;
	reportMapLifecycle("webgl_context_restored", {
		attempt: webglRecoveryAttempts.value,
	});
	if (map.value) {
		settleMapAfterContextRestore("webgl_context_restored");
	}
};
const {
	map,
	isMapReady,
	isMapContentReady,
	mapContentState,
	activeStyleUrl,
	initMap,
} = useMapCore(mapContainer, {
	onContextLost: handleWebglContextLost,
	onContextRestored: handleWebglContextRestored,
	onMapError: (error) => {
		if (error?.kind === "content_ready_timeout") {
			reportMapLifecycle("content_ready_timeout", {
				styleMode: error.styleMode,
				styleUrl: error.styleUrl,
			});
			return;
		}
		if (!isShaderCompileLikeError(error)) return;
		latchMapRuntimeSafeMode("map_error", error);
	},
	styleMode: RESOLVED_STYLE_MODE,
	fallbackStyleUrl: resolveStyleUrlForMode(),
	primaryStyleUrl: resolveStyleUrlForMode(),
});
const publicMapReady = computed(() =>
	Boolean(isMapReady.value && isMapContentReady.value),
);

// ✅ P1: Spatial image prefetcher (v2) — center-priority, adaptive batch, session cache.
// `warmShop` pre-warms a specific shop on hover so tapping it shows images instantly.
const { warmShop } = useMapImagePrefetch(
	map,
	computed(() => props.shops ?? []),
);
// Load non-critical pin sprite prefetching after first paint so map init wins the main thread.
queueMapIdleTask(async () => {
	const mod = await import("../../composables/map/prefetchCriticalPins");
	await mod.prefetchCriticalPins();
}, 3000);
const { scheduleSourceUpdate, frameBudgetMissCount, longTaskCount } =
	useMapRenderScheduler(map, {
		trackLongTasks: true,
	});
const applySourceData = (sourceId, data) => {
	if (!isMapOperational() || !sourceId || !data) return;
	if (enableMapRenderSchedulerV2.value) {
		scheduleSourceUpdate(sourceId, data);
		return;
	}
	// Skip setData during active flyTo — avoids GeoJSON worker tile errors.
	// The refresh will re-run once moveend fires.
	if (map.value.isMoving?.() && map.value.isEasing?.()) return;
	const source = map.value.getSource(sourceId);
	source?.setData?.(data);
};
const buildUserLocationFeatureCollection = () => {
	const lat = Number(props.userLocation?.[0]);
	const lng = Number(props.userLocation?.[1]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return { type: "FeatureCollection", features: [] };
	}
	return {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				properties: {
					isMockLocation: Boolean(props.isMockLocation),
				},
				geometry: {
					type: "Point",
					coordinates: [lng, lat],
				},
			},
		],
	};
};
const buildUserLocationFeatureCollectionFromLngLat = (lngLat) => {
	const lng = Number(lngLat?.[0]);
	const lat = Number(lngLat?.[1]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return { type: "FeatureCollection", features: [] };
	}
	return {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				properties: {
					isMockLocation: Boolean(props.isMockLocation),
				},
				geometry: {
					type: "Point",
					coordinates: [lng, lat],
				},
			},
		],
	};
};
const ensureUserLocationLayers = () => {
	if (!isMapOperational()) return false;
	const mapInstance = map.value;
	if (!mapInstance?.isStyleLoaded?.()) {
		mapInstance?.once?.("style.load", () => {
			if (isMapOperational()) {
				ensureUserLocationLayers();
			}
		});
		return false;
	}

	try {
		if (!mapInstance.getSource(USER_LOCATION_SOURCE_ID)) {
			mapInstance.addSource(USER_LOCATION_SOURCE_ID, {
				type: "geojson",
				data: { type: "FeatureCollection", features: [] },
			});
		}
	} catch (error) {
		mapDebugWarn("User location source setup failed:", error);
		return false;
	}

	const safeAddUserLocationLayer = (layerConfig) => {
		if (mapInstance.getLayer(layerConfig.id)) return;
		try {
			mapInstance.addLayer(layerConfig);
		} catch (error) {
			mapDebugWarn(
				`User location layer setup failed: ${layerConfig.id}`,
				error,
			);
		}
	};

	safeAddUserLocationLayer({
		id: USER_LOCATION_PULSE_LAYER_ID,
		type: "circle",
		source: USER_LOCATION_SOURCE_ID,
		paint: {
			"circle-radius": 24,
			"circle-color": "#60A5FA",
			"circle-opacity": 0.16,
			"circle-blur": 0.35,
			"circle-pitch-scale": "viewport",
			"circle-pitch-alignment": "viewport",
		},
	});
	safeAddUserLocationLayer({
		id: USER_LOCATION_RING_LAYER_ID,
		type: "circle",
		source: USER_LOCATION_SOURCE_ID,
		paint: {
			"circle-radius": 10,
			"circle-color": "#3B82F6",
			"circle-opacity": 0.12,
			"circle-stroke-width": 2.5,
			"circle-stroke-color": "#BFDBFE",
			"circle-stroke-opacity": 0.92,
			"circle-pitch-scale": "viewport",
			"circle-pitch-alignment": "viewport",
		},
	});
	safeAddUserLocationLayer({
		id: USER_LOCATION_DOT_LAYER_ID,
		type: "circle",
		source: USER_LOCATION_SOURCE_ID,
		paint: {
			"circle-radius": 6.5,
			"circle-color": "#2563EB",
			"circle-opacity": 1,
			"circle-stroke-width": 3,
			"circle-stroke-color": "#FFFFFF",
			"circle-stroke-opacity": 0.98,
			"circle-pitch-scale": "viewport",
			"circle-pitch-alignment": "viewport",
		},
	});

	return Boolean(mapInstance.getSource(USER_LOCATION_SOURCE_ID));
};
const mapReadyFallbackArmed = ref(false);
const currentStyleUrl = ref(null);
const selectionSourceLabel = ref("none");
const cameraRequestId = ref("0");
const popupSettleState = ref("idle");
let styleApplySeq = 0;
const showMapRecoveryHint = ref(false);
const mapLoadTimeoutReached = ref(false);
const mapInitStartedAt = ref(0);
const mapReadyReported = ref(false);
let mapRecoveryTimeoutId = null;
let coinLayerRetryTimer = null;
let coinLayerRetryAttempt = 0;
let resizeRaf = null;
let lastResizeAt = 0;
const RESIZE_DEBOUNCE_MS = 120;
const EMPTY_SELECTED_PIN_FILTER = ["==", ["get", "id"], "__none__"];

const initMapOnce = (styleOverride = null) => {
	if (mapInitRequested.value) return;
	if (!mapContainer.value) return;

	mapInitRequested.value = true;
	mapInitStartedAt.value = Date.now();
	mapReadyReported.value = false;
	reportMapLifecycle("init_requested", {
		reason: "initial",
	});

	webGLSupported.value = checkWebGLSupport();
	if (!webGLSupported.value) return;

	if (!ensureMapLibreLoaded()) return;

	// MapLibre GL has no telemetry to disable

	const initialStyleUrl =
		styleOverride ?? styleUrlForTheme(Boolean(props.isDarkMode));
	const startupUserCenter = props.isMockLocation
		? null
		: normalizeUserLocationToCenter(props.userLocation);
	const initialCenter = startupUserCenter || center.value;
	const initialZoom = startupUserCenter
		? Math.max(Number(zoom.value) || 0, USER_LOCATION_STARTUP_ZOOM)
		: zoom.value;
	center.value = initialCenter;
	zoom.value = initialZoom;
	mapUserInteracted.value = false;
	hasAutoCenteredOnUser.value = false;
	mapContextRecovering.value = false;
	currentStyleUrl.value = initialStyleUrl;
	mapTeardownDone = false;
	sentientDisposed = false;
	initMap(initialCenter, initialZoom, initialStyleUrl);
	armStrictStyleGate();
};

const updateSelectedPinLayerFilter = (highlightedId) => {
	if (!map.value || !map.value.getLayer(SELECTED_PIN_LAYER_ID)) return;
	const normalizedId =
		highlightedId !== null && highlightedId !== undefined
			? String(highlightedId).trim()
			: "";
	const filter = normalizedId
		? ["==", ["get", "id"], normalizedId]
		: EMPTY_SELECTED_PIN_FILTER;
	try {
		map.value.setFilter(SELECTED_PIN_LAYER_ID, filter);
	} catch {
		// Ignore transient style races while map is reloading.
	}
};

const maplessMode = ref(false); // User chose to continue without map
let mapTeardownDone = false;
let mapInteractionsInitialized = false;

const teardownMap = () => {
	if (mapTeardownDone) return;
	mapTeardownDone = true;
	progressiveEffectsSeq += 1;
	clearProgressiveEffectsTimer();

	// Cleanup sentient map
	if (sentient) {
		sentient.dispose?.();
		sentient = null;
	}
	sentientDisposed = true;

	// Cleanup god-tier engine layers
	_sdfClusters?.dispose?.();
	_fluidOverlay?.dispose?.();
	_sdfClusters = null;
	_fluidOverlay = null;

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
	autoOpenedPopupIds.clear();
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
		map.value.off("movestart", handleMoveStart3d);
		map.value.off("moveend", handleMoveEnd3d);
		map.value.off("style.load", handleMapStyleLoad);
		map.value.off("click", PIN_LAYER_ID, handlePointClick);
		map.value.off("mouseenter", PIN_LAYER_ID, setPointer);
		map.value.off("mouseleave", PIN_LAYER_ID, resetPointer);
		map.value.off("click", PIN_HITBOX_LAYER_ID, handlePointClick);
		map.value.off("mouseenter", PIN_HITBOX_LAYER_ID, setPointer);
		map.value.off("mouseleave", PIN_HITBOX_LAYER_ID, resetPointer);
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
			reportMapLifecycle("load_timeout", {
				reason: "init_timeout",
				elapsedMs: mapInitStartedAt.value
					? Date.now() - mapInitStartedAt.value
					: 0,
			});
		}
	}, 9000);
};

const handleMapRecovery = () => {
	showMapRecoveryHint.value = false;
	mapLoadTimeoutReached.value = false;
	reportMapLifecycle("manual_retry", {
		reason: "recovery_button",
	});
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
	reportMapLifecycle("mapless_enabled", {
		reason: "user_opt_in",
	});
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
	pointerPrecisionMediaQuery = window.matchMedia(
		"(hover: none) and (pointer: coarse)",
	);
	prefersReducedMotion.value = motionMediaQuery.matches;
	isCoarsePointerPrimary.value = pointerPrecisionMediaQuery.matches;
	motionMediaQuery.addEventListener?.("change", handleMotionChange);
	pointerPrecisionMediaQuery.addEventListener?.(
		"change",
		handlePointerPrecisionChange,
	);
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
	loadMapImages,
	setCyberpunkAtmosphere,
	upsertTrafficRoads,
	stopCarAnimation,
	ensureCoinAnimation,
	upsertCoinLayer,
	removeCoinLayer,
	stopCoinAnimation,
	// Wave 2: Task 2.3 — split layer API
	addCriticalLayers,
	addDeferredLayers,
	addNeonSignLayers,
} = useMapLayers(map, {
	effectsMode: () => mapLayerEffectsMode.value,
	trafficFlowQuality: () => trafficFlowQuality.value,
	trafficMinVisibleZoom: Number(MAP_CONFIG?.cars?.minVisibleZoom ?? 12),
	scheduler: (sourceId, data) => applySourceData(sourceId, data),
	coinMinZoom: 0,
	renderTextLabels: MAP_TEXT_LABELS_ENABLED,
});

const {
	markersMap,
	coinMarkersMap,
	eventMarkersMap,
	updateMarkers: updateMarkersCore,
	updateEventMarkers: updateEventMarkersCore,
} = useMapMarkers(map);

// Initialize neon sign theme composable
const { toNeonFeatureProperties } = useNeonSignTheme();
const NEON_FEATURE_EXPERIMENT_ID = "stable";
const NEON_FEATURE_SIGNATURE_VERSION = "2-stable";
const NEON_FEATURE_CLIENT_VERSION =
	import.meta.env.VITE_APP_VERSION || "unknown";
const neonFeaturePropsCache = new Map();
const getCachedNeonFeatureProperties = (shop) => {
	if (!shop || typeof shop !== "object") return {};
	const shopId = String(shop.id ?? shop.shop_id ?? "").trim();
	const options = {
		selectedShopId: props.highlightedShopId,
		experimentId: NEON_FEATURE_EXPERIMENT_ID,
		signatureVersion: NEON_FEATURE_SIGNATURE_VERSION,
		clientVersion: NEON_FEATURE_CLIENT_VERSION,
	};
	if (!shopId) {
		return toNeonFeatureProperties(shop, options);
	}
	const lat = Number(shop.lat ?? shop.latitude);
	const lng = Number(shop.lng ?? shop.longitude);
	const cacheKey = [
		String(props.highlightedShopId ?? ""),
		String(shop.name ?? shop.title ?? ""),
		String(shop.status ?? shop.state ?? ""),
		String(shop.pin_state ?? ""),
		String(shop.category ?? shop.primary_category ?? shop.type ?? ""),
		String(shop.city_zone ?? shop.cityZone ?? shop.zone ?? shop.district ?? ""),
		String(shop.visibility_score ?? shop.visibilityScore ?? ""),
		String(shop.boost ?? shop.boost_active ?? shop.is_boost_active ?? ""),
		Number.isFinite(lat) ? lat.toFixed(4) : "na",
		Number.isFinite(lng) ? lng.toFixed(4) : "na",
	].join("|");
	const cached = neonFeaturePropsCache.get(shopId);
	if (cached?.key === cacheKey) {
		return cached.value;
	}
	const nextValue = toNeonFeatureProperties(shop, options);
	neonFeaturePropsCache.set(shopId, {
		key: cacheKey,
		value: nextValue,
	});
	return nextValue;
};

import {
	getMapPins,
	getMapProvinceAggregates,
} from "../../services/shopService";

const zoom = ref(
	Number.isFinite(Number(DEFAULT_CITY.defaultZoom))
		? Number(DEFAULT_CITY.defaultZoom)
		: 17.5,
);
const center = ref([DEFAULT_CITY.lng, DEFAULT_CITY.lat]);
const USER_LOCATION_STARTUP_ZOOM = 16.2;

const mapInitRequested = ref(false);
const mapUserInteracted = ref(false);
const hasAutoCenteredOnUser = ref(false);
const normalizeUserLocationToCenter = (loc) => {
	if (!Array.isArray(loc) || loc.length < 2) return null;
	const lat = Number(loc[0]);
	const lng = Number(loc[1]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
	return [lng, lat];
};

watch(
	() => props.userLocation,
	(newLoc) => {
		const newCenter = normalizeUserLocationToCenter(newLoc);
		if (!newCenter) return;
		if (props.isMockLocation) {
			center.value = newCenter;
			return;
		}

		if (!mapInitRequested.value || !isMapReady.value) {
			center.value = newCenter;
			zoom.value = Math.max(
				Number(zoom.value) || 0,
				USER_LOCATION_STARTUP_ZOOM,
			);
			return;
		}
		if (!map.value || mapUserInteracted.value || hasAutoCenteredOnUser.value) {
			return;
		}

		const mapCenter = map.value.getCenter?.();
		const currentLat = Number(mapCenter?.lat);
		const currentLng = Number(mapCenter?.lng);
		const targetLat = Number(newCenter[1]);
		const targetLng = Number(newCenter[0]);
		const movedKm =
			Number.isFinite(currentLat) && Number.isFinite(currentLng)
				? calculateDistance(currentLat, currentLng, targetLat, targetLng)
				: Number.POSITIVE_INFINITY;
		if (movedKm < 0.08) {
			hasAutoCenteredOnUser.value = true;
			return;
		}

		try {
			map.value.flyTo({
				center: newCenter,
				zoom: Math.max(
					Number(map.value.getZoom?.() || 0),
					USER_LOCATION_STARTUP_ZOOM,
				),
				pitch: 60,
				bearing: bearing.value,
				speed: 0.5,
				curve: 1.45,
				essential: true,
			});
			hasAutoCenteredOnUser.value = true;
		} catch (e) {
			mapDebugWarn("MapLibre flyTo failed on location update:", e);
		}
	},
	{ immediate: true, deep: false },
);

const pitch = ref(60);
const bearing = ref(-17.6);
const mapLoaded = ref(false);
const activePopup = shallowRef(null);
const activePopupShopId = ref("");
const autoOpenedPopupIds = new Set();
const normalizePopupShopId = (value) => String(value ?? "").trim();
const nowTick = ref(Date.now());
let nowTickInterval = null;
let progressiveEffectsSeq = 0;
let progressiveEffectsTimer = null;
let routeAbortController = null;
const currentMapZoom = ref(zoom.value);
// ✅ shallowRef: this Map holds 100s of shop objects — deep Vue tracking causes
// GC spikes on every MapLibre operation that reads from it. shallowRef eliminates this.
const shopsByIdRef = shallowRef(new Map());
const allowedIdsRef = ref(null);
const vibeMarkersMap = new Map();
const clearVibeEffectMarkers = () => {
	for (const marker of vibeMarkersMap.values()) {
		marker?.remove?.();
	}
	vibeMarkersMap.clear();
};

// Deferred useMapHeatmap — initialized after map idle
let _heatmapInstance = null;
const updateHeatmapData = (data) => {
	_heatmapInstance?.updateHeatmapData?.(data);
};
const addHeatmapLayer = () => {
	_heatmapInstance?.addHeatmapLayer?.();
};
const removeHeatmapLayer = () => {
	_heatmapInstance?.removeHeatmapLayer?.();
};

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
// Deferred useWeather — initialized after map idle
let _weatherInstance = null;
const weatherCondition = ref(null);
const isWeatherNight = ref(false);
const deferredFeatureWatchStops = [];
let deferredFeaturesDisposed = false;
const registerDeferredFeatureWatch = (...args) => {
	const stop = watch(...args);
	deferredFeatureWatchStops.push(stop);
	return stop;
};
const stopDeferredFeatureWatches = () => {
	while (deferredFeatureWatchStops.length > 0) {
		const stop = deferredFeatureWatchStops.pop();
		stop?.();
	}
};
const refreshWeather = () => {
	_weatherInstance?.refresh?.();
};

// Audio Sync Watcher (Restored)
watch(weatherCondition, (newVal) => {
	if (soundEnabled.value && !IS_E2E) {
		audio.setWeather(newVal);
	}
});

// watch([weatherCondition, isMapReady], updateWeatherVisuals); // Moved to composable
// Watch for sound pref changes to re-sync

// ── Initialize God-Tier engine layers once on mount (NOT inside watcher —
// useSDFClusters / useFluidOverlay call onUnmounted internally, which
// must be registered from setup/onMounted context, NOT from a watcher cb)
onMounted(() => {
	ensureGodTierLayersScheduled();
});
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
	runtimeAnimationGuard,
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
	// Wave 2: Task 2.3 — deferred terrain application
	applyTerrainAndAtmosphere,
} = useMapAtmosphere(map, isMapReady, {
	allowAmbientFx,
	allowNeonPulse,
	allowWeatherFx,
	allowMapFog,
	isPerfRestricted: runtimeAnimationGuard,
	weatherCondition,
	isWeatherNight,
	shouldRunAtmosphere,
});

// Wave 2: Task 2.5 — Idle task queue for deferred map work
const { scheduleIdleTask, executeIdleTasksOnce } = useMapIdleFeatures();

// Route neon trail state (Keep here or extract later)
let routeTrailTimer = null;
let routeTrailFrame = 0;
const hasActiveRoute = ref(false);
const lastTrafficCenter = ref(null);
const lastTrafficRefreshAt = ref(0);
const lastTrafficZoom = ref(null);
let trafficRefreshInterval = null;
let trafficBootstrapTimer = null;
let hotRoadPollTimer = null;
const hotRoadSnapshotId = ref("");
const hotRoadPollFailures = ref(0);
const ROUTE_TRAIL_DASH_FRAMES = [
	[1.2, 2.2],
	[0.8, 2.6],
	[0.4, 3.0],
	[0.8, 2.6],
];

const normalizeTrafficAnchor = (locationLike) => {
	const lat = Number(locationLike?.lat ?? locationLike?.[0]);
	const lng = Number(locationLike?.lng ?? locationLike?.[1]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
};

const hasTrafficAnchorShifted = (
	nextAnchor,
	prevAnchor,
	thresholdKm = TRAFFIC_RECOMPUTE_DISTANCE_KM,
) => {
	if (!nextAnchor && !prevAnchor) return false;
	if (!nextAnchor || !prevAnchor) return true;
	return (
		calculateDistance(
			prevAnchor.lat,
			prevAnchor.lng,
			nextAnchor.lat,
			nextAnchor.lng,
		) >= thresholdKm
	);
};

const resolveTrafficAnchor = () => {
	const userAnchor = normalizeTrafficAnchor(props.userLocation);
	if (userAnchor) return userAnchor;

	const mapCenter = map.value?.getCenter?.();
	const centerLat = Number(mapCenter?.lat);
	const centerLng = Number(mapCenter?.lng);
	if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
		return { lat: centerLat, lng: centerLng };
	}
	return null;
};

// Realtime logic handled by composable

// Pulse logic handled by composable

const refreshTrafficSubset = async ({ force = false } = {}) => {
	if (!map.value || !isMapReady.value) return;
	if (!allowTrafficFlowFx.value) {
		stopCarAnimation();
		lastTrafficCenter.value = null;
		lastTrafficRefreshAt.value = Date.now();
		lastTrafficZoom.value = null;
		return;
	}
	const anchor = resolveTrafficAnchor();

	if (!anchor) {
		lastTrafficCenter.value = null;
		lastTrafficRefreshAt.value = Date.now();
		lastTrafficZoom.value = null;
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
	const currentZoom = Number(map.value?.getZoom?.() ?? 0);
	const previousZoom = Number(lastTrafficZoom.value);
	const crossedTrafficZoomThreshold =
		Number.isFinite(currentZoom) &&
		currentZoom >= TRAFFIC_FLOW_MIN_VISIBLE_ZOOM &&
		(!Number.isFinite(previousZoom) ||
			previousZoom < TRAFFIC_FLOW_MIN_VISIBLE_ZOOM);
	const missingTrafficLayers =
		Number.isFinite(currentZoom) &&
		currentZoom >= TRAFFIC_FLOW_MIN_VISIBLE_ZOOM &&
		!(
			map.value?.getLayer?.("road-flow-core") &&
			map.value?.getSource?.("road-flow-cars")
		);
	const shouldForceTrafficRefresh =
		force || crossedTrafficZoomThreshold || missingTrafficLayers;

	if (
		!shouldForceTrafficRefresh &&
		movedKm < TRAFFIC_RECOMPUTE_DISTANCE_KM &&
		!stale
	)
		return;

	lastTrafficCenter.value = { lat: anchor.lat, lng: anchor.lng };
	lastTrafficRefreshAt.value = now;
	lastTrafficZoom.value = Number.isFinite(currentZoom) ? currentZoom : null;
	await upsertTrafficRoads({
		userLocation: { lat: anchor.lat, lng: anchor.lng },
		radiusKm: TRAFFIC_RADIUS_KM,
		force: shouldForceTrafficRefresh,
	});
};

const clearHotRoadPollTimer = () => {
	if (!hotRoadPollTimer) return;
	clearTimeout(hotRoadPollTimer);
	hotRoadPollTimer = null;
};

const computeHotRoadPollInterval = () => {
	if (isDocumentHidden.value || isOffline.value) return null;
	const lowPowerMode =
		props.isLowPowerMode || prefs.isReducedMotion || prefersReducedMotion.value;
	const base = lowPowerMode
		? HOT_ROADS_LOW_POWER_INTERVAL_MS
		: HOT_ROADS_BASE_INTERVAL_MS;
	return Math.min(
		HOT_ROADS_MAX_INTERVAL_MS,
		base * 2 ** Math.min(2, hotRoadPollFailures.value),
	);
};

const buildHotRoadBboxParam = () => {
	const bounds = map.value?.getBounds?.();
	if (!bounds) return null;
	const west = Number(bounds.getWest?.());
	const south = Number(bounds.getSouth?.());
	const east = Number(bounds.getEast?.());
	const north = Number(bounds.getNorth?.());
	const values = [west, south, east, north];
	if (!values.every(Number.isFinite)) return null;
	if (west >= east || south >= north) return null;
	return values.join(",");
};

const scheduleHotRoadPoll = ({ immediate = false } = {}) => {
	clearHotRoadPollTimer();
	const interval = computeHotRoadPollInterval();
	if (interval === null) return;
	if (immediate) {
		void pollHotRoads();
		return;
	}
	hotRoadPollTimer = setTimeout(() => {
		void pollHotRoads();
	}, interval);
};

const pollHotRoads = async () => {
	// ปิดการเรียก hot-roads API ใน dev mode เพื่อหลีกเลี่ยง CORS error
	if (import.meta.env.DEV) {
		scheduleHotRoadPoll();
		return;
	}

	if (!map.value || !isMapReady.value) {
		scheduleHotRoadPoll();
		return;
	}
	if (isDocumentHidden.value || isOffline.value) {
		clearHotRoadPollTimer();
		return;
	}
	const zoomValue = Number(map.value.getZoom?.() ?? 0);
	if (!Number.isFinite(zoomValue) || zoomValue < HOT_ROADS_MIN_ZOOM) {
		scheduleHotRoadPoll();
		return;
	}
	const bbox = buildHotRoadBboxParam();
	if (!bbox) {
		scheduleHotRoadPoll();
		return;
	}
	if (
		isRuntimeLaneUnavailable(RUNTIME_LANES.hotRoads) ||
		isKnownMissingRuntimeLane(RUNTIME_LANES.hotRoads, API_V1_BASE_URL)
	) {
		scheduleHotRoadPoll();
		return;
	}

	const params = new URLSearchParams({ bbox });
	if (hotRoadSnapshotId.value) {
		params.set("since", hotRoadSnapshotId.value);
	}

	try {
		const response = await apiFetch(`/hot-roads?${params.toString()}`, {
			includeVisitor: false,
			timeoutMs: HOT_ROADS_REQUEST_TIMEOUT_MS,
		});
		if (!response.ok) {
			if ([404, 405, 429, 500, 502, 503, 504].includes(response.status)) {
				markRuntimeLaneUnavailable(RUNTIME_LANES.hotRoads);
			}
			throw new Error(String(response.status));
		}
		const payload = await response.json().catch(() => null);
		if (!payload || typeof payload !== "object") {
			throw new Error("HOT_ROADS_PAYLOAD_INVALID");
		}
		clearRuntimeLaneUnavailable(RUNTIME_LANES.hotRoads);
		hotRoadSnapshotId.value =
			typeof payload.snapshot_id === "string" ? payload.snapshot_id : "";
		hotRoadPollFailures.value = 0;

		const segments = Array.isArray(payload.segments) ? payload.segments : [];
		if (!payload.unchanged) {
			if (typeof window !== "undefined") {
				window.__vibecityHotRoads = {
					snapshotId: hotRoadSnapshotId.value,
					segmentCount: segments.length,
					updatedAt: Date.now(),
				};
			}
			void frontendObservabilityService.reportMapLifecycle("hot_roads_update", {
				segments: segments.length,
			});
		}
	} catch (error) {
		// Fail silently ใน dev mode
		if (!import.meta.env.DEV) {
			hotRoadPollFailures.value = Math.min(3, hotRoadPollFailures.value + 1);
			if (navigator.onLine) {
				markRuntimeLaneUnavailable(RUNTIME_LANES.hotRoads);
			}
			void frontendObservabilityService.reportFrontendGuardrail(
				"hot_roads_poll_error",
				{
					failures: hotRoadPollFailures.value,
					reason: String(error?.message || "unknown").slice(0, 80),
				},
			);
		}
	}

	scheduleHotRoadPoll();
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

const shouldDeferHeavyEffectsUntilInteraction = () =>
	!mapUserInteracted.value &&
	(IS_LOCALHOST_BROWSER || shouldPreferSmoothMobileRuntime.value);

const runProgressiveHeavyEffects = (seq) => {
	if (!map.value || !isMapReady.value) return;
	if (seq !== progressiveEffectsSeq) return;
	if (shouldDeferHeavyEffectsUntilInteraction()) {
		removeHeatmapLayer();
		stopAtmosphereLoop();
		removeFirefliesLayer();
		resetTrafficDashState();
		stopRouteTrailAnimation();
		applyRouteTrailVisibility();
		applyFogSettings();
		if (allowWeatherFx.value) {
			updateWeatherVisuals();
		}
		return;
	}
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

const scheduleProgressiveHeavyEffects = ({ immediate = false } = {}) => {
	if (!map.value || !isMapReady.value) return;
	const mapInstance = map.value;
	const seq = ++progressiveEffectsSeq;
	const deferUntilInteraction = shouldDeferHeavyEffectsUntilInteraction();
	const primaryDelayMs = immediate ? 60 : deferUntilInteraction ? 2600 : 1200;
	const idleDelayMs = immediate ? 40 : deferUntilInteraction ? 900 : 140;

	clearProgressiveEffectsTimer();
	progressiveEffectsTimer = window.setTimeout(() => {
		progressiveEffectsTimer = null;
		runProgressiveHeavyEffects(seq);
	}, primaryDelayMs);

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
		}, idleDelayMs);
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
let lastGoodProvinceAggregateFeatures = [];
let pinsAbortController = null; // AbortController to cancel stale getMapPins requests
let mapPinsRpcDisabledUntil = 0;
let isPinsRefreshInFlight = false;
let queuedPinsRefreshForce = false;
let queuedPinsRefreshAllowSameViewport = false;
let queuedPinsRefreshLocalOnly = false;

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
	const localOnly =
		Boolean(options) &&
		typeof options === "object" &&
		"localOnly" in options &&
		Boolean(options.localOnly);

	if (!isMapOperational()) return;
	if (props.isGiantPinView) return;
	if (refreshDebounceTimer) {
		clearTimeout(refreshDebounceTimer);
	}

	refreshDebounceTimer = setTimeout(() => {
		refreshDebounceTimer = null;
		if (!isMapOperational()) return;

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
				queuedPinsRefreshLocalOnly = queuedPinsRefreshLocalOnly || localOnly;
				return;
			}
			isPinsRefreshInFlight = true;
			Promise.resolve(refreshPins({ localOnly })).finally(() => {
				isPinsRefreshInFlight = false;
				if (
					queuedPinsRefreshForce ||
					queuedPinsRefreshAllowSameViewport ||
					queuedPinsRefreshLocalOnly
				) {
					const nextForce = queuedPinsRefreshForce;
					const nextAllowSameViewport =
						queuedPinsRefreshAllowSameViewport || nextForce;
					const nextLocalOnly = queuedPinsRefreshLocalOnly && !nextForce;
					queuedPinsRefreshForce = false;
					queuedPinsRefreshAllowSameViewport = false;
					queuedPinsRefreshLocalOnly = false;
					scheduleMapRefresh(
						nextForce
							? { force: true }
							: {
									allowSameViewport: nextAllowSameViewport,
									localOnly: nextLocalOnly,
								},
					);
				}
			});
		});
	}, MAP_REFRESH_DEBOUNCE_MS);
};

const normalizeMapPinId = (value) => String(value ?? "").trim();

const isAllowedMapPinId = (id, allowedIds = allowedIdsRef.value) => {
	const idStr = normalizeMapPinId(id);
	if (!idStr) return false;
	if (allowedIds === null) return true;
	return allowedIds.has(idStr);
};

const isCoinCollectedForId = (id) => {
	const collected = shopStore.collectedCoins;
	if (!collected?.has) return false;
	if (collected.has(id)) return true;
	const idStr = normalizeMapPinId(id);
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

const resolveFeaturePinState = ({ pin_state, pin_type, is_event, status }) => {
	const aggregateStates = new Set([
		THAILAND_AGGREGATE_LEVEL,
		"province",
		"zone",
	]);
	const pinStateRaw = String(pin_state || "")
		.trim()
		.toLowerCase();
	const pinTypeRaw = String(pin_type || "")
		.trim()
		.toLowerCase();
	const statusRaw = String(status || "")
		.trim()
		.toLowerCase();
	if (aggregateStates.has(pinStateRaw)) return pinStateRaw;
	const eventLike =
		Boolean(is_event) ||
		pinStateRaw === "event" ||
		pinTypeRaw === "event" ||
		pinTypeRaw === "giant";
	if (eventLike) return "event";
	const liveLike = pinStateRaw === "live" || statusRaw === "live";
	if (liveLike) return "live";
	if (
		pinStateRaw === "open" ||
		statusRaw === "open" ||
		statusRaw === "active"
	) {
		return "open";
	}
	if (pinStateRaw === "tonight" || statusRaw === "tonight") {
		return "tonight";
	}
	return "off";
};

const pinStateFromStatus = (statusValue) => {
	const s = String(statusValue || "")
		.trim()
		.toUpperCase();
	if (s === "LIVE") return "live";
	if (s === "ACTIVE" || s === "OPEN") return "open";
	if (s === "TONIGHT") return "tonight";
	return "off";
};

const resolveShopScheduleStatus = (shop) => {
	if (!shop || typeof shop !== "object") return "OFF";
	const now = new Date(nowTick.value);
	const manualStatus = String(
		shop.originalStatus ?? shop.statusRaw ?? shop.status ?? "",
	)
		.trim()
		.toUpperCase();
	try {
		return String(
			calculateShopStatus({ ...shop, originalStatus: manualStatus }, now),
		).toUpperCase();
	} catch {
		return manualStatus || "OFF";
	}
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
	shop,
	province,
	district,
	aggregate_level,
	aggregate_shop_count,
	aggregate_dominant_count,
	promotion_score,
	sign_scale,
	pin_metadata,
	extraProperties = {},
}) => {
	const latNum = Number(lat);
	const lngNum = Number(lng);
	if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
	if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
		return null;
	}

	const idStr = normalizeMapPinId(id);
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
	const neonProps = shop ? getCachedNeonFeatureProperties(shop) : {};

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
			is_live: normalizedPinState === "live" || liveVenueRefs.value.has(idStr),
			status:
				String(status || "")
					.trim()
					.toUpperCase() ||
				{
					country: "COUNTRY",
					province: "PROVINCE",
					zone: "ZONE",
					live: "LIVE",
					open: "ACTIVE",
					tonight: "TONIGHT",
				}[normalizedPinState] ||
				"OFF",
			vibe_score: Number(visibility_score ?? 0) || 0,
			image: image || null,
			province: province ?? shop?.province ?? shop?.Province ?? null,
			district: district ?? shop?.district ?? shop?.Zone ?? null,
			aggregate_level: aggregate_level || null,
			aggregate_shop_count: Number(aggregate_shop_count ?? 0) || 0,
			aggregate_dominant_count: Number(aggregate_dominant_count ?? 0) || 0,
			promotion_score: Number(promotion_score ?? 0) || 0,
			sign_scale: Number(sign_scale ?? 1) || 1,
			pin_metadata: pin_metadata ?? null,
			...neonProps,
			...extraProperties,
		},
	};
};

const toFeatureMediaProps = (source) => {
	const media = resolveVenueMedia(source || {});

	return {
		image: media.primaryImage || null,
		extraProperties: {
			real_media: Array.isArray(source?.real_media)
				? source.real_media
				: Array.isArray(source?.realMedia)
					? source.realMedia
					: Array.isArray(source?.media_items)
						? source.media_items
						: null,
			media: source?.media ?? null,
			media_counts:
				source?.media_counts ??
				source?.mediaCounts ??
				source?.counts ??
				media.counts,
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
	const scheduleStatus = resolveShopScheduleStatus(shop);
	const schedulePinState = pinStateFromStatus(scheduleStatus);
	const mediaProps = toFeatureMediaProps(shop);

	return toPinFeature({
		id: shop.id,
		name: shop.name,
		lat: shop.lat ?? shop.latitude,
		lng: shop.lng ?? shop.longitude,
		pin_type: isGiant ? "giant" : pinTypeRaw || "normal",
		pin_state: isGiant ? "event" : schedulePinState,
		verified: shop.is_verified || shop.verifiedActive || shop.verified_active,
		glow: shop.is_glowing || shop.glowActive || shop.glow_active,
		boost: shop.is_boost_active || shop.boostActive || shop.boost_active,
		giant: isGiant || shop.giant_active,
		has_coin: resolvePinHasCoin(shop.id, shop.has_coin ?? shop.hasCoin),
		visibility_score: shop.visibility_score ?? shop.visibilityScore,
		image: mediaProps.image,
		status: scheduleStatus,
		is_event: isGiant || Boolean(shop.is_event),
		is_live: scheduleStatus === "LIVE",
		shop,
		province: shop.province ?? shop.Province,
		district: shop.district ?? shop.Zone,
		extraProperties: mediaProps.extraProperties,
	});
};

const pinFeatureFromRpc = (pin) => {
	if (!pin) return null;
	const mediaProps = toFeatureMediaProps(pin);
	return toPinFeature({
		id: pin.id,
		name: pin.name,
		lat: pin.lat,
		lng: pin.lng,
		pin_type: pin.pinType || pin.pin_type,
		pin_state: pin.pinState || pin.pin_state,
		verified: pin.verifiedActive,
		glow: pin.glowActive,
		boost: pin.boostActive,
		giant: pin.giantActive,
		has_coin: resolvePinHasCoin(pin.id, pin.hasCoin ?? pin.has_coin),
		visibility_score: pin.visibilityScore,
		image: mediaProps.image || pin.coverImage,
		status: pin.status,
		is_event: pin.isEvent || pin.is_event,
		is_live: pin.isLive || pin.is_live,
		province: pin.province,
		district: pin.district ?? pin.zone,
		aggregate_level: pin.aggregateLevel || pin.aggregate_level,
		aggregate_shop_count: pin.aggregateShopCount ?? pin.aggregate_shop_count,
		aggregate_dominant_count:
			pin.aggregateDominantCount ?? pin.aggregate_dominant_count,
		promotion_score: pin.promotionScore ?? pin.promotion_score,
		sign_scale: pin.signScale ?? pin.sign_scale,
		pin_metadata: pin.pinMetadata ?? pin.pin_metadata,
		extraProperties: mediaProps.extraProperties,
	});
};

const ensureHighlightedShop = (features = [], shops = []) => {
	const highlightedId =
		props.highlightedShopId != null
			? normalizeMapPinId(props.highlightedShopId)
			: null;
	if (!highlightedId) return features;
	const shop =
		shops.find((entry) => normalizeMapPinId(entry?.id) === highlightedId) ||
		shopStore.getShopById?.(highlightedId);
	const feature = pinFeatureFromShop(shop);
	if (!feature) return features;

	const next = [...features];
	const idx = next.findIndex(
		(entry) => String(entry?.properties?.id ?? "") === highlightedId,
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
		const id = normalizeMapPinId(feature?.properties?.id);
		if (!id) continue;
		merged.set(id, feature);
	}
	for (const feature of overlayFeatures) {
		const id = normalizeMapPinId(feature?.properties?.id);
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

const maybeEnsureHighlightedShop = ({
	currentZoom,
	shops = [],
	features = [],
}) =>
	currentZoom >= ZONE_AGGREGATE_MAX_ZOOM
		? ensureHighlightedShop(features, shops)
		: features;

const projectMapCoordinate = (coordinates) => {
	if (!map.value || !Array.isArray(coordinates) || coordinates.length < 2) {
		return null;
	}
	try {
		return map.value.project(coordinates);
	} catch {
		return null;
	}
};

const decorateAggregateFeatures = (features = [], fallbackLevel = "zone") =>
	features.map((feature) => {
		const aggregateLevel = String(
			feature?.properties?.aggregate_level || fallbackLevel,
		)
			.trim()
			.toLowerCase();
		const defaultScale =
			aggregateLevel === THAILAND_AGGREGATE_LEVEL
				? 2.45
				: aggregateLevel === "province"
					? 1.9
					: 1.24;
		return {
			...feature,
			properties: {
				...(feature?.properties || {}),
				pin_type: "giant",
				pin_state: aggregateLevel,
				aggregate_level: aggregateLevel,
				is_event: true,
				sign_scale:
					Number(feature?.properties?.sign_scale ?? defaultScale) ||
					defaultScale,
			},
		};
	});

const buildProvinceFallbackFeatures = (features = []) => {
	if (!Array.isArray(features) || features.length === 0) return [];
	return decorateAggregateFeatures(
		buildMapPinPresentation({
			features,
			projector: projectMapCoordinate,
			zoom: 0,
		}).features,
		"province",
	);
};

const buildViewportAggregateFeatures = ({ currentZoom, features = [] }) => {
	if (!Array.isArray(features) || features.length === 0) return [];
	return decorateAggregateFeatures(
		buildMapPinPresentation({
			features,
			projector: projectMapCoordinate,
			zoom: currentZoom,
		}).features,
		"zone",
	);
};

const buildThailandAggregateFeatures = (features = []) => {
	if (!Array.isArray(features) || features.length === 0) return [];
	let weightedLatSum = 0;
	let weightedLngSum = 0;
	let weightSum = 0;
	let shopCount = 0;
	let dominantCount = 0;
	let visibilityScore = 0;
	let hasLive = false;

	for (const feature of features) {
		const lng = Number(feature?.geometry?.coordinates?.[0]);
		const lat = Number(feature?.geometry?.coordinates?.[1]);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
		const bucketWeight =
			Number(feature?.properties?.aggregate_shop_count ?? 1) || 1;
		weightedLatSum += lat * bucketWeight;
		weightedLngSum += lng * bucketWeight;
		weightSum += bucketWeight;
		shopCount += bucketWeight;
		dominantCount +=
			Number(feature?.properties?.aggregate_dominant_count ?? 0) || 0;
		visibilityScore += Number(feature?.properties?.visibility_score ?? 0) || 0;
		hasLive =
			hasLive ||
			String(feature?.properties?.pin_state || "")
				.trim()
				.toLowerCase() === "live";
	}

	if (!weightSum) return [];
	const label = locale.value === "th" ? "ประเทศไทย" : "Thailand";
	const formattedCount = shopCount.toLocaleString(
		locale.value === "th" ? "th-TH" : "en-US",
	);
	const feature = toPinFeature({
		id: "country:thailand",
		name: label,
		lat: weightedLatSum / weightSum,
		lng: weightedLngSum / weightSum,
		pin_type: "giant",
		pin_state: THAILAND_AGGREGATE_LEVEL,
		status: hasLive ? "LIVE" : "COUNTRY",
		is_event: true,
		visibility_score: visibilityScore,
		aggregate_level: THAILAND_AGGREGATE_LEVEL,
		aggregate_shop_count: shopCount,
		aggregate_dominant_count: dominantCount,
		sign_scale: 2.45,
		pin_metadata: {
			aggregate: true,
			aggregate_level: THAILAND_AGGREGATE_LEVEL,
		},
		extraProperties: {
			neon_line1: label,
			neon_line2: `${formattedCount} venues`,
			neon_subline: `${formattedCount} venues`,
		},
	});
	return feature
		? decorateAggregateFeatures([feature], THAILAND_AGGREGATE_LEVEL)
		: [];
};

const reconcileFeatureStatesWithShops = (features = []) =>
	features.map((feature) => {
		const id = normalizeMapPinId(feature?.properties?.id);
		if (!id) return feature;
		const shop = shopsByIdRef.value.get(id) || shopStore.getShopById?.(id);
		if (!shop) return feature;

		const pinType = String(
			feature?.properties?.pin_type ?? shop?.pin_type ?? "",
		).toLowerCase();
		if (pinType === "giant" || pinType === "event") {
			return {
				...feature,
				properties: {
					...(feature?.properties || {}),
					pin_state: "event",
					status: "LIVE",
					is_event: true,
				},
			};
		}

		const scheduleStatus = resolveShopScheduleStatus(shop);
		const schedulePinState = pinStateFromStatus(scheduleStatus);
		return {
			...feature,
			properties: {
				...(feature?.properties || {}),
				pin_state: schedulePinState,
				status: scheduleStatus,
				is_live: scheduleStatus === "LIVE",
			},
		};
	});

const buildFallbackFeaturesFromShopsInBounds = ({
	bounds,
	shops = [],
	allowedIds = allowedIdsRef.value,
}) => {
	if (!shops.length) return [];
	const south = bounds.getSouth();
	const west = bounds.getWest();
	const north = bounds.getNorth();
	const east = bounds.getEast();
	const limit = 5000;
	const features = [];

	for (const shop of shops) {
		if (!isAllowedMapPinId(shop?.id, allowedIds)) continue;
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

const applyFeaturesForRefresh = ({ seq, features = [] }) => {
	if (seq !== pinsRefreshSeq) return;
	if (!map.value) return;
	const reconciled = reconcileFeatureStatesWithShops(features);
	const laidOut = applyOrderedNeonLayout(reconciled, map.value);
	const sourceData = {
		type: "FeatureCollection",
		features: laidOut,
	};

	if (isMapDebugLoggingEnabled()) {
		const featuresWithNeon = laidOut.filter((f) => f?.properties?.neon_key);
		mapDebugLog(
			`[NeonDebug] applyFeatures called with ${laidOut.length} features, ${featuresWithNeon.length} have neon_key`,
		);
		if (featuresWithNeon.length > 0) {
			mapDebugLog(
				"[NeonDebug] Sample feature with neon:",
				featuresWithNeon[0]?.properties,
			);
		}
	}

	applySourceData(PIN_SOURCE_ID, sourceData);
	refreshSmartPulseTargets();
};

const buildProvinceModeFallback = ({
	bounds,
	currentZoom,
	shops = [],
	allowedIds = allowedIdsRef.value,
}) => {
	const cachedProvinceFeatures =
		lastGoodProvinceAggregateFeatures.length > 0
			? lastGoodProvinceAggregateFeatures
			: buildProvinceFallbackFeatures(
					lastGoodPinFeatures.length > 0
						? lastGoodPinFeatures
						: buildFallbackFeaturesFromShopsInBounds({
								bounds,
								shops,
								allowedIds,
							}),
				);
	return currentZoom < COUNTRY_AGGREGATE_MAX_ZOOM
		? buildThailandAggregateFeatures(cachedProvinceFeatures)
		: cachedProvinceFeatures;
};

const buildViewportDisplayFeatures = ({
	currentZoom,
	shops = [],
	features = [],
}) => {
	if (!Array.isArray(features) || features.length === 0) return [];
	return currentZoom < ZONE_AGGREGATE_MAX_ZOOM
		? buildViewportAggregateFeatures({ currentZoom, features })
		: maybeEnsureHighlightedShop({ currentZoom, shops, features });
};

const buildViewportFallbackFeatures = ({
	bounds,
	currentZoom,
	shops = [],
	allowedIds = allowedIdsRef.value,
	sourceFeatures = lastGoodPinFeatures,
}) => {
	const localFallback = buildFallbackFeaturesFromShopsInBounds({
		bounds,
		shops,
		allowedIds,
	});
	return localFallback.length
		? buildViewportDisplayFeatures({
				currentZoom,
				shops,
				features: localFallback,
			})
		: buildViewportDisplayFeatures({
				currentZoom,
				shops,
				features: sourceFeatures,
			});
};

const createRefreshPinsContext = (seq) => ({
	seq,
	bounds: map.value.getBounds(),
	currentZoom: map.value.getZoom(),
	shops: Array.isArray(props.shops) ? props.shops : [],
	allowedIds: allowedIdsRef.value,
});

const refreshPins = async ({ localOnly = false } = {}) => {
	if (!isMapOperational()) return;
	if (props.isGiantPinView) return;

	const seq = ++pinsRefreshSeq;
	const refreshState = createRefreshPinsContext(seq);
	const { bounds, currentZoom, shops, allowedIds } = refreshState;

	if (IS_E2E) {
		const fallback = maybeEnsureHighlightedShop({
			currentZoom,
			shops,
			features: buildFallbackFeaturesFromShopsInBounds({
				bounds,
				shops,
				allowedIds,
			}),
		});
		applyFeaturesForRefresh({ seq, features: fallback });
		return;
	}

	// Cancel any in-flight pin request before starting the next render pass.
	if (pinsAbortController) pinsAbortController.abort();
	pinsAbortController = new AbortController();
	const { signal } = pinsAbortController;

	if (currentZoom < PROVINCE_AGGREGATE_MAX_ZOOM) {
		const immediateProvinceFallback = buildProvinceModeFallback(refreshState);
		if (immediateProvinceFallback.length > 0) {
			applyFeaturesForRefresh({
				seq,
				features: immediateProvinceFallback,
			});
		}

		try {
			const provincePins = await getMapProvinceAggregates({ signal });
			if (seq !== pinsRefreshSeq) return;

			const provinceFeatures = decorateAggregateFeatures(
				(provincePins || []).map(pinFeatureFromRpc).filter(Boolean),
				"province",
			);
			if (provinceFeatures.length > 0) {
				lastGoodProvinceAggregateFeatures = provinceFeatures;
			}

			const lowZoomFeatures =
				currentZoom < COUNTRY_AGGREGATE_MAX_ZOOM
					? buildThailandAggregateFeatures(
							provinceFeatures.length > 0
								? provinceFeatures
								: lastGoodProvinceAggregateFeatures,
						)
					: provinceFeatures.length > 0
						? provinceFeatures
						: lastGoodProvinceAggregateFeatures;
			applyFeaturesForRefresh({ seq, features: lowZoomFeatures });
		} catch (err) {
			if (isExpectedAbortError(err, { signal })) return;
			mapDebugWarn(
				"Province aggregate RPC failed, using cached aggregate fallback:",
				err?.message || err,
			);
			applyFeaturesForRefresh({
				seq,
				features: buildProvinceModeFallback(refreshState),
			});
		}
		return;
	}

	if (localOnly) {
		applyFeaturesForRefresh({
			seq,
			features: buildViewportFallbackFeatures(refreshState),
		});
		return;
	}

	if (Date.now() < mapPinsRpcDisabledUntil) {
		applyFeaturesForRefresh({
			seq,
			features: buildViewportFallbackFeatures(refreshState),
		});
		return;
	}

	const localFallbackFeatures = buildFallbackFeaturesFromShopsInBounds({
		bounds,
		shops,
		allowedIds,
	});
	const immediateFallback = buildViewportDisplayFeatures({
		currentZoom,
		shops,
		features:
			localFallbackFeatures.length > 0
				? localFallbackFeatures
				: lastGoodPinFeatures,
	});
	if (immediateFallback.length > 0) {
		applyFeaturesForRefresh({ seq, features: immediateFallback });
	}

	if (isFrontendOnlyDevMode()) {
		if (localFallbackFeatures.length > 0) {
			lastGoodPinFeatures = localFallbackFeatures;
		}
		return;
	}

	try {
		const pins = await getMapPins({
			p_min_lat: bounds.getSouth(),
			p_min_lng: bounds.getWest(),
			p_max_lat: bounds.getNorth(),
			p_max_lng: bounds.getEast(),
			p_zoom: currentZoom,
			signal,
		});

		if (seq !== pinsRefreshSeq) return;

		const rpcFeatures = (pins || [])
			.filter((pin) => isAllowedMapPinId(pin?.id, allowedIds))
			.map(pinFeatureFromRpc)
			.filter(Boolean);
		const mergedFeatures = mergeFeaturesById(
			localFallbackFeatures,
			rpcFeatures,
		);
		if (mergedFeatures.length > 0) {
			lastGoodPinFeatures = mergedFeatures;
		}

		let features = buildViewportDisplayFeatures({
			currentZoom,
			shops,
			features: mergedFeatures,
		});
		if (!features.length && lastGoodPinFeatures.length) {
			features = buildViewportDisplayFeatures({
				currentZoom,
				shops,
				features: lastGoodPinFeatures,
			});
		}
		applyFeaturesForRefresh({ seq, features });
	} catch (err) {
		if (isExpectedAbortError(err, { signal })) return;
		const statusCode = Number(err?.status || err?.code || 0);
		const isServerError =
			(statusCode >= 500 && statusCode < 600) ||
			String(err?.message || "").includes("500");
		if (isServerError) {
			mapPinsRpcDisabledUntil = Date.now() + 60_000;
		}
		mapDebugWarn(
			"Map pins RPC failed, using displayed fallback:",
			err?.message || err,
		);
		applyFeaturesForRefresh({
			seq,
			features: buildViewportFallbackFeatures(refreshState),
		});
	}
};

const markMapUserInteraction = () => {
	const wasInteracted = mapUserInteracted.value;
	mapUserInteracted.value = true;
	if (!wasInteracted && map.value && isMapReady.value) {
		scheduleProgressiveHeavyEffects({ immediate: true });
	}
};

// Bind events
watch(
	isMapReady,
	(ready) => {
		if (ready && map.value && isMapOperational()) {
			if (SHOULD_EXPOSE_MAP_DEBUG && typeof window !== "undefined") {
				window.__vibecityMapDebug = map.value;
			}
			map.value.off("moveend", scheduleMapRefresh);
			map.value.off("zoomend", scheduleMapRefresh);
			map.value.off("move", handleMapMoveForEnhancements);
			map.value.off("zoom", handleMapMoveForEnhancements);
			map.value.off("moveend", handleMapMoveEndForWeather);
			map.value.off("movestart", handleMoveStart3d);
			map.value.off("moveend", handleMoveEnd3d);
			map.value.off("style.load", handleMapStyleLoad);
			map.value.off("dragstart", markMapUserInteraction);
			map.value.off("zoomstart", markMapUserInteraction);
			map.value.off("rotatestart", markMapUserInteraction);
			map.value.off("pitchstart", markMapUserInteraction);

			map.value.on("moveend", scheduleMapRefresh);
			map.value.on("zoomend", scheduleMapRefresh);
			map.value.on("move", handleMapMoveForEnhancements);
			map.value.on("zoom", handleMapMoveForEnhancements);
			map.value.on("moveend", handleMapMoveEndForWeather);
			map.value.on("movestart", handleMoveStart3d);
			map.value.on("moveend", handleMoveEnd3d);
			map.value.on("style.load", handleMapStyleLoad);
			map.value.on("dragstart", markMapUserInteraction);
			map.value.on("zoomstart", markMapUserInteraction);
			map.value.on("rotatestart", markMapUserInteraction);
			map.value.on("pitchstart", markMapUserInteraction);
			currentMapZoom.value = map.value.getZoom();
			scheduleMapRefresh({ allowSameViewport: true });
			map.value.once("idle", () => {
				void ensureBaseMapLayersReady();
				scheduleMapRefresh({ force: true });
			});
			void ensureBaseMapLayersReady();
			syncBuildingInfoPopupFromSelection();

			// Run initial marker update
			requestUpdateMarkers();

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
	},
	{ immediate: true },
);

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
			distLabel.textContent = `📍 ${distTxt} (${timeTxt})`;
		}
	}
};

const clearActiveRouteState = () => {
	roadDistance.value = null;
	roadDuration.value = null;
	hasActiveRoute.value = false;
	stopRouteTrailAnimation();
	applySourceData(DISTANCE_LINE_SOURCE_ID, {
		type: "FeatureCollection",
		features: [],
	});
};

const updateRoadDirections = async () => {
	// 1. Validate Inputs
	if (
		!props.userLocation ||
		props.userLocation.length < 2 ||
		!props.selectedShopCoords ||
		props.selectedShopCoords.length < 2
	) {
		clearActiveRouteState();
		return;
	}

	if (
		!SHOULD_FETCH_ROUTE_PROXY ||
		isRuntimeLaneUnavailable(RUNTIME_LANES.directionsProxy) ||
		isKnownMissingRuntimeLane(RUNTIME_LANES.directionsProxy, API_V1_BASE_URL)
	) {
		clearActiveRouteState();
		return;
	}

	const [uLat, uLng] = props.userLocation;
	const [sLat, sLng] = props.selectedShopCoords;

	// MapLibre GL does not require an access token
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
		if (!navigator.onLine) {
			clearActiveRouteState();
			return;
		}

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
				headers: {}, // MapLibre GL does not expose an accessToken
			},
		);

		if (!res.ok) {
			if ([404, 405, 429, 500, 502, 503, 504].includes(res.status)) {
				markRuntimeLaneUnavailable(RUNTIME_LANES.directionsProxy);
			}
			if (!IS_E2E) mapDebugWarn("Route proxy request failed:", res.status);
			clearActiveRouteState();
			return;
		}

		const data = await res.json();
		if (data.routes?.[0]) {
			clearRuntimeLaneUnavailable(RUNTIME_LANES.directionsProxy);
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
		if (isExpectedAbortError(err, { signal: routeAbortController?.signal })) {
			return;
		}
		if (!IS_E2E) {
			mapDebugWarn("Route fetch failed", err);
		}
		if (navigator.onLine) {
			markRuntimeLaneUnavailable(RUNTIME_LANES.directionsProxy);
		}
		clearActiveRouteState();
	}
};

let updateMarkersRequested = false;
let lastMarkerUpdate = 0;
const MARKER_UPDATE_THROTTLE = 200;

const requestUpdateMarkers = () => {
	if (!ENABLE_DOM_OVERLAY_MARKERS) return;
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
		if (!map.value || !maplibregl) return;

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
				el.textContent = String(effect.emoji || "");

				const marker = new maplibregl.Marker({
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
		const shouldHide = immersive; // Do not hide pins during Giant Pin Modal
		pinsVisible.value = !shouldHide;
		if (giantView) {
			stopAtmosphereLoop();
			stopRouteTrailAnimation();
			stopSmartPulseLoop();
		} else {
			refreshSmartPulseTargets();
			if (map.value && isMapReady.value) {
				scheduleProgressiveHeavyEffects();
			}
			scheduleMapRefresh({ force: true });
		}

		// Toggle DOM Markers
		if (ENABLE_DOM_OVERLAY_MARKERS) {
			markersMap.value.forEach(({ marker }) => {
				const el = marker.getElement();
				if (el) el.style.opacity = shouldHide ? "0" : "1";
			});
		}

		eventMarkersMap.value.forEach((marker) => {
			const el = marker.getElement();
			if (el) el.style.opacity = shouldHide ? "0" : "1";
		});

		// Toggle MapLibre layers that are active in the non-cluster pin mode.
		if (map.value && isMapReady.value) {
			const opacity = shouldHide ? 0 : 1;
			const textOpacity = shouldHide ? 0 : 1;

			const layers = [
				PIN_LAYER_ID,
				SELECTED_PIN_LAYER_ID,
				"pin-coins",
				"pin-coins-fallback",
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

		if (!shouldHide) {
			nextTick(() => {
				queueMapResize(true);
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
const setupMapLayers = async () => {
	if (!map.value) return;
	if (!map.value.isStyleLoaded?.()) {
		map.value.once("style.load", () => {
			void setupMapLayers();
		});
		return;
	}
	await loadMapImages(map.value);
	try {
		map.value.setTerrain?.(null);
	} catch {
		// Ignore style-transition races.
	}
	stopAtmosphereLoop();
	removeFirefliesLayer();
	if (!allow3dBuildings.value) remove3dBuildingLayers();
	if (!allowHeatmap.value) removeHeatmapLayer();
	stopRouteTrailAnimation();
	applyRouteTrailVisibility();
	applyFogSettings();
	addNeonRoads();
	if (allowTrafficFlowFx.value) {
		addCarAnimation({ sourceId: TRAFFIC_NEON_SOURCE_ID });
	} else {
		stopCarAnimation();
	}
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
			filter: ["all", ["!", ["has", "point_count"]]],
			layout: {
				"icon-image": [
					"match",
					["get", "pin_state"],
					THAILAND_AGGREGATE_LEVEL,
					"pin-blue",
					"province",
					"pin-blue",
					"zone",
					"pin-blue",
					"event",
					"pin-blue",
					"live",
					"pin-red",
					"open",
					"pin-blue",
					"tonight",
					"pin-blue",
					"pin-grey",
				],
				"icon-size": [
					"case",
					["==", ["get", "aggregate_level"], THAILAND_AGGREGATE_LEVEL],
					0.44,
					["==", ["get", "aggregate_level"], "province"],
					0.35,
					["==", ["get", "aggregate_level"], "zone"],
					0.3,
					["==", ["get", "pin_type"], "giant"],
					0.27,
					0.2,
				],
				"icon-allow-overlap": true,
				"icon-anchor": "bottom",
				...(MAP_TEXT_LABELS_ENABLED
					? {
							"text-field": ["get", "name"],
							"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
							"text-offset": [0, 1.2],
							"text-anchor": "top",
							"text-size": [
								"case",
								["==", ["get", "aggregate_level"], THAILAND_AGGREGATE_LEVEL],
								17,
								["==", ["get", "aggregate_level"], "province"],
								14,
								["==", ["get", "aggregate_level"], "zone"],
								12,
								12,
							],
							"text-optional": true,
						}
					: {}),
			},
			paint: {
				"text-color": "#ffffff",
				"text-halo-color": "#000000",
				"text-halo-width": 1,
				"icon-opacity": 1,
			},
		});
	}

	if (!map.value.getLayer(SELECTED_PIN_LAYER_ID)) {
		map.value.addLayer({
			id: SELECTED_PIN_LAYER_ID,
			type: "symbol",
			source: PIN_SOURCE_ID,
			filter: EMPTY_SELECTED_PIN_FILTER,
			layout: {
				"icon-image": [
					"match",
					["get", "pin_state"],
					THAILAND_AGGREGATE_LEVEL,
					"pin-blue",
					"province",
					"pin-blue",
					"zone",
					"pin-blue",
					"event",
					"pin-blue",
					"live",
					"pin-red",
					"open",
					"pin-blue",
					"tonight",
					"pin-blue",
					"pin-grey",
				],
				"icon-size": [
					"case",
					["==", ["get", "aggregate_level"], THAILAND_AGGREGATE_LEVEL],
					0.5,
					["==", ["get", "aggregate_level"], "province"],
					0.39,
					["==", ["get", "aggregate_level"], "zone"],
					0.34,
					["==", ["get", "pin_type"], "giant"],
					0.32,
					0.24,
				],
				"icon-allow-overlap": true,
				"icon-ignore-placement": true,
				"icon-anchor": "bottom",
				"symbol-sort-key": 9999,
			},
			paint: {
				"icon-opacity": 1,
			},
		});
	}

	// ── Sentient Pulse Ring ────────────────────────────────────────────────────
	// Sonar-ping effect driven by setFeatureState({ sentient_pulse: true }).
	// Inserted BELOW the pin icon layer so it expands from behind the pin.
	if (!map.value.getLayer("sentient-pulse-ring")) {
		map.value.addLayer(
			{
				id: "sentient-pulse-ring",
				type: "circle",
				source: PIN_SOURCE_ID,
				filter: ["all", ["!", ["has", "point_count"]]],
				paint: {
					// Resting state: tiny glow (8px, 0.06 opacity).
					// Pulse state: sonar ring expands to 52px and fades to transparent.
					"circle-radius": [
						"case",
						["boolean", ["feature-state", "sentient_pulse"], false],
						52,
						8,
					],
					"circle-radius-transition": { duration: 700, delay: 0 },
					// Color matches pin_state for visual coherence
					"circle-color": [
						"case",
						["==", ["get", "pin_state"], "live"],
						"#ef4444",
						["==", ["get", "pin_state"], "event"],
						"#06b6d4",
						"#60a5fa",
					],
					"circle-opacity": [
						"case",
						["boolean", ["feature-state", "sentient_pulse"], false],
						0.0, // fully transparent at peak
						0.06, // subtle ambient glow at rest
					],
					"circle-opacity-transition": { duration: 700, delay: 0 },
					"circle-blur": 0.5,
				},
			},
			PIN_LAYER_ID, // insert below pin icons
		);
	}

	// Coin overlays are rendered by symbol layers (pin-coins / pin-coins-fallback).

	if (!map.value.getLayer(PIN_HITBOX_LAYER_ID)) {
		map.value.addLayer(
			{
				id: PIN_HITBOX_LAYER_ID,
				type: "circle",
				source: PIN_SOURCE_ID,
				filter: ["all", ["!", ["has", "point_count"]]],
				paint: {
					"circle-radius": [
						"case",
						["==", ["get", "aggregate_level"], THAILAND_AGGREGATE_LEVEL],
						24,
						["==", ["get", "aggregate_level"], "province"],
						20,
						["==", ["get", "aggregate_level"], "zone"],
						17,
						["==", ["get", "pin_type"], "giant"],
						16,
						["==", ["get", "boost"], true],
						14,
						12,
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

	map.value.setPitch(pitch.value);
	map.value.setBearing(bearing.value);
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
	updateSelectedPinLayerFilter(props.highlightedShopId);

	// 6. User Location
	ensureUserLocationLayers();

	// 7. Register neon sign layers once per style after the pin source exists.
	if (map.value.isStyleLoaded?.()) {
		addNeonSignLayers(PIN_SOURCE_ID);
	}
};

const ensureBaseMapLayersReady = async () => {
	if (!map.value || !isMapReady.value) return;
	if (map.value.getSource(PIN_SOURCE_ID)) return;
	await setupMapLayers();
	updateMapSources();
	requestUpdateMarkers();
	updateEventMarkers();
	scheduleTrafficFlowBootstrap();
};

// Update GeoJSON sources
const updateMapSources = () => {
	if (!isMapOperational()) return;

	// 1. Update user location
	if (ensureUserLocationLayers()) {
		applySourceData(
			USER_LOCATION_SOURCE_ID,
			buildUserLocationFeatureCollection(),
		);
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

// ✅ MapLibre GL does not require an access token — always valid
const isTokenInvalid = ref(false);

// ✅ Ensure MapLibre is loaded (token-free; WebGL check covers initialization readiness)
const ensureMapLibreLoaded = () => {
	// MapLibre does not need a token — library presence is sufficient
	if (maplibregl) {
		return true;
	}
	return false;
};

// ✅ WebGL Support Detection - More robust check
const checkWebGLSupport = () => {
	try {
		const hasWebGLApi =
			typeof window !== "undefined" &&
			(typeof window.WebGL2RenderingContext !== "undefined" ||
				typeof window.WebGLRenderingContext !== "undefined");

		if (!hasWebGLApi) {
			console.error("❌ WebGL API is not available");
			reportMapLifecycle("webgl_unsupported", {
				reason: "api_unavailable",
			});
			return false;
		}
		return true;
	} catch (e) {
		console.error("❌ WebGL check failed:", e);
		reportMapLifecycle("webgl_unsupported", {
			reason: "check_failed",
			message: e?.message || String(e),
		});
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
	if (mapContextRecovering.value) return;
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
	mapDebugLog("🗺️ Initializing MapLibre Core...");
	initMapOnce();
	if (!trafficRefreshInterval) {
		trafficRefreshInterval = window.setInterval(() => {
			void refreshTrafficSubset();
		}, TRAFFIC_REFRESH_INTERVAL_MS);
	}
	scheduleHotRoadPoll({ immediate: true });

	// Use ResizeObserver instead of manual resize() calls
	if (mapContainer.value && typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => {
			queueMapResize();
		});
		resizeObserver.observe(mapContainer.value);
	}
});

// ✅ Watch for Map Ready
watch(isMapReady, async (ready) => {
	if (ready && map.value) {
		mapDebugLog("✅ Map Core Ready - Setting up Layers");
		await setupMapLayers();
		updateMapSources();
		scheduleTrafficFlowBootstrap();
		refreshSmartPulseTargets();
		requestUpdateMarkers();
		updateEventMarkers();
		setTimeout(() => {
			mapLoaded.value = true;
		}, 300);
		scheduleHotRoadPoll({ immediate: true });
	}
});

watch(
	[
		isDocumentHidden,
		isOffline,
		() => props.isLowPowerMode,
		prefersReducedMotion,
	],
	([hidden, offline]) => {
		if (hidden || offline) {
			clearHotRoadPollTimer();
			return;
		}
		scheduleHotRoadPoll({ immediate: true });
	},
);

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
	activePopupShopId.value = "";
	popupSettleState.value = "idle";
};
const POPUP_SAFE_BUFFER_PX = 16;
const POPUP_AUTOPAN_BUFFER_PX = 18;
const POPUP_SECOND_PASS_DELAY_MS = 140;
let activeSelectionFlightSeq = 0;
let popupRepairTimer = null;
const clearPopupRepairTimer = () => {
	if (popupRepairTimer) {
		clearTimeout(popupRepairTimer);
		popupRepairTimer = null;
	}
};
const getPopupLiftOffset = (item, surface = "preview") => {
	const pinType = String(item?.pin_type || "")
		.trim()
		.toLowerCase();
	const baseLift = (() => {
		if (
			pinType === "giant" ||
			item?.is_giant_active === true ||
			item?.isGiantPin === true
		) {
			return 112;
		}
		if (pinType === "event") return 96;
		if (String(item?.status || "").toUpperCase() === "LIVE" || item?.isLive) {
			return 82;
		}
		if (item?.isPromoted === true || item?.boostActive === true) {
			return 76;
		}
		return 72;
	})();
	return surface === "preview"
		? baseLift + getPreviewPopupClearancePx()
		: baseLift;
};
const getSelectionChromeBounds = (surface = "preview") => {
	const mapInstance = map.value;
	const mapHost = mapContainer.value || mapInstance?.getContainer?.();
	const mapRect = mapHost?.getBoundingClientRect?.();
	if (!mapRect) return null;
	const headerRect = document
		.querySelector(".smart-header")
		?.getBoundingClientRect?.();
	const searchRect = document
		.querySelector('[data-testid="search-input"]')
		?.getBoundingClientRect?.();
	const bottomFeedRect = document
		.querySelector('[data-testid="bottom-feed"]')
		?.getBoundingClientRect?.();
	const modalRect = document
		.querySelector('[data-testid="vibe-modal-surface"]')
		?.getBoundingClientRect?.();

	const chromeBottom = Math.max(
		Math.round(mapRect.top + Number(props.uiTopOffset || 0)),
		Math.round(headerRect?.bottom || 0),
		Math.round(searchRect?.bottom || 0),
	);
	const previewBottom = Math.min(
		Math.round(mapRect.bottom - Number(props.uiBottomOffset || 0)),
		Math.round(bottomFeedRect?.top || mapRect.bottom),
	);

	// Fallback for modal top if it hasn't rendered yet (70% height on mobile, 40% on desktop)
	const isNarrow = isNarrowDetailViewport();
	const fallbackModalTop = isNarrow
		? mapRect.top + mapRect.height * 0.3
		: mapRect.top + mapRect.height * 0.1;

	const modalTop =
		modalRect?.top ?? (surface === "detail" ? fallbackModalTop : previewBottom);

	const detailModalGapPx = getDetailSelectionModalGapPx();
	const detailBottom = Math.min(
		previewBottom,
		Math.round(modalTop) - (surface === "detail" ? detailModalGapPx : 0),
	);
	const safeTop = Math.max(
		Math.round(mapRect.top + POPUP_SAFE_BUFFER_PX),
		chromeBottom + POPUP_SAFE_BUFFER_PX,
	);
	const safeBottom = Math.max(
		safeTop + 120,
		Math.min(
			Math.round(mapRect.bottom - POPUP_SAFE_BUFFER_PX),
			(surface === "detail" ? detailBottom : previewBottom) -
				POPUP_SAFE_BUFFER_PX,
		),
	);
	return {
		mapRect,
		safeTop,
		safeBottom,
	};
};
const getSelectionFlightGeometry = (surface = "preview") => {
	const chromeBounds = getSelectionChromeBounds(surface);
	if (!chromeBounds) return null;
	const { mapRect, safeTop, safeBottom } = chromeBounds;
	const containerHeight = mapRect.height;
	const topPad = Math.max(0, Math.round(safeTop - mapRect.top));
	const bottomPad = Math.max(0, Math.round(mapRect.bottom - safeBottom));
	const usableHeight = Math.max(180, safeBottom - safeTop);
	const detailTargetRatio = getDetailSelectionTargetRatio();
	const detailVisualLiftPx =
		surface === "detail" ? getDetailSelectionVisualLiftPx() : 0;
	const targetPinViewportY =
		safeTop +
		usableHeight * (surface === "detail" ? detailTargetRatio : 0.7) -
		detailVisualLiftPx;
	const targetPinContainerY = targetPinViewportY - mapRect.top;
	const offsetY = Math.round(containerHeight / 2 - targetPinContainerY);
	return {
		topPad,
		bottomPad,
		offsetY,
	};
};
const measurePopupOverflow = (popupEl, surface = "preview") => {
	const chromeBounds = getSelectionChromeBounds(surface);
	if (!chromeBounds) return null;
	const popupRect = popupEl?.getBoundingClientRect?.();
	if (!popupRect) return null;
	return {
		chromeBounds,
		overflowTop: Math.ceil(chromeBounds.safeTop - popupRect.top),
		overflowBottom: Math.ceil(popupRect.bottom - chromeBounds.safeBottom),
	};
};
const applyPopupViewportClamp = (popupEl, overflowState) => {
	if (!popupEl || !overflowState) return false;
	const shiftY =
		overflowState.overflowTop > 0
			? overflowState.overflowTop + POPUP_SAFE_BUFFER_PX
			: overflowState.overflowBottom > 0
				? -(overflowState.overflowBottom + POPUP_SAFE_BUFFER_PX)
				: 0;
	if (!shiftY) return false;
	popupEl.dataset.popupClampY = String(shiftY);
	popupEl.style.marginTop = `${shiftY}px`;
	return true;
};
const keepPopupAbovePin = (popup, item, { surface = "preview" } = {}) => {
	const popupEl = popup?.getElement?.();
	const mapInstance = map.value;
	const mapHost = mapContainer.value || mapInstance?.getContainer?.();
	if (!popupEl || !mapInstance || !mapHost) return null;

	popupEl.style.zIndex = String(Z.MAPBOX_POPUP);
	popupEl.dataset.anchorPolicy = "above-pin";
	popupEl.dataset.popupLift = String(getPopupLiftOffset(item, surface));

	const overflowState = measurePopupOverflow(popupEl, surface);
	if (!overflowState) return null;
	const { overflowTop, overflowBottom } = overflowState;

	if (overflowTop <= 0 && overflowBottom <= 0) {
		popupSettleState.value = "settled";
		return {
			corrected: false,
			overflowTop,
			overflowBottom,
		};
	}
	if (typeof mapInstance.panBy !== "function") {
		return {
			corrected: false,
			overflowTop,
			overflowBottom,
		};
	}

	try {
		const deltaY =
			overflowTop > 0
				? -(overflowTop + POPUP_AUTOPAN_BUFFER_PX)
				: overflowBottom + POPUP_AUTOPAN_BUFFER_PX;
		mapInstance.panBy([0, deltaY], {
			duration: 280,
			essential: true,
			easing: (t) => 1 - (1 - t) ** 2,
		});
	} catch {
		// fail-open: popup stays lifted even if map cannot pan right now
	}
	return {
		corrected: true,
		overflowTop,
		overflowBottom,
	};
};

// ✅ Show Popup for Item (Fixed button handling)
const showPopup = (
	item,
	{ force = false, remember = true, surface = "preview" } = {},
) => {
	const shopId = normalizePopupShopId(item?.id);
	const isSameShopPopupOpen =
		Boolean(shopId) &&
		activePopupShopId.value === shopId &&
		Boolean(activePopup.value?.isOpen?.());
	if (
		!force &&
		shopId &&
		autoOpenedPopupIds.has(shopId) &&
		isSameShopPopupOpen
	) {
		return true;
	}
	if (isSameShopPopupOpen) {
		return true;
	}

	// Guard: Ensure both map and maplibregl are ready
	if (!map.value || !maplibregl) {
		mapDebugWarn("⚠️ Map or maplibregl not ready for popup");
		return null;
	}

	const lng = Number(item?.lng ?? item?.longitude);
	const lat = Number(item?.lat ?? item?.latitude);
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

	closeActivePopup();

	const popup = new maplibregl.Popup({
		closeButton: false,
		closeOnClick: false,
		className: "vibe-maplibre-popup",
		maxWidth: "384px",
		offset: [0, -getPopupLiftOffset(item, surface)],
		anchor: "bottom",
	})
		.setLngLat([lng, lat])
		.setHTML(getPopupHTML(item))
		.addTo(map.value);

	activePopup.value = popup;
	activePopupShopId.value = shopId;
	if (remember && shopId) {
		autoOpenedPopupIds.add(shopId);
	}
	popup.on("close", () => {
		if (activePopup.value === popup) {
			activePopup.value = null;
			activePopupShopId.value = "";
		}
	});

	// Give popup time to mount before measuring for top-safe autopan.
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			keepPopupAbovePin(popup, item, { surface });
		});
	});

	// Attach event listeners with delay for DOM to be ready
	setTimeout(() => {
		const popupEl = popup.getElement();
		if (!popupEl) return;

		keepPopupAbovePin(popup, item, { surface });

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
	return popup;
};

const waitForMapMotionSettled = (requestId, timeoutMs = 1_600) =>
	new Promise((resolve) => {
		const mapInstance = map.value;
		if (!mapInstance) {
			resolve(false);
			return;
		}
		let settled = false;
		let timeoutId = null;
		const cleanup = () => {
			if (timeoutId) clearTimeout(timeoutId);
			mapInstance.off?.("moveend", handleSettled);
			mapInstance.off?.("idle", handleSettled);
		};
		const finish = (didSettle) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(didSettle);
		};
		const handleSettled = () => {
			if (activeSelectionFlightSeq !== requestId) {
				finish(false);
				return;
			}
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					finish(true);
				});
			});
		};

		if (!mapInstance.isMoving?.() && !mapInstance.isEasing?.()) {
			handleSettled();
			return;
		}

		timeoutId = setTimeout(() => {
			finish(false);
		}, timeoutMs);
		mapInstance.on?.("moveend", handleSettled);
		mapInstance.on?.("idle", handleSettled);
	});

const settlePopupAfterMount = async (
	popup,
	item,
	{ requestId, surface = "preview" } = {},
) => {
	if (!popup) return false;
	clearPopupRepairTimer();
	popupSettleState.value = "popup-settling";
	const runRepairPass = async () => {
		await new Promise((resolve) => {
			requestAnimationFrame(() => {
				resolve();
			});
		});
		if (activeSelectionFlightSeq !== requestId) return false;
		const repairState = keepPopupAbovePin(popup, item, { surface });
		if (repairState?.corrected) {
			await waitForMapMotionSettled(requestId, 900);
		}
		return repairState;
	};
	let repairState = await runRepairPass();
	await new Promise((resolve) => {
		popupRepairTimer = window.setTimeout(() => {
			popupRepairTimer = null;
			resolve();
		}, POPUP_SECOND_PASS_DELAY_MS);
	});
	if (activeSelectionFlightSeq !== requestId) return false;
	repairState = await runRepairPass();
	if (
		activeSelectionFlightSeq === requestId &&
		repairState &&
		(repairState.overflowTop > 0 || repairState.overflowBottom > 0)
	) {
		await new Promise((resolve) => {
			popupRepairTimer = window.setTimeout(() => {
				popupRepairTimer = null;
				resolve();
			}, POPUP_SECOND_PASS_DELAY_MS);
		});
		if (activeSelectionFlightSeq !== requestId) return false;
		repairState = await runRepairPass();
	}
	const popupEl = popup?.getElement?.();
	const finalOverflow = measurePopupOverflow(popupEl, surface);
	if (
		activeSelectionFlightSeq === requestId &&
		popupEl &&
		finalOverflow &&
		(finalOverflow.overflowTop > 0 || finalOverflow.overflowBottom > 0)
	) {
		applyPopupViewportClamp(popupEl, finalOverflow);
		repairState = {
			...finalOverflow,
			corrected: false,
			clamped: true,
		};
	}
	popupSettleState.value =
		repairState &&
		(repairState.overflowTop > 0 || repairState.overflowBottom > 0)
			? repairState.clamped
				? "settled-clamped"
				: "settled-with-overflow"
			: "settled";
	return true;
};

const resolveSelectionIntentShop = (intent) => {
	const normalizedId = normalizeMapPinId(intent?.shopId);
	if (!normalizedId) return null;
	return (
		shopStore.getShopById?.(normalizedId) ||
		props.shops?.find((shop) => normalizeMapPinId(shop?.id) === normalizedId) ||
		null
	);
};

const runSelectionIntent = async (intent) => {
	if (!intent || !map.value || !publicMapReady.value) return;
	const requestId = Number(intent.requestId || Date.now());
	activeSelectionFlightSeq = requestId;
	selectionSourceLabel.value = String(intent.source || "unknown");
	cameraRequestId.value = String(requestId);
	popupSettleState.value = "pending";
	clearPopupRepairTimer();
	const shop = resolveSelectionIntentShop(intent);
	if (!shop) return;
	const lat = Number(intent?.coords?.[0] ?? shop?.lat ?? shop?.latitude);
	const lng = Number(intent?.coords?.[1] ?? shop?.lng ?? shop?.longitude);
	const surface = intent.surface === "detail" ? "detail" : "preview";

	buildingPopupShop.value = shop;
	syncBuildingPopupContent(shop);
	updateBuildingInfoPopupPosition(true);
	closeActivePopup();
	map.value.stop?.();

	if (
		intent.cameraMode !== "none" &&
		Number.isFinite(lat) &&
		Number.isFinite(lng)
	) {
		const previewSelectionZoom = 16.8;
		const detailSelectionZoom = 16.95;
		const geometry = getSelectionFlightGeometry(surface);
		popupSettleState.value = "camera-pending";
		try {
			flyToCore({
				center: [lng, lat],
				zoom: Math.max(
					map.value.getZoom?.() || 16.1,
					surface === "detail" ? detailSelectionZoom : previewSelectionZoom,
				),
				pitch: 60,
				bearing: bearing.value,
				essential: true,
				duration: isNarrowDetailViewport() ? 680 : 850,
				curve: 1,
				easing: (t) => t * (2 - t),
				offset: [0, geometry?.offsetY || 0],
				padding: {
					top: geometry?.topPad || 0,
					bottom: geometry?.bottomPad || 0,
					left: 0,
					right: 0,
				},
			});
		} catch (error) {
			mapDebugWarn("Selection flight failed:", error);
		}
		await waitForMapMotionSettled(
			requestId,
			surface === "detail" ? 1_900 : 1_500,
		);
	}

	if (activeSelectionFlightSeq !== requestId) return;
	if (
		surface === "detail" ||
		props.isGiantPinView ||
		intent.popupMode === "none"
	) {
		closeActivePopup();
		popupSettleState.value = "idle";
		return;
	}
	popupSettleState.value = "popup-mounting";
	const popup = showPopup(shop, {
		force: true,
		remember: surface !== "detail",
		surface,
	});
	if (!popup) {
		popupSettleState.value = "idle";
		return;
	}
	await settlePopupAfterMount(popup, shop, { requestId, surface });
	if (activeSelectionFlightSeq !== requestId) return;
	emit("selection-flight-complete", {
		requestId,
		shop,
		shopId: String(shop?.id ?? intent.shopId ?? "").trim(),
		source: String(intent.source || "unknown"),
		surface,
	});
};

const updateMarkers = () => {
	if (!ENABLE_DOM_OVERLAY_MARKERS) return;
	if (!props.shops) return;
	// Only giant pins get DOM markers; regular pins use GeoJSON symbol layer
	updateMarkersCore(props.shops, props.highlightedShopId, {
		pinsVisible: pinsVisible.value,
		allowedIds: allowedIdsRef.value,
		enableDomCoinMarkers: ENABLE_DOM_COIN_MARKERS,
		renderRegularDomMarkers: ENABLE_DOM_OVERLAY_MARKERS,
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

const handleAggregatePinTap = ({ aggregateLevel, feature }) => {
	if (!map.value) return;
	const coordinates = feature?.geometry?.coordinates;
	if (!Array.isArray(coordinates) || coordinates.length < 2) return;

	let targetZoom = ZONE_DRILLDOWN_ZOOM;
	switch (
		String(aggregateLevel || "")
			.trim()
			.toLowerCase()
	) {
		case THAILAND_AGGREGATE_LEVEL:
			targetZoom = COUNTRY_DRILLDOWN_ZOOM;
			break;
		case "province":
			targetZoom = PROVINCE_DRILLDOWN_ZOOM;
			break;
		default:
			targetZoom = ZONE_DRILLDOWN_ZOOM;
			break;
	}

	markMapUserInteraction();
	map.value.easeTo({
		center: coordinates,
		zoom: Math.max(Number(map.value.getZoom?.() ?? 0), targetZoom),
		duration: 800,
		essential: true,
	});
};

// ✅ Map Interactions moved to useMapInteractions
const {
	handlePointClick,
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
	enableClusters: false,
	pinSourceId: PIN_SOURCE_ID,
	onPinTap: () => sentient?.onManualPinTap?.(),
	onAggregateTap: handleAggregatePinTap,
});

// ✅ Sentient Map — Predictive intent detection with anti-flicker stability
let sentient = null;
let sentientModulePromise = null;
let sentientDisposed = false;
const preloadSentientMap = () => {
	sentientModulePromise ||= import("../../composables/map/useSentientMap");
	return sentientModulePromise;
};
const initSentientMap = async () => {
	if (sentient || sentientDisposed) return sentient;
	const mod = await preloadSentientMap();
	if (sentient || sentientDisposed) return sentient;
	sentient = mod.createSentientMapController(
		map,
		isMapReady,
		mapContainer,
		computed(() => props.shops || []),
		computed(() => props.highlightedShopId),
		emit,
		{
			pinSourceId: PIN_SOURCE_ID,
			pinLayerId: PIN_LAYER_ID,
			prefetchFn: prefetchVenueDetails,
		},
	);
	sentient.attach();
	return sentient;
};
queueMapIdleTask(() => {
	if (shouldPreferSmoothMobileRuntime.value) return;
	return preloadSentientMap();
}, 1200);
queueMapIdleTask(() => {
	if (shouldPreferSmoothMobileRuntime.value) return;
	return initSentientMap();
}, 2200);

// ── God-Tier Engine Layers ────────────────────────────────────
// Wave 3: Task 3.1 — useDollyZoom async-loaded via idle queue (no onUnmounted = safe)
// Wave 3: Task 3.2 — useFluidOverlay dynamic import: pre-warmed in setup, called synchronously
//                    in onMounted to preserve Vue lifecycle (onUnmounted registration)
// Wave 3: Task 3.3 — useSDFClusters dynamic import: same pre-warm pattern as 3.2
//
// CONSTRAINT: useSDFClusters + useFluidOverlay call onUnmounted() internally.
// Vue 3 loses getCurrentInstance() after any `await`. Therefore we CANNOT call
// these composables after an await boundary. Solution: pre-warm (start downloading)
// the chunks in setup scope, then call composables synchronously in onMounted once
// the modules are ready. If not ready in time, initGodTierLayers is a no-op and
// the next call from the retry will succeed (modules cached after first fetch).
if (isMapDebugLoggingEnabled()) {
	void import("../../engine/capabilities.js")
		.then(({ logCaps }) => {
			logCaps();
		})
		.catch(() => {});
}
let _sdfClusters = null;
let _fluidOverlay = null;
let _sdfChunkPromise = null;
let _fluidChunkPromise = null;
let _godTierModulesPrefetched = false;
let _godTierInitScheduled = false;

// Dolly zoom deferred instance (set after idle queue fires)
let _dollyZoomInstance = null;

const loadGodTierModules = () => {
	if (!shouldBootGodTierLayers.value) {
		return Promise.resolve([null, null]);
	}
	_sdfChunkPromise ||= import(
		"../../composables/engine/useSDFClusters.js"
	).catch(() => null);
	_fluidChunkPromise ||= import(
		"../../composables/engine/useFluidOverlay.js"
	).catch(() => null);
	return Promise.all([_sdfChunkPromise, _fluidChunkPromise]);
};

let _godTierInit = false;
const initGodTierLayers = () => {
	if (!shouldBootGodTierLayers.value) {
		_godTierInit = false;
		return;
	}
	if (_godTierInit) return; // only init once
	_godTierInit = true;
	const m = map.value;
	if (!m) return;
	// Call composables synchronously (required for onUnmounted to register).
	// Modules may already be in the module cache (pre-warm started above).
	// If chunks aren't cached yet, we use .then() with module-cached callbacks
	// that call the composables once available — safe because onMounted is synchronous.
	//
	// Pattern: check if promise resolved synchronously (chunks often cached by now),
	// otherwise wire a .then() callback. Vue's onUnmounted is registered during the
	// synchronous portion of onMounted, so async .then() callbacks cannot register it.
	// As a result, cleanup is handled by teardownMap() (sets _sdfClusters/_fluidOverlay = null).
	// The composables' internal onUnmounted handlers are a bonus but not the only safety net.
	loadGodTierModules()
		.then(([sdfMod, fluidMod]) => {
			if (!map.value || !shouldBootGodTierLayers.value) {
				_godTierInit = false;
				return;
			}
			try {
				if (sdfMod) _sdfClusters = sdfMod.useSDFClusters(map.value);
			} catch (err) {
				latchMapRuntimeSafeMode("sdf_clusters_init_failed", err);
				mapDebugWarn("[MapLibreContainer] SDF clusters failed:", err);
			}
			try {
				if (fluidMod) _fluidOverlay = fluidMod.useFluidOverlay(map.value);
			} catch (err) {
				latchMapRuntimeSafeMode("fluid_overlay_init_failed", err);
				mapDebugWarn("[MapLibreContainer] Fluid overlay failed:", err);
			}
		})
		.catch((err) => {
			_godTierInit = false;
			latchMapRuntimeSafeMode("god_tier_module_load_failed", err);
			mapDebugWarn(
				"[MapLibreContainer] God-tier engine layers failed to load:",
				err,
			);
		});
};
const ensureGodTierLayersScheduled = () => {
	if (!shouldBootGodTierLayers.value) return;
	if (!_godTierModulesPrefetched) {
		_godTierModulesPrefetched = true;
		queueMapIdleTask(() => loadGodTierModules(), 3500);
	}
	if (_godTierInitScheduled) return;
	_godTierInitScheduled = true;
	queueMapIdleTask(() => initGodTierLayers(), 5000);
};
watch(
	shouldBootGodTierLayers,
	(enabled) => {
		if (enabled) {
			ensureGodTierLayersScheduled();
			return;
		}
		_sdfClusters?.dispose?.();
		_fluidOverlay?.dispose?.();
		_sdfClusters = null;
		_fluidOverlay = null;
		_godTierInit = false;
		_godTierInitScheduled = false;
	},
	{ immediate: true },
);

// Wave 3: Task 3.1 — dolly zoom async init via idle queue (queued at setup time)
const initDollyZoom = async () => {
	if (_dollyZoomInstance) return;
	try {
		const mod = await import("../../composables/engine/useDollyZoom.js");
		_dollyZoomInstance = mod.useDollyZoom(map.value);
		mapDebugLog("[MapLibreContainer] Dolly zoom initialized after idle");
	} catch (err) {
		mapDebugWarn("[MapLibreContainer] Dolly zoom failed to load:", err);
	}
};

// Wire dolly zoom into pin-click: expose via deferred composable interface
// Falls back to no-op if not yet loaded (dolly effect is non-critical on first tap)
const godTierZoomTo = (lngLat, modalEl) => {
	_dollyZoomInstance?.zoomTo?.(lngLat);
	if (modalEl) _dollyZoomInstance?.flipPinToModal?.(lngLat, modalEl);
};

const prefetchVenueDetails = async (venueId, signal) => {
	// Try to use Vue Query if available, otherwise skip
	try {
		const { useQueryClient } = await import("@tanstack/vue-query");
		const queryClient = useQueryClient?.();
		if (!queryClient) return;

		// Prefetch reviews, menu, full details, images
		// This is a placeholder — real implementation would use specific query keys
		// from your shop/venue queries (e.g., shopDetailsQueryKey, reviewsQueryKey, etc.)
		if (signal?.aborted) return;

		// Example: prefetch shop details
		if (typeof queryClient.prefetchQuery === "function") {
			await queryClient.prefetchQuery({
				queryKey: ["shop-details", venueId],
				queryFn: () =>
					apiFetch(`/shops/${venueId}`, {
						signal,
					}),
				staleTime: 30_000,
			});
		}
	} catch {
		// Vue Query not available or error — silently skip
	}
};

// Initialize neon pin DOM overlay signs
// highlightedShopId keeps the carousel-center shop always visible (priority bypass)
useNeonPinsLayer(
	map,
	computed(() => props.shops || []),
	mapContainer,
	{
		onPinClick: (shop) => {
			sentient?.onManualPinTap?.();
			handleMarkerClick(shop);
		},
		highlightedShopId: computed(() => props.highlightedShopId),
		activePopupShopId: computed(() => activePopupShopId.value),
		maxVisiblePins: isPerfRestricted.value ? 12 : 30,
	},
);

// Deferred feature init — loads heatmap, weather, vibe effects after map idle
let _deferredFeaturesInitialized = false;
const initDeferredFeatures = async () => {
	if (_deferredFeaturesInitialized || deferredFeaturesDisposed) return;
	_deferredFeaturesInitialized = true;

	if (featureFlagStore.isEnabled("enable_map_heatmap")) {
		try {
			const mod = await import("../../composables/map/useMapHeatmap");
			if (deferredFeaturesDisposed) return;
			_heatmapInstance = mod.useMapHeatmap(map, allowHeatmap, shopsByIdRef);
		} catch (err) {
			mapDebugWarn("Heatmap failed:", err);
		}
	}

	if (
		featureFlagStore.isEnabled("enable_map_weather") ||
		allowWeatherFx.value
	) {
		try {
			const mod = await import("../../composables/useWeather");
			if (deferredFeaturesDisposed) return;
			_weatherInstance = mod.useWeather({ getMapCenter: getWeatherCenter });
			// Sync reactive refs from deferred instance
			registerDeferredFeatureWatch(
				() => _weatherInstance?.weatherCondition?.value,
				(val) => {
					if (val !== undefined) weatherCondition.value = val;
				},
				{ immediate: true },
			);
			registerDeferredFeatureWatch(
				() => _weatherInstance?.isNight?.value,
				(val) => {
					if (val !== undefined) isWeatherNight.value = val;
				},
				{ immediate: true },
			);
		} catch (err) {
			mapDebugWarn("Weather failed:", err);
		}
	}

	if (featureFlagStore.isEnabled("enable_vibe_effects") || !IS_E2E) {
		try {
			const mod = await import("../../composables/useVibeEffects");
			if (deferredFeaturesDisposed) return;
			_vibeEffectsInstance = mod.useVibeEffects();
			// Sync activeVibeEffects ref from deferred instance
			registerDeferredFeatureWatch(
				() => _vibeEffectsInstance?.activeVibeEffects?.value,
				(val) => {
					if (Array.isArray(val)) activeVibeEffects.value = val;
				},
				{ immediate: true },
			);
		} catch (err) {
			mapDebugWarn("Vibe effects failed:", err);
		}
	}
};

// Wave 3: Task 3.4 — Consolidate ALL idle tasks into the scheduleIdleTask queue.
// Previously: 4 raw requestIdleCallback() calls in the first-idle handler + executeIdleTasksOnce.
// Now: all tasks pre-registered here; first-idle handler calls only executeIdleTasksOnce.
// Priority order (lower timeout = higher priority, runs first in queue):
// NOTE: sentient map now initialized synchronously during setup (lifecycle hooks require sync context)
// Its internal watch defers actual setup() call until map is ready.
scheduleIdleTask(initDeferredFeatures, { timeout: 5000 }); // HIGH: heatmap/weather/vibe
scheduleIdleTask(
	() => {
		try {
			addDeferredLayers({ mapInstance: map.value });
		} catch (err) {
			mapDebugWarn("Deferred layer setup failed:", err);
		}
	},
	{ timeout: 2000 }, // MEDIUM: visual layers
);
scheduleIdleTask(
	async () => {
		if (shouldPreferSmoothMobileRuntime.value) return;
		try {
			await applyTerrainAndAtmosphere();
		} catch (err) {
			mapDebugWarn("Deferred terrain setup failed:", err);
		}
	},
	{ timeout: 3000 }, // MEDIUM: terrain re-enable
);
// Task 3.1 — dolly zoom: low priority (visual polish, non-critical on first tap)
scheduleIdleTask(initDollyZoom, { timeout: 4000 });

const setupMapInteractions = () => {
	if (mapInteractionsInitialized) return;
	mapInteractionsInitialized = true;
	setupInteractionsCore();
};

const handleMarkerClick = (item) => {
	handleMarkerClickCore(item);
};

const emitMapStatus = () => {
	emit("map-ready-change", {
		ready: Boolean(isMapReady.value),
		contentReady: Boolean(isMapContentReady.value),
		publicReady: Boolean(publicMapReady.value),
		styleMode: RESOLVED_STYLE_MODE,
		activeStyleUrl: activeStyleUrl.value || currentStyleUrl.value || "",
		selectionSource: selectionSourceLabel.value,
		cameraRequestId: cameraRequestId.value,
		popupSettleState: popupSettleState.value,
		contentState: mapContentState.value,
	});
};

watch(
	[
		isMapReady,
		isMapContentReady,
		activeStyleUrl,
		selectionSourceLabel,
		cameraRequestId,
		popupSettleState,
	],
	() => {
		emitMapStatus();
	},
	{ immediate: true },
);

// ✅ Setup Map Interactions & Watch for Ready (Performance Fix)
watch(isMapReady, (ready) => {
	if (!ready || !map.value || !isMapOperational()) return;
	queueMapResize(true);
	setupMapInteractions();
	ensureUserLocationLayers();
	updateUserLocation();
	refreshSmartPulseTargets();
	// Task 1.6: Measure map interactive time on first idle
	map.value.once("idle", () => {
		if (window.performance?.mark) {
			try {
				performance.mark("mapbox-interactive");
				const perfEntry = performance.measure(
					"mapbox-load-time",
					"navigationStart",
					"mapbox-interactive",
				);
				mapDebugLog(`Map interactive time: ${perfEntry.duration.toFixed(0)}ms`);
				reportMapLifecycle("map_load_performance", {
					duration: Math.round(perfEntry.duration),
				});
				// Wave 3: Task 3.6 — persist interactive time to window.__mapMetrics
				if (typeof window !== "undefined") {
					window.__mapMetrics = window.__mapMetrics || {};
					window.__mapMetrics.interactiveAt = Math.round(perfEntry.duration);
				}
			} catch {
				// Ignore if navigationStart mark missing (some browsers)
			}
		}
		// Wave 3: Task 3.4 — All deferred tasks now flow through scheduleIdleTask queue.
		// Tasks pre-registered above: initSentientMap, initDeferredFeatures,
		// addDeferredLayers, applyTerrainAndAtmosphere, initDollyZoom.
		// Single call to flush them all via requestIdleCallback in priority order.
		executeIdleTasksOnce(map.value);
		// Wave 4: Task 4.6 — Report map performance metrics to observability service.
		// Uses requestIdleCallback so it doesn't compete with deferred feature init.
		const _reportPerfMetrics = () => {
			webVitalsModulePromise ??= import("../../services/webVitalsService");
			void webVitalsModulePromise
				.then(({ webVitalsService }) => {
					const fcpEntry = performance.getEntriesByName(
						"first-contentful-paint",
					)[0];
					const latestVitals = webVitalsService.getLatestVitals?.() || {};
					frontendObservabilityService.trackMapPerformance({
						fcp: latestVitals.fcp ?? fcpEntry?.startTime,
						lcp: latestVitals.lcp ?? undefined,
						mapInteractive: window.__mapMetrics?.interactiveAt,
						parseOverhead: window.__mapMetrics?.parseOverhead,
						sentientLoadTime: window.__mapMetrics?.sentientLoadTime,
						heatmapLoadTime: window.__mapMetrics?.heatmapLoadTime,
					});
				})
				.catch(() => {
					// fail-open: never block map for observability
				});
		};
		if (typeof requestIdleCallback !== "undefined") {
			requestIdleCallback(_reportPerfMetrics, { timeout: 5000 });
		} else {
			setTimeout(_reportPerfMetrics, 2000);
		}
	});
});

watch(publicMapReady, (ready) => {
	if (!ready || mapContextRecovering.value || mapReadyReported.value) return;
	mapReadyReported.value = true;
	webglRecoveryAttempts.value = 0;
	reportMapLifecycle("ready", {
		elapsedMs: mapInitStartedAt.value ? Date.now() - mapInitStartedAt.value : 0,
		styleMode: RESOLVED_STYLE_MODE,
		activeStyleUrl: activeStyleUrl.value || currentStyleUrl.value || "",
	});
});

// handleMarkerClick defined above with composable

// ✅ Update User Location
const updateUserLocation = () => {
	if (!isMapOperational()) return;
	syncUserLocationDomMarker();
	if (!ensureUserLocationLayers()) return;
	applySourceData(
		USER_LOCATION_SOURCE_ID,
		buildUserLocationFeatureCollection(),
	);
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

const BUILDING_3D_LAYERS = ["3d-buildings", "3d-buildings-cyber"];
const set3dBuildingsVisible = (visible) => {
	if (!map.value) return;
	const vis = visible ? "visible" : "none";
	BUILDING_3D_LAYERS.forEach((id) => {
		if (map.value.getLayer(id)) {
			map.value.setLayoutProperty(id, "visibility", vis);
		}
	});
};
const handleMoveStart3d = () => set3dBuildingsVisible(false);
const handleMoveEnd3d = () => set3dBuildingsVisible(true);

const getTrafficFlowRenderState = () => {
	const mapInstance = map.value;
	const hasFlowLayer = Boolean(mapInstance?.getLayer?.("road-flow-core"));
	const hasCarSource = Boolean(mapInstance?.getSource?.("road-flow-cars"));
	const hasLocalSource = Boolean(
		mapInstance?.getSource?.(TRAFFIC_LOCAL_SOURCE_ID),
	);
	const hasNeonSource = Boolean(
		mapInstance?.getSource?.(TRAFFIC_NEON_SOURCE_ID),
	);
	let renderedRoadFlow = 0;
	let renderedCarCore = 0;
	let renderedCarSymbol = 0;

	if (
		mapInstance &&
		typeof mapInstance.queryRenderedFeatures === "function" &&
		hasFlowLayer
	) {
		try {
			renderedRoadFlow = mapInstance.queryRenderedFeatures(undefined, {
				layers: ["road-flow-core"],
			}).length;
			renderedCarCore = mapInstance.getLayer?.("road-flow-car-core")
				? mapInstance.queryRenderedFeatures(undefined, {
						layers: ["road-flow-car-core"],
					}).length
				: 0;
			renderedCarSymbol = mapInstance.getLayer?.("road-flow-car-symbol")
				? mapInstance.queryRenderedFeatures(undefined, {
						layers: ["road-flow-car-symbol"],
					}).length
				: 0;
		} catch {
			// Ignore render-query races during map style transitions.
		}
	}

	return {
		hasFlowLayer,
		hasCarSource,
		hasLocalSource,
		hasNeonSource,
		renderedRoadFlow,
		renderedCarCore,
		renderedCarSymbol,
	};
};

const hasTrafficFlowLayersMounted = () => {
	const state = getTrafficFlowRenderState();
	return state.hasFlowLayer && state.hasCarSource;
};

const hasTrafficFlowCarsVisible = () => {
	const currentZoom = Number(map.value?.getZoom?.() ?? 0);
	if (
		!Number.isFinite(currentZoom) ||
		currentZoom < TRAFFIC_FLOW_MIN_VISIBLE_ZOOM
	) {
		return true;
	}
	const state = getTrafficFlowRenderState();
	if (!state.hasFlowLayer || !state.hasCarSource) return false;
	if (state.renderedRoadFlow <= 0) return false;
	return Math.max(state.renderedCarCore, state.renderedCarSymbol) > 0;
};

const resolveTrafficFlowBootstrapSourceId = () => {
	const state = getTrafficFlowRenderState();
	if (state.hasLocalSource) return TRAFFIC_LOCAL_SOURCE_ID;
	if (state.hasNeonSource) return TRAFFIC_NEON_SOURCE_ID;
	return TRAFFIC_NEON_SOURCE_ID;
};

const ensureTrafficFlowBootstrap = () => {
	if (!map.value || !isMapReady.value || !allowTrafficFlowFx.value) return;
	const currentZoom = Number(map.value.getZoom?.() ?? 0);
	if (
		!Number.isFinite(currentZoom) ||
		currentZoom < TRAFFIC_FLOW_MIN_VISIBLE_ZOOM
	) {
		return;
	}
	if (hasTrafficFlowCarsVisible()) return;
	const sourceId = resolveTrafficFlowBootstrapSourceId();
	void refreshTrafficSubset({ force: true });
	addCarAnimation({ sourceId });
};

const scheduleTrafficFlowBootstrap = (
	delayMs = 180,
	remainingAttempts = TRAFFIC_BOOTSTRAP_MAX_ATTEMPTS,
) => {
	if (typeof window === "undefined") return;
	if (trafficBootstrapTimer) {
		clearTimeout(trafficBootstrapTimer);
	}
	trafficBootstrapTimer = window.setTimeout(() => {
		trafficBootstrapTimer = null;
		ensureTrafficFlowBootstrap();
		if (!hasTrafficFlowCarsVisible() && remainingAttempts > 1) {
			scheduleTrafficFlowBootstrap(
				TRAFFIC_BOOTSTRAP_RETRY_DELAY_MS,
				remainingAttempts - 1,
			);
		}
	}, delayMs);
};

const handleMapMoveEndForWeather = () => {
	void refreshTrafficSubset();
	scheduleTrafficFlowBootstrap();
	if (!allowWeatherFx.value) return;
	refreshWeather();
	applyFogSettings();
};

// Task 1.4: Handle terrain source missing on style load — defer re-enable to idle
const handleTerrainSourceOnStyleLoad = () => {
	if (!map.value) return;
	try {
		const style = map.value.getStyle();
		const terrainSourceId = style?.terrain?.source;
		if (!terrainSourceId) return;
		if (map.value.getSource(terrainSourceId)) return;
		// Source not yet loaded — remove terrain temporarily to suppress warnings
		map.value.setTerrain(null);
		map.value.once("idle", () => {
			if (!map.value) return;
			if (map.value.getSource(terrainSourceId)) {
				try {
					map.value.setTerrain({ source: terrainSourceId, exaggeration: 1.5 });
				} catch {
					// Ignore if style changed again before idle
				}
			}
		});
	} catch {
		// Ignore style transition races
	}
};

const handleMapStyleLoad = () => {
	void ensureBaseMapLayersReady();
	setCyberpunkAtmosphere();
	handleTerrainSourceOnStyleLoad();
	resetTrafficDashState();
	applyFogSettings();
	syncBuildingInfoPopupFromSelection();
	updateSoundVolumeFromZoom(true);
	if (allowTrafficFlowFx.value) {
		addCarAnimation({ sourceId: TRAFFIC_NEON_SOURCE_ID });
		scheduleTrafficFlowBootstrap();
	} else {
		stopCarAnimation();
	}
	scheduleProgressiveHeavyEffects();
};

// ✅ Focus Location (Fly To) - Smooth & Precise Centering
// Focus Location moved to composable
const focusLocation = (
	coords,
	targetZoom,
	pitch,
	extraBottomOffset,
	cameraOptions,
) => {
	if (cameraOptions?.cameraMode === "locate") {
		hasAutoCenteredOnUser.value = true;
	}
	focusLocationCore(
		coords,
		targetZoom,
		pitch ?? 60,
		extraBottomOffset,
		cameraOptions,
	);
};

const locateUser = (
	coords,
	targetZoom = 17,
	extraBottomOffset = 0,
	options = {},
) => {
	hasAutoCenteredOnUser.value = true;
	const { refine = false, ...cameraOptions } = options || {};
	syncUserLocationDomMarker(coords);
	if (ensureUserLocationLayers()) {
		applySourceData(
			USER_LOCATION_SOURCE_ID,
			buildUserLocationFeatureCollectionFromLngLat(coords),
		);
	}
	focusLocationCore(coords, targetZoom, 60, extraBottomOffset, {
		cameraMode: "locate",
		duration: refine ? 900 : 1200,
		interrupt: true,
		...cameraOptions,
	});
};

// Center on User moved to composable
const centerOnUser = () => {
	centerOnUserCore();
};

let userLocationMarker = null;
const removeUserLocationMarker = () => {
	if (!userLocationMarker) return;
	userLocationMarker.remove();
	userLocationMarker = null;
};
const createUserLocationMarkerElement = () => {
	if (typeof document === "undefined") return null;
	const root = document.createElement("div");
	root.className = "vibe-user-location-marker";
	root.innerHTML = `
		<span class="vibe-user-location-marker__pulse"></span>
		<span class="vibe-user-location-marker__ring"></span>
		<span class="vibe-user-location-marker__dot"></span>
	`;
	return root;
};
const ensureUserLocationDomMarker = () => {
	if (!map.value || userLocationMarker) return userLocationMarker;
	const element = createUserLocationMarkerElement();
	if (!element) return null;
	userLocationMarker = new maplibregl.Marker({
		element,
		anchor: "center",
		pitchAlignment: "viewport",
		rotationAlignment: "viewport",
	});
	return userLocationMarker;
};
const syncUserLocationDomMarker = (coords = null) => {
	if (!map.value) return;
	const lngLat = Array.isArray(coords)
		? [Number(coords[0]), Number(coords[1])]
		: normalizeUserLocationToCenter(props.userLocation);
	if (
		!Array.isArray(lngLat) ||
		lngLat.length < 2 ||
		!Number.isFinite(lngLat[0]) ||
		!Number.isFinite(lngLat[1])
	) {
		removeUserLocationMarker();
		return;
	}
	const marker = ensureUserLocationDomMarker();
	if (!marker) return;
	marker.setLngLat(lngLat);
	try {
		marker.addTo(map.value);
	} catch {
		// Ignore duplicate add attempts during style churn.
	}
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
		reportMapLifecycle("style_switch_failed", {
			reason: "set_style_failed",
			message: e?.message || String(e),
		});
		return;
	}

	map.value.once("style.load", async () => {
		mapInteractionsInitialized = false;
		if (!map.value) return;
		if (seq !== styleApplySeq) return;
		await setupMapLayers();
		setupMapInteractions();
		updateMapSources();
		updateMarkers();
		updateEventMarkers();
		updateUserLocation();
		refreshSmartPulseTargets();
		scheduleMapRefresh({ allowSameViewport: true });
		map.value.once("idle", () => {
			scheduleMapRefresh({ force: true });
		});
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
	async () => {
		if (!map.value || !isMapReady.value) return;
		await setupMapLayers();
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

watch([trafficFlowQuality, effectiveMotionBudget, isPerfRestricted], () => {
	refreshSmartPulseTargets();
	if (!allowTrafficFlowFx.value) {
		stopCarAnimation();
	}
	if (isPerfRestricted.value) {
		resetTrafficDashState();
		return;
	}
	if (map.value && isMapReady.value && allowTrafficFlowFx.value) {
		void refreshTrafficSubset({ force: true });
		scheduleTrafficFlowBootstrap();
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
	if (!Array.isArray(shops) || shops.length === 0) return "0";
	const encodeSample = (shop) => {
		if (!shop || typeof shop !== "object") return "na";
		const id = String(shop?.id ?? "").trim();
		const lat = Number(shop?.lat ?? shop?.latitude);
		const lng = Number(shop?.lng ?? shop?.longitude);
		const status = String(shop?.status ?? "");
		const latSig = Number.isFinite(lat) ? lat.toFixed(4) : "na";
		const lngSig = Number.isFinite(lng) ? lng.toFixed(4) : "na";
		return `${id}:${latSig}:${lngSig}:${status}`;
	};
	const first = shops[0];
	const middle = shops[Math.floor(shops.length / 2)];
	const last = shops[shops.length - 1];
	return `${shops.length}:${encodeSample(first)}:${encodeSample(middle)}:${encodeSample(last)}`;
};

watch(
	() => props.shops,
	(newShops, oldShops) => {
		if (!Array.isArray(newShops)) {
			shopsByIdRef.value = new Map();
			allowedIdsRef.value = null;
			neonFeaturePropsCache.clear();
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
		for (const id of neonFeaturePropsCache.keys()) {
			if (!nextMap.has(id)) {
				neonFeaturePropsCache.delete(id);
			}
		}

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
	nowTick,
	() => {
		if (!map.value || !isMapReady.value) return;
		requestUpdateMarkers();
		scheduleMapRefresh({ allowSameViewport: true, localOnly: true });
	},
	{ deep: false },
);

watch(
	() => shopStore.collectedCoins,
	() => {
		if (!map.value || !isMapReady.value) return;
		updateMarkers(); // coin state is client-side — no pin RPC needed
	},
	{ deep: false },
);

watch(
	() => props.highlightedShopId,
	async (newId) => {
		await nextTick();
		updateSelectedPinLayerFilter(newId);
		updateMarkers();
		refreshSmartPulseTargets();
		scheduleMapRefresh(newId ? { force: true } : { allowSameViewport: true });
		syncSoundZoneFromSelection();
		syncBuildingInfoPopupFromSelection();
		if (!newId) {
			selectionSourceLabel.value = "none";
			cameraRequestId.value = "0";
			popupSettleState.value = "idle";
			closeActivePopup();
			hideBuildingInfoPopup();
			return;
		}
		const shop =
			shopStore.getShopById?.(newId) ||
			props.shops?.find((s) => String(s.id) === String(newId));
		// ── P2 Cinematic Focus: dim non-selected pins at Mapbox paint level ─────
		// GPU expression engine: zero Vue reactivity cost.
		// Transitions set BEFORE expressions — Mapbox interpolates between values
		// at the GPU level, matching the 400ms vignette CSS fade exactly.
		const _setPinFocus = (id) => {
			if (!map.value || !isMapReady.value) return;
			try {
				// 400ms matches the CSS vignette transition: opacity 0.4s cubic-bezier(0.16,1,0.3,1)
				const trans = { duration: 400, delay: 0 };
				const transFast = { duration: 200, delay: 0 };
				if (id) {
					const dimExpr = [
						"case",
						["==", ["get", "id"], String(id)],
						1.0,
						0.72,
					];
					const hitboxExpr = [
						"case",
						["==", ["get", "id"], String(id)],
						0.01,
						0.005,
					];
					if (map.value.getLayer(PIN_LAYER_ID)) {
						map.value.setPaintProperty(
							PIN_LAYER_ID,
							"icon-opacity-transition",
							trans,
						);
						map.value.setPaintProperty(
							PIN_LAYER_ID,
							"text-opacity-transition",
							trans,
						);
						map.value.setPaintProperty(PIN_LAYER_ID, "icon-opacity", dimExpr);
						map.value.setPaintProperty(PIN_LAYER_ID, "text-opacity", dimExpr);
					}
					if (map.value.getLayer(PIN_HITBOX_LAYER_ID)) {
						map.value.setPaintProperty(
							PIN_HITBOX_LAYER_ID,
							"circle-opacity-transition",
							trans,
						);
						map.value.setPaintProperty(
							PIN_HITBOX_LAYER_ID,
							"circle-opacity",
							hitboxExpr,
						);
					}
				} else {
					// Restore all pins — slightly faster fade-back feels snappier on dismiss
					if (map.value.getLayer(PIN_LAYER_ID)) {
						map.value.setPaintProperty(
							PIN_LAYER_ID,
							"icon-opacity-transition",
							transFast,
						);
						map.value.setPaintProperty(
							PIN_LAYER_ID,
							"text-opacity-transition",
							transFast,
						);
						map.value.setPaintProperty(PIN_LAYER_ID, "icon-opacity", 1);
						map.value.setPaintProperty(PIN_LAYER_ID, "text-opacity", 1);
					}
					if (map.value.getLayer(PIN_HITBOX_LAYER_ID)) {
						map.value.setPaintProperty(
							PIN_HITBOX_LAYER_ID,
							"circle-opacity-transition",
							{ duration: 0 },
						);
						map.value.setPaintProperty(
							PIN_HITBOX_LAYER_ID,
							"circle-opacity",
							0,
						);
					}
				}
			} catch {
				// Ignore transient style races during reload
			}
		};
		_setPinFocus(newId);

		if (shop) {
			buildingPopupShop.value = shop;
			syncBuildingPopupContent(shop);
			updateBuildingInfoPopupPosition(true);
		}
	},
);

watch(
	[() => props.selectionIntent, publicMapReady],
	async ([intent, ready]) => {
		if (!ready || !intent) return;
		await runSelectionIntent(intent);
	},
	{ deep: false, immediate: true },
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
	[() => props.userLocation, () => props.activeProvince],
	([nextUserLocation, nextProvince], [prevUserLocation, prevProvince]) => {
		if (!map.value || !isMapReady.value || !allowTrafficFlowFx.value) return;
		const nextAnchor = normalizeTrafficAnchor(nextUserLocation);
		const prevAnchor = normalizeTrafficAnchor(prevUserLocation);
		const provinceChanged =
			String(nextProvince || "") !== String(prevProvince || "");
		const anchorShifted = hasTrafficAnchorShifted(nextAnchor, prevAnchor);
		const trafficFlowNeedsBootstrap = !hasTrafficFlowCarsVisible();
		if (!provinceChanged && !anchorShifted && !trafficFlowNeedsBootstrap)
			return;
		const shouldForceRefresh =
			provinceChanged ||
			anchorShifted ||
			trafficFlowNeedsBootstrap ||
			!nextAnchor ||
			!prevAnchor;
		void refreshTrafficSubset({ force: shouldForceRefresh });
		scheduleTrafficFlowBootstrap(shouldForceRefresh ? 90 : 180);
	},
	{ deep: false },
);

watch(
	[hasActiveDetailSelection, publicMapReady],
	([hasDetailSelection, ready]) => {
		if (!ready) return;
		syncDetailModalMapGestures(hasDetailSelection);
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
		mapDebugLog("E2E Mode: Skipping MapLibre Initialization");
		isMapReady.value = true;
		return;
	}

	nowTickInterval = setInterval(() => {
		nowTick.value = Date.now();
	}, 60000);
});

onUnmounted(() => {
	syncDetailModalMapGestures(false);
	removeUserLocationMarker();
	deferredFeaturesDisposed = true;
	stopDeferredFeatureWatches();
	if (mapInitRequested.value && !isMapReady.value) {
		reportMapLifecycle("unmounted_before_ready", {
			reason: "teardown_before_ready",
			elapsedMs: mapInitStartedAt.value
				? Date.now() - mapInitStartedAt.value
				: 0,
		});
	}
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
	if (webglRecoveryTimer) {
		clearTimeout(webglRecoveryTimer);
		webglRecoveryTimer = null;
	}
	if (webglRestoreGraceTimer) {
		clearTimeout(webglRestoreGraceTimer);
		webglRestoreGraceTimer = null;
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
	queuedPinsRefreshLocalOnly = false;
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
	if (pointerPrecisionMediaQuery) {
		pointerPrecisionMediaQuery.removeEventListener?.(
			"change",
			handlePointerPrecisionChange,
		);
		pointerPrecisionMediaQuery = null;
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
	_heatmapInstance?.removeHeatmapLayer?.();
	_heatmapInstance?.stopBreathing?.();
	_heatmapInstance = null;
	_weatherInstance = null;
	_vibeEffectsInstance = null;
	_dollyZoomInstance = null;
	activeVibeEffects.value = [];
	neonFeaturePropsCache.clear();
	lastGoodPinFeatures = [];
	lastGoodProvinceAggregateFeatures = [];
	styleApplySeq = 0;
	clearVibeEffectMarkers();

	if (nowTickInterval) {
		clearInterval(nowTickInterval);
		nowTickInterval = null;
	}
	if (trafficRefreshInterval) {
		clearInterval(trafficRefreshInterval);
		trafficRefreshInterval = null;
	}
	if (trafficBootstrapTimer) {
		clearTimeout(trafficBootstrapTimer);
		trafficBootstrapTimer = null;
	}
	clearHotRoadPollTimer();

	teardownMap();
});

// ─── Keyboard Navigation (a11y) ─────────────────────────────────────────────
const handleVenueKeyNav = (e, shop, index) => {
	const list = e.currentTarget.closest("ul");
	const items = list ? [...list.querySelectorAll('li[tabindex="0"]')] : [];
	if (e.key === "Enter" || e.key === " ") {
		e.preventDefault();
		if (shop.lat && shop.lng) {
			flyToCore({ center: [shop.lng, shop.lat], zoom: 17 });
		}
		emit("select-shop", shop);
	} else if (e.key === "ArrowDown") {
		e.preventDefault();
		items[index + 1]?.focus();
	} else if (e.key === "ArrowUp") {
		e.preventDefault();
		items[index - 1]?.focus();
	}
};

defineExpose({
	map,
	isMapReady,
	focusLocation,
	locateUser,
	centerOnUser,
	webGLSupported,
	maplessMode,
	initMapOnce,
	resize: () => queueMapResize(true),
	// Handles (options) object or (coords, zoom) legacy signatures.
	flyTo: flyToCore,
});
</script>

<template>
  <div
    data-testid="map-shell"
    :data-map-ready="publicMapReady ? 'true' : 'false'"
    :data-map-shell-ready="isMapReady ? 'true' : 'false'"
    :data-map-content-ready="isMapContentReady ? 'true' : 'false'"
    :data-map-style-mode="RESOLVED_STYLE_MODE"
    :data-map-active-style-url="activeStyleUrl || currentStyleUrl || ''"
    :data-map-selection-source="selectionSourceLabel"
    :data-map-camera-request-id="cameraRequestId"
    :data-map-popup-settle-state="popupSettleState"
    :data-map-init-requested="mapInitRequested ? 'true' : 'false'"
    :data-map-token-invalid="isTokenInvalid ? 'true' : 'false'"
    :aria-label="mapA11yLabel"
    :aria-busy="shouldShowMapLoadingSkeleton ? 'true' : 'false'"
    :style="mapWrapperStyle"
    :class="[
      'relative w-full h-full z-0 transition-colors duration-500',
      isDarkMode ? 'bg-[#09090b]' : 'bg-gray-200',
      { 'dashboard-open': isDashboardOpen }
    ]"
  >
    <div
      ref="mapContainer"
      data-testid="map-canvas"
      class="w-full h-full absolute inset-0 opacity-100"
      tabindex="0"
      :aria-label="tt('map.ready', 'Interactive city map')"
    >
      <!-- ✅ P2 Cinematic Focus Mode: vignette overlay that fades in when a venue is selected -->
      <!-- Entirely CSS-driven, pointer-events:none, GPU-composited — zero JS cost -->
      <div
        class="map-focus-vignette"
        :class="{ active: !!props.highlightedShopId }"
        aria-hidden="true"
      />
    </div>

    <MapLoadingSkeleton
      v-if="shouldShowMapLoadingSkeleton"
      class="absolute inset-0 z-[1100] pointer-events-none"
    />

    <button
      v-if="shouldShowLocateMeControl"
      type="button"
      data-testid="map-locate-me"
      class="absolute right-4 z-[2300] rounded-full border border-white/15 bg-black/55 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-[0_12px_32px_rgba(2,6,23,0.34)] backdrop-blur-md transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      :style="locateMeControlStyle"
      :aria-label="$t('auto.k_1ccc1cf2') || 'My Location'"
      @click="emit('locate-me')"
    >
      {{ $t("auto.k_1ccc1cf2") || "My Location" }}
    </button>

    <div
      v-if="IS_DEV_BUILD && RESOLVED_STYLE_MODE === 'quiet'"
      class="absolute top-4 left-4 z-[2300] rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100"
      role="status"
      aria-live="polite"
    >
      Quiet map preview
    </div>

    <div
      v-if="isOffline"
      class="absolute top-16 right-4 z-[2300] px-3 py-2 rounded-lg bg-amber-500/85 text-black text-xs font-semibold"
      role="status"
      aria-live="polite"
    >
      {{ $t("app.you_are_offline") || "Offline mode" }}
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
      v-if="allowViewportGlow && !maplessMode"
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
              <code class="bg-white/10 px-1 rounded">{{ $t("auto.k_db0beaa4") }}</code>
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
          class="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl"
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
      v-if="!maplessMode"
      class="absolute inset-0 z-[1] pointer-events-none transition-colors duration-500"
    ></div>

    <div
      v-if="!maplessMode"
      class="absolute inset-0 z-[1] pointer-events-none overflow-hidden"
    >
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

    <!-- Hidden keyboard-accessible venue list for screen readers / keyboard users -->
    <ul
      role="list"
      :aria-label="tt('map.venues_list', 'Venues')"
      class="sr-only"
    >
      <li
        v-for="(shop, index) in props.shops?.slice(0, 50)"
        :key="shop.id"
        tabindex="0"
        role="listitem"
        :aria-label="shop.name"
        @keydown="(e) => handleVenueKeyNav(e, shop, index)"
      >
        {{ shop.name }}
      </li>
    </ul>
  </div>
</template>

<style>
/* MapLibre Popup Overrides */
.maplibregl-popup {
  z-index: 4300 !important;
}

.maplibregl-popup-content {
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 12px !important;
  pointer-events: auto !important;
}

/* Hide popup tip for all popups except vibe-maplibre-popup (which has neon styling) */
.maplibregl-popup:not(.vibe-maplibre-popup) .maplibregl-popup-tip {
  display: none !important;
}

/* Neon-styled tip for vibe popup — matches zinc-900/95 content bg with cyan glow */
.vibe-maplibre-popup .maplibregl-popup-tip {
  border-top-color: rgba(24, 24, 27, 0.95) !important;
  border-width: 10px 8px 0 8px !important;
  filter: drop-shadow(0 4px 8px rgba(0, 229, 255, 0.35));
  margin: -1px auto 0 !important;
}

.vibe-maplibre-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip {
  align-self: center;
}

.vibe-maplibre-popup .maplibregl-popup-content {
  overflow: visible;
  background: transparent !important;
  box-shadow: none !important;
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

.vibe-maplibre-popup {
  z-index: 4300 !important;
}

.vibe-user-location-marker {
  position: relative;
  width: 44px;
  height: 44px;
  pointer-events: none;
}

.vibe-user-location-marker__pulse,
.vibe-user-location-marker__ring,
.vibe-user-location-marker__dot {
  position: absolute;
  inset: 50% auto auto 50%;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.vibe-user-location-marker__pulse {
  width: 34px;
  height: 34px;
  background: rgba(96, 165, 250, 0.22);
  animation: vibe-user-location-pulse 1.8s ease-out infinite;
}

.vibe-user-location-marker__ring {
  width: 18px;
  height: 18px;
  background: rgba(59, 130, 246, 0.14);
  border: 2px solid rgba(191, 219, 254, 0.95);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.18);
}

.vibe-user-location-marker__dot {
  width: 12px;
  height: 12px;
  background: #2563eb;
  border: 3px solid #fff;
  box-shadow:
    0 0 0 2px rgba(37, 99, 235, 0.28),
    0 6px 18px rgba(37, 99, 235, 0.3);
}

@keyframes vibe-user-location-pulse {
  0% {
    opacity: 0.85;
    transform: translate(-50%, -50%) scale(0.72);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.28);
  }
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

/* ✅ P2 Cinematic Focus Mode — vignette overlay */
/* Darkens map edges when a venue is selected, drawing focus to the selected pin.
   Pure CSS: radial gradient + opacity transition. GPU-composited, zero JS cost.
   pointer-events: none ensures the map remains fully interactive. */
.map-focus-vignette {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(
    ellipse 88% 80% at 50% 50%,
    transparent 54%,
    rgba(0, 0, 0, 0.16) 100%
  );
  opacity: 0;
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity;
}

.map-focus-vignette.active {
  opacity: 0.72;
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

/* Hide MapLibre Logo & Controls Container per requirement */
.maplibregl-ctrl-bottom-left {
  display: none !important;
}

/*
 * เมื่อ dashboard เปิด ซ่อน attribution bar ทั้งหมด
 * เพื่อป้องกัน WebGL rendering artifact ที่ bottom edge บน mobile GPU
 * :deep() เพราะ MapLibre inject elements นอก Vue scope
 */
.dashboard-open :deep(.maplibregl-ctrl-bottom-left),
.dashboard-open :deep(.maplibregl-ctrl-bottom-right),
.dashboard-open :deep(.maplibregl-ctrl-attrib),
.dashboard-open :deep(.maplibregl-compact) {
  display: none !important;
  visibility: hidden !important;
}

/*
 * Fallback: ถ้า context lost ยังมี artifact — force repaint ด้วย translateZ
 * แต่ OFF เมื่อ dashboard เปิดเพื่อไม่ waste GPU compositing layer
 */
.maplibregl-canvas {
  transform: translateZ(0);
  backface-visibility: hidden;
}
.dashboard-open .maplibregl-canvas {
  transform: none;
  backface-visibility: visible;
}

@media (prefers-reduced-motion: reduce) {
  .map-focus-vignette {
    /* Disable vignette for users who prefer no motion / reduced animations */
    transition: none !important;
    opacity: 0 !important;
  }

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
