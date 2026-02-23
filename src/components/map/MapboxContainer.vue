// --- C:\vibecity.live\src\components\map\MapboxContainer.vue ---

<script setup>
import { DEFAULT_CITY } from "@/config/cityConfig";
import mapboxgl from "mapbox-gl";
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
import { useMapAtmosphere } from "../../composables/map/useMapAtmosphere"; // ✅ New Composable
import { useMapCore } from "../../composables/map/useMapCore"; // ✅ New Composable
import { useMapHeatmap } from "../../composables/map/useMapHeatmap";
import { useMapInteractions } from "../../composables/map/useMapInteractions"; // ✅ New Composable
import { useMapLayers } from "../../composables/map/useMapLayers";
import { useMapMarkers } from "../../composables/map/useMapMarkers";
import { useMapPopups } from "../../composables/map/useMapPopups";
import { useMapRealtime } from "../../composables/map/useMapRealtime";
import { useAudioSystem } from "../../composables/useAudioSystem";
import { useHaptics } from "../../composables/useHaptics";
import { useWeather } from "../../composables/useWeather";
import { useShopStore } from "../../store/shopStore";
import { useUserPreferencesStore } from "../../store/userPreferencesStore";
import "../../styles/map-atmosphere.css";
import { openExternal } from "../../utils/browserUtils";
import { createPopupHTML } from "../../utils/mapRenderer";
import { calculateDistance } from "../../utils/shopUtils";
// import { WeatherLayer } from "./layers/WeatherLayer"; // Moved
import LiveActivityChips from "./LiveActivityChips.vue";

const DARK_STYLE = "mapbox://styles/phirrr/cmlktq68u002601se295iazmm";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";
const PIN_SOURCE_ID = "pins_source";
const PIN_LAYER_ID = "unclustered-pins";
const CLUSTER_LAYER_ID = "clusters";
const CLUSTER_COUNT_LAYER_ID = "cluster-count";
const DISTANCE_LINE_SOURCE_ID = "distance-line";
const IS_E2E = import.meta.env.VITE_E2E === "true";
const IS_STRICT_MAP_E2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";

const sanitizeEnvToken = (value) =>
  typeof value === "string" ? value.trim().replace(/^['"]|['"]$/g, "") : "";

const { t, te, locale } = useI18n();
const tt = (key, fallback) => (te(key) ? t(key) : fallback);

const shopStore = useShopStore();
const prefs = useUserPreferencesStore();
const styleUrlForTheme = (isDarkMode) =>
  isDarkMode ? DARK_STYLE : LIGHT_STYLE;

// ✅ Vibe Effects
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

const handleSocketMessage = (data) => {
  // 1. Vibe Effects
  if (data.type === "vibe" && data.lat && data.lng) {
    triggerVibeEffect(
      { id: data.shopId, lat: data.lat, lng: data.lng },
      data.content,
    );
  }

  // 2. Heatmap Update
  if (data.type === "heatmap" && map.value) {
    updateHeatmapData(data.data);
  }

  // 3. Realtime hotspot snapshot
  if (data.type === "hotspot_update") {
    consumeHotspotUpdate(data.data);
  }

  // 4. Burst map effects from backend queue
  if (data.type === "map_effect") {
    consumeMapEffects(data.events || []);
  }
};

// ✅ Single Socket Listener (merged)
onMounted(() => {
  socketService.addListener(handleSocketMessage);
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

// ✅ Motion / Performance Preferences
const prefersReducedMotion = ref(false);
let motionMediaQuery = null;
const isPerfRestricted = computed(
  () =>
    props.isLowPowerMode || prefs.isReducedMotion || prefersReducedMotion.value,
);
const allowAmbientFx = computed(
  () => prefs.isAmbientFxEnabled && !isPerfRestricted.value,
);
const allowNeonPulse = computed(
  () => prefs.isNeonPulseEnabled && !isPerfRestricted.value,
);
const allowHeatmap = computed(
  () => prefs.isHeatmapEnabled && !isPerfRestricted.value,
);
const allow3dBuildings = computed(
  () => prefs.is3dBuildingsEnabled && !isPerfRestricted.value,
);
const allowMapFog = computed(
  () => prefs.isMapFogEnabled && !isPerfRestricted.value,
);
const allowViewportGlow = computed(
  () => prefs.isViewportGlowEnabled && !isPerfRestricted.value,
);
const viewportGlowOpacity = ref(allowViewportGlow.value ? 0.5 : 0);
const allowWeatherFx = computed(() => prefs.isWeatherFxEnabled && !IS_E2E);
const effectiveMotionBudget = computed(() => {
  if (isPerfRestricted.value) return "micro";
  return prefs.motionBudget || "micro";
});
const shouldRunAtmosphere = computed(
  () => allowAmbientFx.value || allowNeonPulse.value,
);
const isDocumentHidden = ref(
  typeof document !== "undefined" ? document.hidden : false,
);

// ── Traffic dash / fireflies stubs ──────────────────
// These functions are called from map lifecycle hooks but were
// extracted into future composables. Define no-op stubs until
// the composables are wired in, so the component boots cleanly.
const resetTrafficDashState = () => {
  /* noop — traffic dash composable WIP */
};
const removeFirefliesLayer = () => {
  if (!map.value) return;
  try {
    if (map.value.getLayer("fireflies-layer"))
      map.value.removeLayer("fireflies-layer");
    if (map.value.getSource("fireflies-source"))
      map.value.removeSource("fireflies-source");
  } catch {
    /* layer may not exist */
  }
};

const emit = defineEmits([
  "select-shop",
  "open-detail",
  "open-building",
  "exit-indoor",
  "open-ride-modal",
]);

// ✅ Map State (Refactored)
const mapContainer = ref(null);
const { map, isMapReady, initMap, setMapStyle } = useMapCore(mapContainer);
const mapReadyFallbackArmed = ref(false);
const currentStyleUrl = ref(null);
let styleApplySeq = 0;

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
  initMap(center.value, zoom.value, initialStyleUrl);
};

onMounted(() => {
  if (!IS_STRICT_MAP_E2E) return;
  mapReadyFallbackArmed.value = true;
  window.setTimeout(() => {
    if (!mapReadyFallbackArmed.value) return;
    if (
      !isMapReady.value &&
      mapInitRequested.value &&
      webGLSupported.value &&
      !isTokenInvalid.value
    ) {
      // Never force-ready map state; keep failures visible in strict E2E.
      console.warn("Map did not become ready within strict E2E timeout");
    }
  }, 12_000);
});

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

// ✅ Composables
const {
  addNeonRoads,
  addClusters,
  setCyberpunkAtmosphere,
  addCyberpunkBuildings,
} = useMapLayers(map);

const {
  markersMap,
  eventMarkersMap,
  updateMarkers: updateMarkersCore,
  updateEventMarkers: updateEventMarkersCore,
} = useMapMarkers(map);

import { getMapPins } from "../../services/shopService"; // ✅ Import RPC Service

const zoom = ref(15);
const center = ref([DEFAULT_CITY.lng, DEFAULT_CITY.lat]);
const pitch = ref(60);
const bearing = ref(-17.6);
const mapLoaded = ref(false);
const activePopup = shallowRef(null);
const mapInitRequested = ref(false);
const nowTick = ref(Date.now());
let nowTickInterval = null;
const mapHapticAt = 0;
const MAP_HAPTIC_COOLDOWN_MS = 220;
const currentMapZoom = ref(zoom.value);

const { updateHeatmapData, addHeatmapLayer, removeHeatmapLayer } =
  useMapHeatmap(map, allowHeatmap);

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
  if (prefs.isSoundEnabled && !IS_E2E) {
    audio.setWeather(newVal);
  }
});

// watch([weatherCondition, isMapReady], updateWeatherVisuals); // Moved to composable
// Watch for sound pref changes to re-sync
watch(
  () => prefs.isSoundEnabled,
  (enabled) => {
    if (enabled && !IS_E2E) {
      audio.setWeather(weatherCondition.value);
      syncSoundZoneFromSelection();
    } else {
      audio.stop();
    }
  },
);

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
  if (IS_E2E || !prefs.isSoundEnabled) return;
  audio.ensureStarted();
  removeSoundGestureListener();
};
const updateSoundVolumeFromZoom = (force = false) => {
  if (IS_E2E || !prefs.isSoundEnabled || !map.value) return;
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
  if (IS_E2E || !prefs.isSoundEnabled) return;
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
} = useMapPopups(map, mapContainer);

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
  liveActivityChips,
  consumeHotspotUpdate,
  spawnTapRipple,
  ensureTapRippleLayer,
  consumeMapEffects,
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

// Route neon trail state (Keep here or extract later)
let routeTrailTimer = null;
let routeTrailPhase = 0;
const hasActiveRoute = ref(false);

// Realtime logic handled by composable

// Pulse logic handled by composable

const applyRouteTrailVisibility = () => {
  if (!map.value) return;
  const active = hasActiveRoute.value;
  if (map.value.getLayer("distance-line-layer")) {
    map.value.setPaintProperty(
      "distance-line-layer",
      "line-opacity",
      active ? 0.9 : 0,
    );
  }
  if (map.value.getLayer("distance-line-glow")) {
    map.value.setPaintProperty(
      "distance-line-glow",
      "line-opacity",
      active ? 0.22 : 0,
    );
  }
};

const stopRouteTrailAnimation = () => {
  if (routeTrailTimer) {
    clearInterval(routeTrailTimer);
    routeTrailTimer = null;
  }
  applyRouteTrailVisibility();
};

const startRouteTrailAnimation = () => {
  if (!map.value || !hasActiveRoute.value) return;
  if (isPerfRestricted.value) {
    applyRouteTrailVisibility();
    return;
  }
  if (routeTrailTimer) return;

  routeTrailTimer = setInterval(() => {
    if (!map.value || !hasActiveRoute.value) {
      stopRouteTrailAnimation();
      return;
    }
    if (document.hidden) return;
    routeTrailPhase = (routeTrailPhase + 1) % 5;
    const dashPatterns = [
      [0.2, 1.8, 0.6],
      [0.6, 1.4, 0.8],
      [1.0, 1.0, 1.0],
      [1.4, 0.8, 1.2],
      [1.8, 0.6, 1.4],
    ];
    const pulse = (Math.sin(Date.now() / 240) + 1) / 2;
    if (map.value.getLayer("distance-line-layer")) {
      map.value.setPaintProperty(
        "distance-line-layer",
        "line-dasharray",
        dashPatterns[routeTrailPhase],
      );
      map.value.setPaintProperty(
        "distance-line-layer",
        "line-opacity",
        0.65 + pulse * 0.3,
      );
    }
    if (map.value.getLayer("distance-line-glow")) {
      map.value.setPaintProperty(
        "distance-line-glow",
        "line-opacity",
        0.18 + pulse * 0.22,
      );
    }
  }, 140);
};

// ✅ Dynamic Data Fetching State
const MAP_REFRESH_DEBOUNCE_MS = 250;
const MAP_REFRESH_MIN_INTERVAL_MS = 1200;
let rafToken = null;
let refreshDebounceTimer = null;
let pinsRefreshSeq = 0;
let lastMapRefreshAt = 0;
let lastViewportKey = "";

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

  if (!map.value || !isMapReady.value) return;
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
  }

  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    if (!map.value || !isMapReady.value) return;

    const now = Date.now();
    const viewportKey = getViewportKey();

    if (!force && viewportKey && viewportKey === lastViewportKey) return;
    if (!force && now - lastMapRefreshAt < MAP_REFRESH_MIN_INTERVAL_MS) return;

    lastViewportKey = viewportKey;
    lastMapRefreshAt = now;

    if (rafToken) cancelAnimationFrame(rafToken);
    rafToken = requestAnimationFrame(async () => {
      rafToken = null;
      await refreshPins();
    });
  }, MAP_REFRESH_DEBOUNCE_MS);
};

const refreshPins = async () => {
  if (!map.value || !isMapReady.value) return;

  const seq = ++pinsRefreshSeq;
  const b = map.value.getBounds();
  const currentZoom = map.value.getZoom();

  const shops = Array.isArray(props.shops) ? props.shops : null;
  const allowedIds =
    shops === null
      ? null
      : shops.length === 0
        ? new Set()
        : new Set(shops.map((s) => String(s?.id ?? "")).filter(Boolean));

  const isAllowedId = (id) => {
    if (allowedIds === null) return true;
    return allowedIds.has(String(id));
  };

  const toPinFeature = ({
    id,
    name,
    lat,
    lng,
    pin_type,
    verified,
    glow,
    boost,
    giant,
    visibility_score,
    image,
  }) => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

    const idStr = String(id ?? "").trim();
    if (!idStr) return null;

    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lngNum, latNum] },
      properties: {
        id: idStr,
        name: name || "",
        pin_type: pin_type || "normal",
        verified: Boolean(verified),
        glow: Boolean(glow),
        boost: Boolean(boost),
        giant: Boolean(giant),
        visibility_score: Number(visibility_score ?? 0) || 0,
        is_live: liveVenueRefs.value.has(idStr),
        vibe_score: Number(visibility_score ?? 0) || 0,
        image: image || null,
      },
    };
  };

  const pinFeatureFromShop = (shop) => {
    if (!shop) return null;
    return toPinFeature({
      id: shop.id,
      name: shop.name,
      lat: shop.lat ?? shop.latitude,
      lng: shop.lng ?? shop.longitude,
      pin_type: shop.is_giant_active ? "giant" : "normal",
      verified: shop.is_verified || shop.verifiedActive,
      glow: shop.is_glowing || shop.glowActive,
      boost: shop.is_boost_active || shop.boostActive,
      giant: shop.is_giant_active || shop.giantActive,
      visibility_score: shop.visibility_score ?? shop.visibilityScore,
      image: shop.Image_URL1 || shop.coverImage || shop.image_urls?.[0],
    });
  };

  const pinFeatureFromRpc = (p) => {
    if (!p) return null;
    return toPinFeature({
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      pin_type: p.pinType,
      verified: p.verifiedActive,
      glow: p.glowActive,
      boost: p.boostActive,
      giant: p.giantActive,
      visibility_score: p.visibilityScore,
      image: p.coverImage,
    });
  };

  const ensureHighlightedShop = (features) => {
    const highlightedId =
      props.highlightedShopId != null ? String(props.highlightedShopId) : null;
    if (!highlightedId) return features;
    if (!shops?.length) return features;
    if (allowedIds !== null && !allowedIds.has(highlightedId)) return features;

    const shop = shops.find((s) => String(s?.id ?? "") === highlightedId);
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

  const buildFallbackFeaturesFromShopsInBounds = () => {
    if (!shops?.length) return [];
    const south = b.getSouth();
    const west = b.getWest();
    const north = b.getNorth();
    const east = b.getEast();

    const limit =
      currentZoom < 13 ? 120 : currentZoom < 15 ? 320 : Math.min(1200, 2000);

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
    const source = map.value.getSource(PIN_SOURCE_ID);
    if (!source) return;
    source.setData({ type: "FeatureCollection", features });
    refreshSmartPulseTargets();
  };

  if (IS_E2E) {
    const fallback = ensureHighlightedShop(
      buildFallbackFeaturesFromShopsInBounds(),
    );
    applyFeatures(fallback);
    return;
  }

  try {
    const pins = await getMapPins({
      p_min_lat: b.getSouth(),
      p_min_lng: b.getWest(),
      p_max_lat: b.getNorth(),
      p_max_lng: b.getEast(),
      p_zoom: currentZoom,
    });

    if (seq !== pinsRefreshSeq) return;

    const rpcFeatures = (pins || [])
      .filter((p) => isAllowedId(p?.id))
      .map(pinFeatureFromRpc)
      .filter(Boolean);

    let features = ensureHighlightedShop(rpcFeatures);
    if (!features.length) {
      features = ensureHighlightedShop(
        buildFallbackFeaturesFromShopsInBounds(),
      );
    }
    applyFeatures(features);
  } catch (err) {
    console.error("Failed to refresh map pins:", err);
    const fallback = buildFallbackFeaturesFromShopsInBounds();
    applyFeatures(ensureHighlightedShop(fallback));
  }
};

// Bind events
watch(isMapReady, (ready) => {
  if (ready && map.value) {
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

    // Start Atmosphere Loop
    if (shouldRunAtmosphere.value) {
      startAtmosphereLoop();
    }

    if (prefs.isSoundEnabled && !IS_E2E) {
      attachSoundGestureListener();
      syncSoundZoneFromSelection();
      updateSoundVolumeFromZoom(true);
    }
  }
});

const secondCounter = ref(0);
const roadDistance = ref(null);
const roadDuration = ref(null);
let routeAbortController = null;

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
    if (map.value?.getSource(DISTANCE_LINE_SOURCE_ID)) {
      map.value.getSource(DISTANCE_LINE_SOURCE_ID).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
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

    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${uLng},${uLat};${sLng},${sLat}?geometries=geojson&access_token=${mapboxgl.accessToken}`,
      { signal: routeAbortController.signal },
    );

    if (!res.ok) return;

    const data = await res.json();
    if (data.routes?.[0]) {
      const route = data.routes[0].geometry;

      // Update Map Source
      if (map.value?.getSource(DISTANCE_LINE_SOURCE_ID)) {
        map.value.getSource(DISTANCE_LINE_SOURCE_ID).setData({
          type: "Feature",
          geometry: route,
        });
      }

      // Update State & UI
      roadDistance.value = data.routes[0].distance;
      roadDuration.value = data.routes[0].duration;
      updatePopupUi(roadDistance.value, roadDuration.value);
      hasActiveRoute.value = true;
      if (allowNeonPulse.value && !isPerfRestricted.value) {
        startRouteTrailAnimation();
      } else {
        applyRouteTrailVisibility();
      }
    } else {
      hasActiveRoute.value = false;
      stopRouteTrailAnimation();
    }
  } catch (err) {
    if (err.name !== "AbortError") {
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
const vibeMarkersMap = new Map(); // Track effect markers by effect ID

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
  { deep: true },
);

// ✅ Visibility Logic (User Request)
const pinsVisible = ref(true);

watch(
  [() => props.isImmersive, () => props.isGiantPinView],
  ([immersive, giantView]) => {
    const shouldHide = immersive || giantView;
    pinsVisible.value = !shouldHide;

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
        CLUSTER_COUNT_LAYER_ID,
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

// 3D Buildings & Fog removal moved to composable
const {
  startAtmosphereLoop,
  stopAtmosphereLoop,
  applyFogSettings,
  updateWeatherVisuals,
  remove3dBuildingLayers,
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

// ✅ Map Layers & Sources Setup
/**
 * Setup static map layers (sources and layers).
 * This is called once on map load or style change.
 */
// ✅ Map Layers & Sources Setup (Refactored)
const setupMapLayers = () => {
  if (!map.value) return;

  // 1. Core Layers from Composable
  setCyberpunkAtmosphere(); // 🟣 Base atmosphere palette
  if (allow3dBuildings.value) {
    addCyberpunkBuildings(); // 🏙️ Gradient Buildings
  } else if (map.value.getLayer("3d-buildings-cyber")) {
    map.value.removeLayer("3d-buildings-cyber");
  }
  addNeonRoads();

  // 2. Main Pins Source (Clustered)
  if (!map.value.getSource(PIN_SOURCE_ID)) {
    map.value.addSource(PIN_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      promoteId: "id",
      cluster: true,
      clusterMaxZoom: 12, // Cluster only at low zoom (Zoom < 13 rules)
      clusterRadius: 60,
      clusterProperties: {
        vibe_sum: ["+", ["coalesce", ["get", "vibe_score"], 0]],
        boost_count: ["+", ["case", ["==", ["get", "boost"], true], 1, 0]],
        live_count: ["+", ["case", ["==", ["get", "is_live"], true], 1, 0]],
      },
    });
  }

  // 3. Clusters Layer (Circle)
  if (!map.value.getLayer(CLUSTER_LAYER_ID)) {
    map.value.addLayer({
      id: CLUSTER_LAYER_ID,
      type: "circle",
      source: PIN_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "case",
          [">", ["coalesce", ["get", "live_count"], 0], 0],
          "#06b6d4",
          [">", ["coalesce", ["get", "boost_count"], 0], 0],
          "#f97316",
          [
            ">=",
            [
              "/",
              ["coalesce", ["get", "vibe_sum"], 0],
              ["max", ["get", "point_count"], 1],
            ],
            80,
          ],
          "#f59e0b",
          [
            ">=",
            [
              "/",
              ["coalesce", ["get", "vibe_sum"], 0],
              ["max", ["get", "point_count"], 1],
            ],
            40,
          ],
          "#8b5cf6",
          "#3b82f6",
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "point_count"],
          1,
          18,
          25,
          24,
          100,
          32,
          750,
          40,
        ],
        "circle-opacity": 0.85,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255,255,255,0.85)",
      },
    });
  }

  if (!map.value.getLayer("clusters-halo")) {
    map.value.addLayer(
      {
        id: "clusters-halo",
        type: "circle",
        source: PIN_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "case",
            [">", ["coalesce", ["get", "live_count"], 0], 0],
            "#22d3ee",
            [">", ["coalesce", ["get", "boost_count"], 0], 0],
            "#fb7185",
            "#a78bfa",
          ],
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "point_count"],
            1,
            24,
            25,
            30,
            100,
            38,
            750,
            46,
          ],
          "circle-opacity": 0.24,
          "circle-blur": 0.9,
        },
      },
      CLUSTER_LAYER_ID,
    );
  }

  // 4. Cluster Count (Symbol)
  if (!map.value.getLayer(CLUSTER_COUNT_LAYER_ID)) {
    map.value.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: "symbol",
      source: PIN_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });
  }

  // 5. Unclustered Pins (The main view)
  // Shows varying icons based on Giant/Boost/Normal status
  if (!map.value.getLayer(PIN_LAYER_ID)) {
    map.value.addLayer({
      id: PIN_LAYER_ID,
      type: "symbol",
      source: PIN_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": [
          "case",
          ["==", ["get", "pin_type"], "giant"],
          "pin-giant", // Ensure this image is loaded in loadMapImages
          ["==", ["get", "boost"], true],
          "pin-boost", // Ensure this image is loaded
          "pin-normal", // Default
        ],
        "icon-size": [
          "case",
          ["==", ["get", "pin_type"], "giant"],
          1.2, // Giant Size
          ["==", ["get", "boost"], true],
          1.0, // Boost Size
          0.8, // Normal Size
        ],
        "icon-allow-overlap": true,
        "icon-anchor": "bottom",
        "text-field": [
          "case",
          ["==", ["get", "pin_type"], "giant"],
          ["get", "name"], // Show name for Giant pins always
          ["==", ["get", "boost"], true],
          ["get", "name"], // Show name for Boost pins
          "", // Hide name for normal pins to reduce clutter
        ],
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

  // 5.1 Pin Glow (dynamic color by pin type/state)
  if (map.value.getLayer(PIN_LAYER_ID) && !map.value.getLayer("pin-glow")) {
    map.value.addLayer(
      {
        id: "pin-glow",
        type: "circle",
        source: PIN_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "case",
            ["==", ["get", "pin_type"], "giant"],
            26,
            ["==", ["get", "boost"], true],
            20,
            14,
          ],
          "circle-color": [
            "case",
            ["==", ["get", "pin_type"], "giant"],
            "#a855f7",
            ["==", ["get", "boost"], true],
            "#ef4444",
            ["==", ["get", "verified"], true],
            "#22c55e",
            ["==", ["get", "glow"], true],
            "#06b6d4",
            "#64748b",
          ],
          "circle-opacity": [
            "case",
            ["==", ["get", "pin_type"], "giant"],
            0.45,
            ["==", ["get", "boost"], true],
            0.35,
            0.2,
          ],
          "circle-blur": 0.8,
        },
      },
      PIN_LAYER_ID,
    );
  }

  if (
    map.value.getLayer(PIN_LAYER_ID) &&
    !map.value.getLayer("pin-smart-pulse")
  ) {
    map.value.addLayer(
      {
        id: "pin-smart-pulse",
        type: "circle",
        source: PIN_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#ffffff",
            ["boolean", ["feature-state", "live"], false],
            "#22d3ee",
            ["boolean", ["feature-state", "boost"], false],
            "#fb7185",
            "#93c5fd",
          ],
          "circle-radius": [
            "+",
            [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              16,
              ["boolean", ["feature-state", "boost"], false],
              12,
              ["boolean", ["feature-state", "live"], false],
              10,
              0,
            ],
            ["*", ["coalesce", ["feature-state", "pulse"], 0], 10],
          ],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.45,
            ["boolean", ["feature-state", "boost"], false],
            0.3,
            ["boolean", ["feature-state", "live"], false],
            0.26,
            0,
          ],
          "circle-blur": 0.85,
        },
      },
      PIN_LAYER_ID,
    );
  }

  // 6. Giant Pin Glow (Backdrop for Giant Pins)
  if (!map.value.getLayer("giant-glow")) {
    map.value.addLayer(
      {
        id: "giant-glow",
        type: "circle",
        source: PIN_SOURCE_ID,
        filter: ["==", ["get", "pin_type"], "giant"],
        paint: {
          "circle-radius": 25,
          "circle-color": "#ec4899", // Pink Glow
          "circle-opacity": 0.4,
          "circle-blur": 0.6,
        },
      },
      "unclustered-pins", // Place below pins
    );
  }

  ensureTapRippleLayer();

  // 4. Fireflies + atmosphere loop (performance-first)
  if (allowAmbientFx.value) {
    ensureFirefliesLayer();
  } else {
    removeFirefliesLayer();
  }

  // ✅ 4.1 3D Buildings (Enhanced Visuals)
  if (allow3dBuildings.value) {
    if (!map.value.getLayer("3d-buildings")) {
      map.value.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#2a2a2a",
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0,
            13.05,
            ["get", "height"],
          ],
          "fill-extrusion-base": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0,
            13.05,
            ["get", "min_height"],
          ],
          "fill-extrusion-opacity": 0.8,
        },
      });
    }
  } else {
    remove3dBuildingLayers();
  }

  // ✅ Force 3D Perspective
  map.value.setPitch(60);
  map.value.setBearing(-17.6);
  resetTrafficDashState();
  applyFogSettings();

  if (shouldRunAtmosphere.value) {
    startAtmosphereLoop();
  } else {
    stopAtmosphereLoop();
  }

  // Optional heatmap (respect performance prefs)
  addHeatmapLayer();

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
  if (hasActiveRoute.value) startRouteTrailAnimation();

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
  const userSource = map.value.getSource("user-location");
  if (userSource && props.userLocation) {
    userSource.setData({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [props.userLocation[1], props.userLocation[0]],
      },
    });
  }
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

const mapOverlayStyle = computed(() => {
  if (props.isDarkMode) {
    return {
      background:
        "linear-gradient(to bottom, rgba(30,58,138,0.32), rgba(15,23,42,0.42))",
    };
  }
  return {
    background:
      "linear-gradient(to bottom, rgba(255,255,255,0.08), transparent)",
  };
});

// ✅ Fireflies Effect - Reduced for performance
const fireflies = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  left: `${10 + ((i * 12) % 80)}%`,
  bottom: `${5 + ((i * 9) % 30)}%`,
  delay: `${(i * 2) % 10}s`,
  duration: `${12 + (i % 6)}s`,
}));

// ✅ Distance Line Calculation
const distanceLineCoords = computed(() => null); // Managed by updateRoadDirections now

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
      console.log("🎮 GPU:", vendor, renderer);

      // Some software renderers may cause issues
      if (renderer?.toLowerCase().includes("swiftshader")) {
        console.warn("⚠️ Software WebGL renderer detected, map may be slow");
      }
    }

    console.log("✅ WebGL is supported");
    return true;
  } catch (e) {
    console.error("❌ WebGL check failed:", e);
    return false;
  }
};

const webGLSupported = ref(true);
const maplessMode = ref(false); // User chose to continue without map

// Navigation controls removed (user prefers cleaner map)

// Enable smooth scrolling and pinch-zoom

// ✅ Map Initialization (Composables)
onMounted(() => {
  if (import.meta.env.DEV) {
    console.log("🗺️ Initializing Mapbox Core...");
  }
  initMapOnce();
});

// ✅ Watch for Map Ready
watch(isMapReady, (ready) => {
  if (ready && map.value) {
    console.log("✅ Map Core Ready - Setting up Layers");
    setupMapLayers();
    setupMapInteractions();
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
    maxWidth: "280px",
    offset: [0, -10], // Standard pin offset
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
        emit("select-shop", null);
      };
    }

    // Navigate button
    const navBtn = popupEl.querySelector(".popup-nav-btn");
    if (navBtn) {
      navBtn.onclick = (e) => {
        e.stopPropagation();
        openExternal(
          `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`,
        );
      };
    }

    // Ride button
    const rideBtn = popupEl.querySelector(".popup-ride-btn");
    if (rideBtn) {
      rideBtn.onclick = (e) => {
        e.stopPropagation();
        emit("open-ride-modal", item);
      };
      rideBtn.ontouchend = (e) => {
        e.stopPropagation();
        emit("open-ride-modal", item);
      };
    }
  }, 100);
};

// ✅ Create Custom Marker Element - Logic extracted to mapRenderer.js

// ✅ Update Markers (Refactored to Composable)
// ✅ Update Markers (Refactored to Composable)
const updateMarkers = () => {
  if (!props.shops) return;
  // Interaction callbacks removed - handled by Mapbox Layers
  updateMarkersCore(props.shops, props.highlightedShopId, {
    pinsVisible: pinsVisible.value,
    onSelect: handleMarkerClick,
    onOpenBuilding: (shop) => emit("open-building", shop),
  });
};

// ✅ Update Giant Pin Markers for Events (Refactored)
const updateEventMarkers = () => {
  updateEventMarkersCore(activeEvents.value, {
    pinsVisible: pinsVisible.value,
    onOpenBuilding: (event) => {
      emit("open-building", event);
    },
  });
};

// ✅ Map Interactions moved to useMapInteractions
const {
  handlePointClick,
  handleClusterClick,
  handleMarkerClick: handleMarkerClickCore,
  setupMapInteractions: setupInteractionsCore,
  focusLocation: focusLocationCore,
  centerOnUser: centerOnUserCore,
  flyTo: flyToCore,
} = useMapInteractions(map, isMapReady, emit, props, mapContainer, {
  spawnTapRipple,
});

const setupMapInteractions = () => {
  setupInteractionsCore();
};

const handleMarkerClick = (item) => {
  handleMarkerClickCore(item);
  showPopup(item); // Keep local popup logic
};

// We need to set up listeners for interaction ripples if we want to keep them
// For now, the composable emits 'interaction-ripple', but we need to listen?
// Wait, the composable calls emit(), which goes to the PARENT of MapboxContainer.
// But spawnTapRipple is defined LOCALLY in this component (imported from utils/particleEffects? No, let's check).
// spawnTapRipple is NOT imported. It must be defined in this file.
// I need to check where spawnTapRipple is defined.

// ✅ Setup Map Interactions & Watch for Ready (Performance Fix)
watch(isMapReady, (ready) => {
  if (!ready || !map.value) return;

  // Initial Fly-in
  map.value.easeTo({
    pitch: 60,
    bearing: -17.6,
    duration: 2000,
    zoom: 15.5,
  });

  setupMapInteractions();
  refreshSmartPulseTargets();
});

// handleMarkerClick defined above with composable

// ✅ Update Distance Line
const updateDistanceLine = () => {
  if (!map.value || !isMapReady.value) return;

  const source = map.value.getSource(DISTANCE_LINE_SOURCE_ID);
  if (!source) return;

  if (distanceLineCoords.value) {
    source.setData({
      type: "FeatureCollection",
      features: [distanceLineCoords.value],
    });
  } else {
    source.setData({ type: "FeatureCollection", features: [] });
  }
};

// ✅ Update User Location
const updateUserLocation = () => {
  if (!map.value || !isMapReady.value) return;

  const source = map.value.getSource("user-location");
  if (!source) return;

  if (props.userLocation && props.userLocation.length >= 2) {
    const [lat, lng] = props.userLocation;
    source.setData({
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
    source.setData({ type: "FeatureCollection", features: [] });
  }
};

const handleMapMoveForEnhancements = () => {
  if (!map.value) return;
  currentMapZoom.value = map.value.getZoom();
  updateBuildingInfoPopupPosition();
  updateSoundVolumeFromZoom();
};

const handleMapMoveEndForWeather = () => {
  if (!allowWeatherFx.value) return;
  refreshWeather();
  applyFogSettings();
};

const handleMapStyleLoad = () => {
  resetTrafficDashState();
  applyFogSettings();
  syncBuildingInfoPopupFromSelection();
  updateSoundVolumeFromZoom(true);
};

// ✅ Smart Focus Offset (visual center between top UI & bottom UI)
const getSmartYOffset = (_popupPx = 0) => {
  const top = Number(props.uiTopOffset || 64);
  const bottom =
    Number(props.uiBottomOffset || 0) + Number(props.legendHeight || 0);
  const viewportH = window.innerHeight;
  const isMobile = window.innerWidth < 768;

  if (isMobile) return 0;

  const visualCenter = (viewportH - bottom + top) / 2;
  const mapCenter = viewportH / 2;
  const y = Math.round((mapCenter - visualCenter) * 2);
  return Math.max(0, Math.min(viewportH * 0.8, y));
};

// ✅ Focus Location (Fly To) - Smooth & Precise Centering
// Focus Location moved to composable
const focusLocation = (coords, targetZoom, pitch, extraBottomOffset) => {
  focusLocationCore(coords, targetZoom, pitch, extraBottomOffset);
  addHeatmapLayer(); // Keep side effect
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
    updateDistanceLine();
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
  ],
  () => {
    if (!map.value || !isMapReady.value) return;
    setupMapLayers();
    if (!allowHeatmap.value) {
      removeHeatmapLayer();
    } else {
      addHeatmapLayer();
    }
    if (!allowNeonPulse.value || isPerfRestricted.value) {
      stopRouteTrailAnimation();
    } else if (hasActiveRoute.value) {
      startRouteTrailAnimation();
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

watch([weatherCondition, isWeatherNight], () => {
  applyFogSettings();
});

watch(
  () => prefs.isSoundEnabled,
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
  const rows = shops.map((shop) => {
    const id = String(shop?.id ?? "").trim();
    const lat = Number(shop?.lat ?? shop?.latitude);
    const lng = Number(shop?.lng ?? shop?.longitude);
    const status = String(shop?.status ?? "");
    const latSig = Number.isFinite(lat) ? lat.toFixed(4) : "na";
    const lngSig = Number.isFinite(lng) ? lng.toFixed(4) : "na";
    return `${id}:${latSig}:${lngSig}:${status}`;
  });
  rows.sort();
  return rows.join("|");
};

watch(
  () => props.shops,
  (newShops, oldShops) => {
    if (!Array.isArray(newShops)) return;
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
        scheduleMapRefresh({ force: true });
        return;
      }
    }
    requestUpdateMarkers();
    scheduleMapRefresh({ force: true });
  },
  { deep: false },
);

watch(
  () => props.highlightedShopId,
  async (newId) => {
    await nextTick();
    updateMarkers();
    refreshSmartPulseTargets();
    scheduleMapRefresh({ force: true });
    syncSoundZoneFromSelection();
    syncBuildingInfoPopupFromSelection();
    if (!newId) {
      closeActivePopup();
      hideBuildingInfoPopup();
      return;
    }
    const shop = props.shops?.find((s) => String(s.id) === String(newId));
    if (shop) {
      showPopup(shop);
      buildingPopupShop.value = shop;
      syncBuildingPopupContent(shop);
      updateBuildingInfoPopupPosition(true);
      if (!map.value) return;
      // ✅ Smooth Pan to Shop
      map.value.flyTo({
        center: [Number(shop.lng), Number(shop.lat)],
        zoom: 16,
        pitch: 45,
        duration: 1000, // Slow & Smooth
        essential: true,
        offset: [0, 100], // Shift down slightly so pin isn't covered by card
      });
    }
  },
);

watch(
  [() => props.userLocation, () => props.selectedShopCoords],
  () => {
    updateMapSources();
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

// ✅ Lifecycle
onMounted(async () => {
  // ⚡ SKIP HEAVY MAP INIT IN E2E
  if (IS_E2E && !IS_STRICT_MAP_E2E) {
    console.log("E2E Mode: Skipping Mapbox Initialization");
    isMapReady.value = true;
    return;
  }

  // ✅ FIX: initMap is called in the onMounted at line ~950.
  // This block only ticks time-driven computed state.

  nowTickInterval = setInterval(() => {
    nowTick.value = Date.now();
  }, 60000);
});

onUnmounted(() => {
  mapReadyFallbackArmed.value = false;
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = null;
  }
  if (rafToken) {
    cancelAnimationFrame(rafToken);
    rafToken = null;
  }
  lastViewportKey = "";
  lastMapRefreshAt = 0;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
  if (motionMediaQuery) {
    motionMediaQuery.removeEventListener?.("change", handleMotionChange);
    motionMediaQuery = null;
  }

  if (nowTickInterval) {
    clearInterval(nowTickInterval);
    nowTickInterval = null;
  }

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

  socketService.removeListener(handleSocketMessage);

  markersMap.value.forEach((entry) => {
    // markersMap stores { marker, shop } objects
    const marker = entry?.marker ?? entry;
    if (marker?.remove) marker.remove();
  });
  eventMarkersMap.value.forEach((m) => {
    // eventMarkersMap stores raw Mapbox markers
    if (m?.remove) m.remove();
  });

  if (map.value) {
    map.value.off("moveend", scheduleMapRefresh);
    map.value.off("zoomend", scheduleMapRefresh);
    map.value.off("move", handleMapMoveForEnhancements);
    map.value.off("zoom", handleMapMoveForEnhancements);
    map.value.off("moveend", handleMapMoveEndForWeather);
    map.value.off("style.load", handleMapStyleLoad);
    map.value.off("click", PIN_LAYER_ID, handlePointClick);
    map.value.off("mouseenter", PIN_LAYER_ID, setPointer);
    map.value.off("mouseleave", PIN_LAYER_ID, resetPointer);
    map.value.off("click", CLUSTER_LAYER_ID, handleClusterClick);
    map.value.off("mouseenter", CLUSTER_LAYER_ID, setPointer);
    map.value.off("mouseleave", CLUSTER_LAYER_ID, resetPointer);
    map.value.remove();
    map.value = null;
  }
});

defineExpose({
  map,
  focusLocation,
  centerOnUser,
  webGLSupported,
  maplessMode,
  resize: () => map.value?.resize(),
  // ✅ Robust flyTo: handles (options) object OR (coords, zoom) legacy
  flyTo: flyToCore,
});
</script>

<template>
  <div
    data-testid="map-shell"
    :data-map-ready="isMapReady ? 'true' : 'false'"
    :data-map-init-requested="mapInitRequested ? 'true' : 'false'"
    :data-map-token-invalid="isTokenInvalid ? 'true' : 'false'"
    :class="[
      'relative w-full h-full z-0 transition-colors duration-500',
      isDarkMode ? 'bg-[#09090b]' : 'bg-gray-200',
    ]"
  >
    <div
      ref="mapContainer"
      data-testid="map-canvas"
      class="w-full h-full absolute inset-0 opacity-100"
    ></div>

    <div
      v-if="allowViewportGlow"
      class="absolute inset-0 z-[2] pointer-events-none viewport-focus-glow"
      :style="{ opacity: viewportGlowOpacity }"
    ></div>

    <!-- Zeppelin removed for cleaner UI -->

    <!-- ✅ WebGL Not Supported Fallback - HIGH Z-INDEX to cover all UI -->
    <div
      v-if="!webGLSupported && !maplessMode"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-black"
    >
      <div
        class="max-w-md mx-4 p-8 rounded-3xl bg-zinc-800/80 border border-white/10 text-center backdrop-blur-xl shadow-2xl"
      >
        <div
          class="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500/30 to-red-500/30 flex items-center justify-center text-5xl animate-pulse"
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
            @click="window.location.reload()"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/25 active:scale-95"
          >
            🔄 {{ $t("map.webgl_error.reload") }}
          </button>
          <button
            @click="maplessMode = true"
            class="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-orange-500/25 active:scale-95"
          >
            📱 {{ $t("map.webgl_error.continue_mapless") }}
          </button>
          <a
            href="https://get.webgl.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="block w-full py-3.5 bg-white/10 text-white/80 font-bold rounded-xl hover:bg-white/20 transition-all"
          >
            🌐 {{ $t("map.webgl_error.check_webgl") }}
          </a>
        </div>
      </div>
    </div>

    <!-- ✅ Mapless Mode Background -->
    <div
      v-if="!webGLSupported && maplessMode"
      class="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black"
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
        <p class="text-sm">{{ $t("map.mapless.unavailable") }}</p>
      </div>
    </div>

    <!-- ✅ Entertainment Atmosphere Effects (simplified) -->
    <div
      class="absolute inset-0 z-[1] pointer-events-none transition-colors duration-500"
      :style="mapOverlayStyle"
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
        transform: `translate3d(${buildingPopupX}px, ${buildingPopupY}px, 0)`,
        opacity: buildingPopupVisible ? 1 : 0,
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
          @click="window.location.reload()"
          class="w-full py-3 bg-white text-black font-bold rounded-xl active:scale-95 transition-all"
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
  z-index: 10000 !important;
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
</style>
