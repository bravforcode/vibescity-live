// --- C:\vibecity.live\src\components\map\MapboxContainer.vue ---

<script setup>
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
import { useMapCore } from "../../composables/map/useMapCore"; // ✅ New Composable
import { useMapLayers } from "../../composables/map/useMapLayers";
import { useMapMarkers } from "../../composables/map/useMapMarkers";
import { useHaptics } from "../../composables/useHaptics";
import { useTimeTheme } from "../../composables/useTimeTheme";
import { useShopStore } from "../../store/shopStore";
import { useUserPreferencesStore } from "../../store/userPreferencesStore";
import { openExternal } from "../../utils/browserUtils";
import { createPopupHTML } from "../../utils/mapRenderer";
import { calculateDistance } from "../../utils/shopUtils";
import LiveActivityChips from "./LiveActivityChips.vue";

if (typeof mapboxgl.setTelemetryEnabled === "function") {
	mapboxgl.setTelemetryEnabled(false);
}

const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";
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

// ✅ Phase 2: Dynamic Vibe Shifting
const { isNightMode, mapStyle, currentHour } = useTimeTheme();

// ✅ Vibe Effects
import { useVibeEffects } from "../../composables/useVibeEffects";
import { socketService } from "../../services/socketService";

const { activeVibeEffects, triggerVibeEffect } = useVibeEffects();
const { impactFeedback } = useHaptics();
const handleMotionChange = (e) => {
	prefersReducedMotion.value = e.matches;
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

// ✅ Heatmap Logic
const heatmapGeoJson = {
	type: "FeatureCollection",
	features: [],
};

const updateHeatmapData = (densityData) => {
	if (!allowHeatmap.value) return;
	// densityData: { shopId: count }
	if (!props.shops) return;

	const features = [];
	Object.entries(densityData).forEach(([shopId, count]) => {
		const shop = props.shops.find((s) => s.id == shopId);
		if (shop?.lat && shop?.lng) {
			features.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [shop.lng, shop.lat],
				},
				properties: {
					density: count,
				},
			});
		}
	});

	heatmapGeoJson.features = features;

	// Update Map Source
	if (map.value?.getSource("heatmap-source")) {
		map.value.getSource("heatmap-source").setData(heatmapGeoJson);
	}
};

const removeHeatmapLayer = () => {
	if (!map.value) return;
	if (map.value.getLayer("heatmap-layer")) {
		map.value.removeLayer("heatmap-layer");
	}
	if (map.value.getSource("heatmap-source")) {
		map.value.removeSource("heatmap-source");
	}
};

// Add Heatmap Layer
const addHeatmapLayer = () => {
	if (!map.value) return;
	if (!allowHeatmap.value) {
		removeHeatmapLayer();
		return;
	}

	// Source
	if (!map.value.getSource("heatmap-source")) {
		map.value.addSource("heatmap-source", {
			type: "geojson",
			data: heatmapGeoJson,
		});
	}

	// Layer
	if (!map.value.getLayer("heatmap-layer")) {
		map.value.addLayer(
			{
				id: "heatmap-layer",
				type: "heatmap",
				source: "heatmap-source",
				maxzoom: 15,
				paint: {
					// Increase weight based on density
					"heatmap-weight": [
						"interpolate",
						["linear"],
						["get", "density"],
						0,
						0,
						10,
						1,
					],
					// Increase intensity as zoom level increases
					"heatmap-intensity": [
						"interpolate",
						["linear"],
						["zoom"],
						0,
						1,
						15,
						3,
					],
					// Color ramp
					"heatmap-color": [
						"interpolate",
						["linear"],
						["heatmap-density"],
						0,
						"rgba(33,102,172,0)",
						0.2,
						"rgb(103,169,207)",
						0.4,
						"rgb(209,229,240)",
						0.6,
						"rgb(253,219,199)",
						0.8,
						"rgb(239,138,98)",
						1,
						"rgb(178,24,43)",
					],
					// Radius
					"heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 15, 20],
					"heatmap-opacity": 0.7,
				},
			},
			"waterway-label",
		); // Place below labels
	}
};

const props = defineProps({
	shops: Array,
	userLocation: Array,
	currentTime: Date,
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
const effectiveMotionBudget = computed(() => {
	if (isPerfRestricted.value) return "micro";
	return prefs.motionBudget || "micro";
});
const shouldRunAtmosphere = computed(
	() => allowAmbientFx.value || allowNeonPulse.value,
);

// Watch for Theme Changes and update Mapbox Style dynamically
watch(mapStyle, (newStyle) => {
	if (map.value && isMapReady.value) {
		// Preserve layers before switching style (optional advanced logic, for MVP we reload style)
		// Mapbox GL JS setStyle removes custom layers. We need to re-add them.
		map.value.setStyle(newStyle);
		map.value.once("style.load", () => {
			setupMapLayers();
			setupMapInteractions();
			updateMapSources();
			updateEventMarkers(); // Restore markers
		});
	}
});

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

	initMap(
		center.value,
		zoom.value,
		styleOverride ?? (props.isDarkMode ? DARK_STYLE : LIGHT_STYLE),
	);
};

// ✅ Force 3D Camera View & Setup Layers on Load
onMounted(() => {
	initMapOnce();
});

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
			isMapReady.value = true;
		}
	}, 12_000);
});

onMounted(() => {
	if (typeof window === "undefined" || !window.matchMedia) return;
	motionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
	prefersReducedMotion.value = motionMediaQuery.matches;
	motionMediaQuery.addEventListener?.("change", handleMotionChange);
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
const center = ref([98.968, 18.7985]);
const pitch = ref(60);
const bearing = ref(-17.6);
const mapLoaded = ref(false);
const activePopup = shallowRef(null);
const mapInitRequested = ref(false);
let hourInterval = null;
let mapHapticAt = 0;
const MAP_HAPTIC_COOLDOWN_MS = 220;

// Realtime Hotspot + Chips
const hotspotSnapshot = ref([]);
const liveVenueRefs = ref(new Set());

// Tap Ripple (event-driven, no global heavy loop)
const tapRipplesData = ref({ type: "FeatureCollection", features: [] });
let tapRippleSeed = 0;

// Smart pulse state (feature-state based, throttled <= 8 FPS)
let smartPulseTimer = null;
let pulsePhase = 0;
const smartPulseTargets = ref(new Set());
const currentPulseAppliedIds = ref(new Set());

// Route neon trail state
let routeTrailTimer = null;
let routeTrailPhase = 0;
const hasActiveRoute = ref(false);

const liveActivityChips = computed(() => {
	const rows = Array.isArray(hotspotSnapshot.value)
		? hotspotSnapshot.value
		: [];
	if (!rows.length) return [];

	const byScore = [...rows].sort(
		(a, b) => Number(b.score || 0) - Number(a.score || 0),
	);
	const hottest = byScore[0];
	const fastest = [...rows].sort(
		(a, b) => Number(b.event_count || 0) - Number(a.event_count || 0),
	)[0];
	const crowded = [...rows].sort(
		(a, b) => Number(b.unique_visitors || 0) - Number(a.unique_visitors || 0),
	)[0];

	const chips = [];
	if (hottest) {
		chips.push({
			id: "hot",
			label: "กำลังฮิต",
			value: hottest.event_count || 0,
			tone: "hot",
		});
	}
	if (fastest) {
		chips.push({
			id: "surge",
			label: "คนดูเพิ่ม",
			value: fastest.unique_visitors || 0,
			tone: "surge",
		});
	}
	if (crowded) {
		chips.push({
			id: "zone",
			label: "โซนเดือด",
			value: crowded.score || 0,
			tone: "zone",
		});
	}
	return chips.slice(0, 3);
});

const viewportGlowOpacity = computed(() => {
	if (!allowViewportGlow.value) return 0;
	if (prefs.mapVisualPreset === "cinematic") return 0.34;
	if (prefs.mapVisualPreset === "colorful") return 0.24;
	return 0.16;
});

const toFeatureStateId = (id) => {
	if (id === null || id === undefined) return null;
	const str = String(id);
	if (/^\d+$/.test(str)) return Number(str);
	return str;
};

const triggerMapHaptic = (level = "light") => {
	if (!prefs.isMapHapticsEnabled || !prefs.isHapticsEnabled) return;
	const now = Date.now();
	if (now - mapHapticAt < MAP_HAPTIC_COOLDOWN_MS) return;
	impactFeedback?.(level);
	mapHapticAt = now;
};

const syncLiveFlagsToPinSource = () => {
	const source = map.value?.getSource(PIN_SOURCE_ID);
	const data = source?._data;
	if (!data?.features?.length) return;
	data.features = data.features.map((feature) => {
		const id = String(feature?.properties?.id ?? feature?.id ?? "");
		return {
			...feature,
			properties: {
				...(feature.properties || {}),
				is_live: liveVenueRefs.value.has(id),
			},
		};
	});
	source.setData(data);
};

const consumeHotspotUpdate = (rows) => {
	if (!Array.isArray(rows)) return;
	hotspotSnapshot.value = rows;
	const nextLive = new Set();
	rows.forEach((row) => {
		const venueRef = row?.venue_ref ?? row?.shop_id ?? row?.venue_id;
		if (!venueRef) return;
		if (Number(row?.event_count || 0) > 0 || Number(row?.score || 0) > 0) {
			nextLive.add(String(venueRef));
		}
	});
	liveVenueRefs.value = nextLive;
	syncLiveFlagsToPinSource();
	refreshSmartPulseTargets();
};

const extractEffectCoords = (effect) => {
	const payload = effect?.payload || {};
	if (Array.isArray(payload.coords) && payload.coords.length === 2) {
		return [Number(payload.coords[0]), Number(payload.coords[1])];
	}
	if (Number.isFinite(payload.lng) && Number.isFinite(payload.lat)) {
		return [Number(payload.lng), Number(payload.lat)];
	}
	const venueRef = String(effect?.venue_ref ?? payload?.venue_ref ?? "");
	if (!venueRef) return null;
	const fromShop = props.shops?.find((s) => String(s.id) === venueRef);
	if (fromShop?.lng && fromShop?.lat) {
		return [Number(fromShop.lng), Number(fromShop.lat)];
	}
	return null;
};

const consumeMapEffects = (events) => {
	if (!Array.isArray(events) || !events.length) return;
	events.forEach((effect) => {
		const coords = extractEffectCoords(effect);
		if (!coords) return;
		const effectType = String(effect?.effect_type || "");
		if (effectType === "tap_ripple" || effectType === "boost_burst") {
			spawnTapRipple(
				coords,
				effectType === "boost_burst" ? "#f97316" : "#60a5fa",
			);
		} else {
			spawnTapRipple(coords);
		}
	});
};

const ensureTapRippleLayer = () => {
	if (!map.value) return;
	if (!map.value.getSource("tap-ripples")) {
		map.value.addSource("tap-ripples", {
			type: "geojson",
			data: tapRipplesData.value,
		});
	}
	if (!map.value.getLayer("tap-ripples-layer")) {
		map.value.addLayer(
			{
				id: "tap-ripples-layer",
				type: "circle",
				source: "tap-ripples",
				paint: {
					"circle-radius": ["coalesce", ["get", "radius"], 8],
					"circle-color": ["coalesce", ["get", "color"], "#60a5fa"],
					"circle-opacity": ["coalesce", ["get", "opacity"], 0],
					"circle-blur": 0.85,
				},
			},
			PIN_LAYER_ID,
		);
	}
};

const setTapRipplesSource = () => {
	const source = map.value?.getSource("tap-ripples");
	if (source) {
		source.setData(tapRipplesData.value);
	}
};

const spawnTapRipple = (coords, color = "#60a5fa") => {
	if (!map.value || !isMapReady.value || !Array.isArray(coords)) return;
	ensureTapRippleLayer();
	const id = `ripple-${Date.now()}-${tapRippleSeed++}`;
	const durationMs = 600 + Math.round(Math.random() * 300);

	tapRipplesData.value.features.push({
		type: "Feature",
		geometry: {
			type: "Point",
			coordinates: coords,
		},
		properties: {
			id,
			radius: 4,
			opacity: 0.45,
			color,
		},
	});
	setTapRipplesSource();

	requestAnimationFrame(() => {
		tapRipplesData.value.features = tapRipplesData.value.features.map((f) =>
			f.properties?.id === id
				? {
						...f,
						properties: {
							...f.properties,
							radius: 26,
							opacity: 0,
						},
					}
				: f,
		);
		setTapRipplesSource();
	});

	setTimeout(() => {
		tapRipplesData.value.features = tapRipplesData.value.features.filter(
			(f) => f.properties?.id !== id,
		);
		setTapRipplesSource();
	}, durationMs);
};

const getSmartPulseFps = () => {
	if (effectiveMotionBudget.value === "full") return 8;
	if (effectiveMotionBudget.value === "balanced") return 6;
	return 4;
};

const stopSmartPulseLoop = (reset = true) => {
	if (smartPulseTimer) {
		clearInterval(smartPulseTimer);
		smartPulseTimer = null;
	}
	if (!reset || !map.value) return;
	currentPulseAppliedIds.value.forEach((id) => {
		const featureId = toFeatureStateId(id);
		if (featureId === null) return;
		map.value.setFeatureState(
			{ source: PIN_SOURCE_ID, id: featureId },
			{ pulse: 0, selected: false, boost: false, live: false },
		);
	});
	currentPulseAppliedIds.value = new Set();
};

const refreshSmartPulseTargets = () => {
	if (!map.value || !isMapReady.value || isPerfRestricted.value) {
		smartPulseTargets.value = new Set();
		stopSmartPulseLoop();
		return;
	}

	const source = map.value.getSource(PIN_SOURCE_ID);
	const data = source?._data;
	if (!data?.features?.length) {
		smartPulseTargets.value = new Set();
		stopSmartPulseLoop();
		return;
	}

	const selectedId = props.highlightedShopId
		? String(props.highlightedShopId)
		: null;
	const nextTargets = new Set();
	const states = new Map();

	data.features.forEach((feature) => {
		const propsData = feature?.properties || {};
		const id = String(propsData.id ?? feature.id ?? "");
		if (!id) return;

		const isSelected = selectedId ? id === selectedId : false;
		const isBoost = Boolean(propsData.boost);
		const isLive = liveVenueRefs.value.has(id) || Boolean(propsData.is_live);

		const motion = effectiveMotionBudget.value;
		const shouldPulse =
			isSelected ||
			(motion !== "micro" && (isBoost || isLive)) ||
			(motion === "micro" && isLive);

		if (!shouldPulse) return;

		nextTargets.add(id);
		states.set(id, { selected: isSelected, boost: isBoost, live: isLive });
	});

	const mergedIds = new Set([
		...Array.from(currentPulseAppliedIds.value),
		...Array.from(nextTargets),
	]);
	mergedIds.forEach((id) => {
		const featureId = toFeatureStateId(id);
		if (featureId === null) return;
		const state = states.get(id) || {
			selected: false,
			boost: false,
			live: false,
		};
		map.value.setFeatureState({ source: PIN_SOURCE_ID, id: featureId }, state);
	});

	smartPulseTargets.value = nextTargets;
	currentPulseAppliedIds.value = nextTargets;

	if (!nextTargets.size) {
		stopSmartPulseLoop();
		return;
	}

	if (!smartPulseTimer) {
		const interval = Math.max(120, Math.round(1000 / getSmartPulseFps()));
		smartPulseTimer = setInterval(() => {
			if (!map.value || document.hidden || isPerfRestricted.value) return;
			pulsePhase += 0.45;
			const pulse = (Math.sin(pulsePhase) + 1) / 2;
			smartPulseTargets.value.forEach((id) => {
				const featureId = toFeatureStateId(id);
				if (featureId === null) return;
				map.value.setFeatureState(
					{ source: PIN_SOURCE_ID, id: featureId },
					{ pulse },
				);
			});
		}, interval);
	}
};

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
let rafToken = null;

// Schedule fetching pins based on map movement
const scheduleMapRefresh = () => {
	if (rafToken) return;
	rafToken = requestAnimationFrame(async () => {
		rafToken = null;
		await refreshPins();
	});
};

const refreshPins = async () => {
	if (!map.value || !isMapReady.value) return;

	const b = map.value.getBounds();
	const currentZoom = map.value.getZoom();

	const setPinsSourceFromShops = (shops) => {
		if (!map.value?.getSource(PIN_SOURCE_ID) || !shops?.length) return;
		const features = shops
			.map((shop) => {
				const lat = Number(shop.lat ?? shop.latitude);
				const lng = Number(shop.lng ?? shop.longitude);
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
				return {
					type: "Feature",
					geometry: { type: "Point", coordinates: [lng, lat] },
					properties: {
						id: shop.id,
						name: shop.name,
						pin_type: shop.is_giant_active ? "giant" : "normal",
						verified: shop.is_verified || shop.verifiedActive,
						glow: shop.is_glowing || shop.glowActive,
						boost: shop.is_boost_active || shop.boostActive,
						giant: shop.is_giant_active || shop.giantActive,
						visibility_score: shop.visibility_score ?? shop.visibilityScore,
						is_live: liveVenueRefs.value.has(String(shop.id)),
						vibe_score: shop.visibility_score ?? shop.visibilityScore ?? 0,
					},
				};
			})
			.filter(Boolean);

		map.value.getSource(PIN_SOURCE_ID).setData({
			type: "FeatureCollection",
			features,
		});
		refreshSmartPulseTargets();
	};

	try {
		const pins = await getMapPins({
			p_min_lat: b.getSouth(),
			p_min_lng: b.getWest(),
			p_max_lat: b.getNorth(),
			p_max_lng: b.getEast(),
			p_zoom: currentZoom,
		});

		const geojson = {
			type: "FeatureCollection",
			features: pins.map((p) => ({
				type: "Feature",
				geometry: { type: "Point", coordinates: [p.lng, p.lat] },
				properties: {
					id: p.id,
					name: p.name,
					pin_type: p.pinType,
					verified: p.verifiedActive,
					glow: p.glowActive,
					boost: p.boostActive,
					giant: p.giantActive,
					visibility_score: p.visibilityScore,
					is_live: liveVenueRefs.value.has(String(p.id)),
					vibe_score: p.visibilityScore ?? 0,
					image: p.coverImage,
				},
			})),
		};

		// Update Source (guard against unmounted component)
		if (!map.value) return;
		const source = map.value.getSource(PIN_SOURCE_ID);
		if (source) {
			source.setData(geojson);
			refreshSmartPulseTargets();
		}
	} catch (err) {
		console.error("Failed to refresh map pins:", err);
		// Fallback to local data if available
		setPinsSourceFromShops(props.shops);
	}
};

// Bind events
watch(isMapReady, (ready) => {
	if (ready && map.value) {
		map.value.on("moveend", scheduleMapRefresh);
		map.value.on("zoomend", scheduleMapRefresh);
		scheduleMapRefresh(); // Initial load
		refreshSmartPulseTargets();
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

// --- 🌈 Phase 4: Atmospheric Animations ---
let atmosphericAnimationRequest = null;
let lastFirefliesUpdate = 0;
const firefliesData = ref({ type: "FeatureCollection", features: [] });

// Initialize fireflies at random locations around Chiang Mai center
const initFireflies = () => {
	const centerLat = 18.7883;
	const centerLng = 98.9853;
	const count = 40;
	const features = [];

	for (let i = 0; i < count; i++) {
		features.push({
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [
					centerLng + (Math.random() - 0.5) * 0.05,
					centerLat + (Math.random() - 0.5) * 0.05,
				],
			},
			properties: {
				id: i,
				speed: 0.0001 + Math.random() * 0.0002,
				phase: Math.random() * Math.PI * 2,
				baseCoords: [
					centerLng + (Math.random() - 0.5) * 0.05,
					centerLat + (Math.random() - 0.5) * 0.05,
				],
			},
		});
	}
	firefliesData.value.features = features;
};

const flyTo = (lngLat, zoom = 17) => {
	if (!map.value) {
		console.warn("flyTo called but map is not initialized");
		return;
	}
	try {
		map.value.flyTo({ center: lngLat, zoom, essential: true });
	} catch (err) {
		console.error("Mapbox internal flyTo error:", err);
	}
};

const applyStaticNeonRoads = () => {
	if (!map.value) return;
	if (map.value.getLayer("neon-roads-outer")) {
		map.value.setPaintProperty("neon-roads-outer", "line-opacity", 0.15);
	}
	if (map.value.getLayer("neon-roads-inner")) {
		map.value.setPaintProperty("neon-roads-inner", "line-opacity", 0.6);
		map.value.setPaintProperty("neon-roads-inner", "line-width", 1.2);
	}
};

const ensureFirefliesLayer = () => {
	if (!map.value || !allowAmbientFx.value) return;
	if (!map.value.getSource("fireflies")) {
		initFireflies();
		map.value.addSource("fireflies", {
			type: "geojson",
			data: firefliesData.value,
		});
	}
	if (!map.value.getLayer("fireflies-layer")) {
		map.value.addLayer({
			id: "fireflies-layer",
			type: "circle",
			source: "fireflies",
			paint: {
				"circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 3],
				"circle-color": "#fbbf24",
				"circle-opacity": 0.8,
				"circle-blur": 1,
			},
		});
	}
};

const removeFirefliesLayer = () => {
	if (!map.value) return;
	if (map.value.getLayer("fireflies-layer")) {
		map.value.removeLayer("fireflies-layer");
	}
	if (map.value.getSource("fireflies")) {
		map.value.removeSource("fireflies");
	}
};

const stopAtmosphereLoop = () => {
	if (atmosphericAnimationRequest) {
		cancelAnimationFrame(atmosphericAnimationRequest);
		atmosphericAnimationRequest = null;
	}
	applyStaticNeonRoads();
};

const startAtmosphereLoop = () => {
	if (!map.value || !isMapReady.value || atmosphericAnimationRequest) return;
	atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
};

const animateAtmosphere = (time) => {
	if (!map.value || !isMapReady.value) return;
	if (!shouldRunAtmosphere.value) {
		stopAtmosphereLoop();
		return;
	}

	// ✅ ถ้า tab ไม่ active: ข้ามงานหนัก แต่ "ยังวนต่อ" เพื่อกลับมาได้เอง
	if (document.hidden) {
		atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
		return;
	}
	if (map.value.getZoom() < 12) {
		atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
		return;
	}

	// 1. Neon Road Pulse
	if (allowNeonPulse.value) {
		const pulse = (Math.sin(time / 1000) + 1) / 2;
		if (map.value.getLayer("neon-roads-outer")) {
			map.value.setPaintProperty(
				"neon-roads-outer",
				"line-opacity",
				0.1 + pulse * 0.2,
			);
		}
		if (map.value.getLayer("neon-roads-inner")) {
			map.value.setPaintProperty(
				"neon-roads-inner",
				"line-opacity",
				0.4 + pulse * 0.4,
			);
			map.value.setPaintProperty(
				"neon-roads-inner",
				"line-width",
				0.5 + pulse * 1.5,
			);
		}
	} else {
		applyStaticNeonRoads();
	}

	// 2. Fireflies Drift (throttled on low zoom)
	if (allowAmbientFx.value) {
		ensureFirefliesLayer();
		const z = map.value.getZoom();
		const interval = z < 13 ? 250 : 0; // zoom ต่ำอัปเดตทุก 250ms (เบาขึ้นมาก)

		if (!interval || time - lastFirefliesUpdate > interval) {
			lastFirefliesUpdate = time;

			firefliesData.value.features.forEach((f) => {
				const p = f.properties;
				p.phase += 0.01;
				f.geometry.coordinates = [
					p.baseCoords[0] + Math.sin(p.phase) * 0.002,
					p.baseCoords[1] + Math.cos(p.phase) * 0.002,
				];
			});

			if (map.value.getSource("fireflies")) {
				map.value.getSource("fireflies").setData(firefliesData.value);
			}
		}
	} else {
		removeFirefliesLayer();
	}

	atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
};

onUnmounted(() => {
	if (routeAbortController) {
		routeAbortController.abort();
		routeAbortController = null;
	}
	if (atmosphericAnimationRequest) {
		cancelAnimationFrame(atmosphericAnimationRequest);
		atmosphericAnimationRequest = null;
	}
	stopSmartPulseLoop();
	stopRouteTrailAnimation();
});

const remove3dBuildingLayers = () => {
	if (!map.value) return;
	["3d-buildings", "3d-buildings-cyber"].forEach((layerId) => {
		if (map.value.getLayer(layerId)) {
			map.value.removeLayer(layerId);
		}
	});
};

const applyFogSettings = () => {
	if (!map.value) return;
	if (!allowMapFog.value) {
		map.value.setFog(null);
		return;
	}
	map.value.setFog({
		range: [0.5, 10],
		color: "#242B4B", // Richer Vibe Blue-Purple
		"horizon-blend": 0.3,
		"high-color": "#161B33", // Deep Space Blue
		"space-color": "#0B0E17", // Void Black
		"star-intensity": 0.8, // Brighter stars
	});
};

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

	// 2. Shops Source (Fallback) - Keep pins_source updated when props change
	const pinsSource = map.value.getSource(PIN_SOURCE_ID);

	const validShops =
		props.shops?.filter((s) => {
			const lat = s.lat ?? s.latitude;
			const lng = s.lng ?? s.longitude;
			return (
				lat !== undefined &&
				lng !== undefined &&
				!Number.isNaN(Number(lat)) &&
				!Number.isNaN(Number(lng))
			);
		}) || [];

	const features = validShops.map((shop) => {
		// ✅ FIX: Use normalized coordinates to handle both lat/lng and latitude/longitude
		const lat = Number(shop.lat ?? shop.latitude);
		const lng = Number(shop.lng ?? shop.longitude);

		return {
			type: "Feature",
			geometry: {
				type: "Point",
				coordinates: [lng, lat], // Mapbox uses [lng, lat]
			},
			properties: {
				id: shop.id,
				name: shop.name,
				category: shop.category,
				status: shop.status,
				pin_type: shop.is_giant_active ? "giant" : "normal",
				boost: shop.is_boost_active || shop.boostActive || false,
				verified: shop.is_verified || shop.verifiedActive || false,
				glow: shop.is_glowing || shop.glowActive || false,
				giant: shop.is_giant_active || shop.giantActive || false,
				visibility_score: shop.visibility_score ?? shop.visibilityScore ?? 0,
				vibe_score: shop.visibility_score ?? shop.visibilityScore ?? 0,
				is_live: liveVenueRefs.value.has(String(shop.id)),
				is_event: shop.category === "Event" || shop.type === "Event", // ✅ Added Event Pin logic
				has_coin: !(shopStore.collectedCoins?.has?.(shop.id) ?? false),
				is_glowing: shop.is_glowing || false,
			},
		};
	});

	if (pinsSource) {
		pinsSource.setData({
			type: "FeatureCollection",
			features,
		});
		refreshSmartPulseTargets();
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
	if (!props.buildings || !Array.isArray(props.buildings)) return [];
	const now = new Date();
	return props.buildings.filter((event) => {
		if (!event.startTime || !event.endTime) return true; // Always show if no time limits
		const start = new Date(event.startTime);
		const end = new Date(event.endTime);
		return now >= start && now <= end;
	});
});

// ✅ Legacy: Day/Night computed property removed or kept for overlay background logic.
// We kept `useTimeTheme` for map style. The gradient overlay for map can still use `currentHour`.
const dayNightStyle = computed(() => {
	const h = currentHour.value;
	if (h >= 5 && h < 7)
		return {
			background:
				"linear-gradient(to bottom, rgba(251,146,60,0.15), rgba(236,72,153,0.1))",
		};
	if (h >= 7 && h < 17)
		return {
			background:
				"linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)",
		};
	if (h >= 17 && h < 19)
		return {
			background:
				"linear-gradient(to bottom, rgba(168,85,247,0.15), rgba(251,146,60,0.1))",
		};
	return {
		background:
			h >= 19 || h < 5
				? "linear-gradient(to bottom, rgba(30,58,138,0.35), rgba(15,23,42,0.45))" // Deeper night
				: "linear-gradient(to bottom, rgba(30,58,138,0.25), rgba(15,23,42,0.3))",
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
	initMapOnce(props.isDarkMode ? DARK_STYLE : LIGHT_STYLE);
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

// ✅ Map Interaction Handlers
const handlePointClick = (e) => {
	if (!e.features?.[0]) return;
	const feature = e.features[0];
	const shopData = { ...feature.properties };
	const pulseColor =
		shopData.pin_type === "giant"
			? "#a855f7"
			: shopData.boost
				? "#ef4444"
				: "#60a5fa";
	spawnTapRipple(feature.geometry.coordinates, pulseColor);
	triggerMapHaptic("light");

	// Ensure numeric coords
	shopData.lat = Number(feature.geometry.coordinates[1]);
	shopData.lng = Number(feature.geometry.coordinates[0]);

	emit("select-shop", shopData);
	flyTo([shopData.lng, shopData.lat], 16);
};

const handleClusterClick = (e) => {
	if (!map.value) return;
	const features = map.value.queryRenderedFeatures(e.point, {
		layers: [CLUSTER_LAYER_ID],
	});
	const cluster = features?.[0];
	if (!cluster) return;
	triggerMapHaptic("medium");
	spawnTapRipple(cluster.geometry.coordinates, "#a78bfa");

	const clusterId = cluster.properties?.cluster_id;
	const source =
		map.value.getSource(PIN_SOURCE_ID) ??
		map.value.getSource("vibe-shops-regular");

	if (!source?.getClusterExpansionZoom) return;
	source.getClusterExpansionZoom(clusterId, (err, zoom) => {
		if (err) return;
		map.value.easeTo({
			center: cluster.geometry.coordinates,
			zoom: zoom,
		});
	});
};

const setPointer = () => {
	if (map.value) map.value.getCanvas().style.cursor = "pointer";
};
const resetPointer = () => {
	if (map.value) map.value.getCanvas().style.cursor = "";
};

const setupMapInteractions = () => {
	if (!map.value) return;

	const safeBind = (event, layerId, handler) => {
		if (!map.value.getLayer(layerId)) return;
		map.value.off(event, layerId, handler);
		map.value.on(event, layerId, handler);
	};

	// Pins
	safeBind("click", PIN_LAYER_ID, handlePointClick);
	safeBind("mouseenter", PIN_LAYER_ID, setPointer);
	safeBind("mouseleave", PIN_LAYER_ID, resetPointer);

	// Optional coin layer (only if exists)
	safeBind("click", "unclustered-coins", handlePointClick);
	safeBind("mouseenter", "unclustered-coins", setPointer);
	safeBind("mouseleave", "unclustered-coins", resetPointer);

	// Clusters
	safeBind("click", CLUSTER_LAYER_ID, handleClusterClick);
	safeBind("mouseenter", CLUSTER_LAYER_ID, setPointer);
	safeBind("mouseleave", CLUSTER_LAYER_ID, resetPointer);
};

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

// ✅ Handle Marker Click
const handleMarkerClick = (item) => {
	if (!item) return;

	emit("select-shop", item);
	showPopup(item);

	// No-op for now as it's handled below
};

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
// ✅ Focus Location (Fly To) - Smooth & Precise Centering
const focusLocation = (
	coords,
	targetZoom = 17,
	pitch = 50,
	extraBottomOffset = 0,
) => {
	if (!map.value || !coords) return;

	// Calculate dynamic padding based on UI offsets
	// "Pin must be in the visual center"
	const padding = {
		top: props.uiTopOffset + 50,
		bottom:
			props.uiBottomOffset +
			(props.isSidebarOpen ? 20 : 180) +
			extraBottomOffset, // Extra buffer for card/popup
		left: props.isSidebarOpen ? 300 : 20,
		right: 20,
	};

	map.value.flyTo({
		center: coords,
		zoom: targetZoom,
		pitch: pitch ?? 50, // Cinematic pitch
		bearing: 0,
		padding,
		speed: 0.6, // Slow & Smooth (iOS feel)
		curve: 1.1, // Gentle curve
		essential: true,
	});
	// ✅ Add Layers
	addHeatmapLayer(); // Heatmap layer
	// NOTE: add3DBuildings and addPulsingDot were removed (undefined functions)
};

// ✅ Center on User
const centerOnUser = () => {
	if (props.userLocation) {
		// ✅ FIX 1.4: Convert [lat, lng] to Mapbox's [lng, lat] format
		const lngLat = [props.userLocation[1], props.userLocation[0]];
		focusLocation(lngLat, 17);
	}
};

// ✅ Watchers
watch(
	() => props.isDarkMode,
	(newVal) => {
		if (map.value) {
			map.value.setStyle(newVal ? DARK_STYLE : LIGHT_STYLE);
			map.value.once("style.load", () => {
				setupMapLayers();
				setupMapInteractions(); // ✅ Re-bind interactions after style change
				updateMapSources();
				updateMarkers();
				updateEventMarkers();
				updateDistanceLine();
				updateUserLocation();
			});
		}
	},
);

watch(
	[allowAmbientFx, allowNeonPulse, allowHeatmap, allow3dBuildings, allowMapFog],
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
	},
);

watch([effectiveMotionBudget, isPerfRestricted], () => {
	refreshSmartPulseTargets();
});

watch(
	() => props.shops,
	(newShops, oldShops) => {
		if (!Array.isArray(newShops)) return;
		// ⚡ Smart Diffing: Only update if shops actually changed significantly
		// This prevents "flicker" when dragging or small state updates occur

		const isSameSet =
			newShops.length === oldShops?.length &&
			newShops.every((s, i) => s.id === oldShops[i].id);

		if (isSameSet) return;

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
				return;
			}
		}
		requestUpdateMarkers();
	},
	{ deep: true },
);

watch(
	() => props.highlightedShopId,
	async (newId) => {
		await nextTick();
		updateMarkers();
		refreshSmartPulseTargets();
		if (!newId) {
			closeActivePopup();
			return;
		}
		const shop = props.shops?.find((s) => String(s.id) === String(newId));
		if (shop) {
			showPopup(shop);
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
	// This block only sets up the hourly interval.

	hourInterval = setInterval(() => {
		currentHour.value = new Date().getHours();
		updateEventMarkers();
	}, 60000);
});

onUnmounted(() => {
	mapReadyFallbackArmed.value = false;
	if (motionMediaQuery) {
		motionMediaQuery.removeEventListener?.("change", handleMotionChange);
		motionMediaQuery = null;
	}

	if (hourInterval) {
		clearInterval(hourInterval);
		hourInterval = null;
	}

	stopAtmosphereLoop();
	removeFirefliesLayer();
	stopSmartPulseLoop();
	stopRouteTrailAnimation();
	tapRipplesData.value = { type: "FeatureCollection", features: [] };

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
		map.value.off("click", PIN_LAYER_ID, handlePointClick);
		map.value.off("mouseenter", PIN_LAYER_ID, setPointer);
		map.value.off("mouseleave", PIN_LAYER_ID, resetPointer);
		map.value.off("click", "unclustered-coins", handlePointClick);
		map.value.off("mouseenter", "unclustered-coins", setPointer);
		map.value.off("mouseleave", "unclustered-coins", resetPointer);
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
	flyTo: (arg1, arg2) => {
		if (!map.value) return;
		if (typeof arg1 === "object" && !Array.isArray(arg1)) {
			// It's a Mapbox options object { center, zoom, ... }
			map.value.flyTo(arg1);
		} else {
			// Legacy args: coords, zoom
			map.value.flyTo({
				center: arg1,
				zoom: arg2,
				essential: true,
				speed: 0.8,
				curve: 1.4,
			});
		}
	},
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
        <h2 class="text-2xl font-black text-white mb-3">Map Not Available</h2>
        <p class="text-sm text-zinc-300 mb-6 leading-relaxed">
          WebGL is required to display the map but is currently disabled in your
          browser.
        </p>

        <!-- Instructions -->
        <div
          class="text-left bg-black/30 rounded-xl p-4 mb-6 text-xs text-zinc-400"
        >
          <p class="font-bold text-white mb-2">🔧 How to fix (Chrome):</p>
          <ol class="list-decimal list-inside space-y-1">
            <li>
              Open
              <code class="bg-white/10 px-1 rounded">chrome://settings</code>
            </li>
            <li>Search for "Hardware acceleration"</li>
            <li>Enable "Use graphics acceleration when available"</li>
            <li>Restart your browser</li>
          </ol>
        </div>

        <div class="space-y-3">
          <button
            @click="window.location.reload()"
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-xl transition-colors transition-transform shadow-lg shadow-blue-500/25 active:scale-95"
          >
            🔄 Reload Page
          </button>
          <button
            @click="maplessMode = true"
            class="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold rounded-xl transition-colors transition-transform shadow-lg shadow-orange-500/25 active:scale-95"
          >
            📱 Continue Without Map
          </button>
          <a
            href="https://get.webgl.org/"
            target="_blank"
            rel="noopener noreferrer"
            class="block w-full py-3.5 bg-white/10 text-white/80 font-bold rounded-xl hover:bg-white/20 transition-colors transition-transform"
          >
            🌐 Check WebGL Support
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
        <p class="text-sm">Map unavailable</p>
      </div>
    </div>

    <!-- ✅ Entertainment Atmosphere Effects (simplified) -->
    <div class="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
      <!-- Fireflies only (removed day/night overlay for cleaner map) -->
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
          Mapbox Token Required
        </h2>
        <p class="text-sm text-zinc-400 mb-6 leading-relaxed">
          กรุณาใส่ Mapbox Access Token ในไฟล์
          <code class="bg-black/50 px-1.5 py-0.5 rounded text-red-400"
            >.env.local</code
          >
          โดยนำค่ามาจาก
          <a
            href="https://account.mapbox.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-400 underline"
            >Mapbox Dashboard</a
          >
          ครับ
        </p>
        <button
          @click="window.location.reload()"
          class="w-full py-3 bg-white text-black font-bold rounded-xl active:scale-95 transition-colors transition-transform"
        >
          Check Again
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

/* Mapbox Logo & Attribution Hiding */
.mapboxgl-ctrl-logo,
.mapboxgl-ctrl-attrib {
  display: none !important;
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

/* Fireflies */
.firefly-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.firefly {
  position: absolute;
  width: 4px;
  height: 4px;
  background: radial-gradient(
    circle,
    rgba(255, 220, 100, 0.9) 0%,
    rgba(255, 200, 50, 0.5) 50%,
    transparent 70%
  );
  border-radius: 50%;
  box-shadow:
    0 0 8px rgba(255, 220, 100, 0.7),
    0 0 15px rgba(255, 200, 50, 0.4);
  animation: fireflyFloat ease-in-out infinite;
}

@keyframes fireflyFloat {
  0%,
  100% {
    transform: translateY(0) translateX(0) scale(1);
    opacity: 0.2;
  }
  25% {
    transform: translateY(-25px) translateX(12px) scale(1.3);
    opacity: 0.9;
  }
  50% {
    transform: translateY(-40px) translateX(-8px) scale(0.9);
    opacity: 0.5;
  }
  75% {
    transform: translateY(-15px) translateX(15px) scale(1.1);
    opacity: 0.7;
  }
}

.vibe-mapbox-popup .mapboxgl-popup-content {
  padding: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 20px;
}

.vibe-mapbox-popup .mapboxgl-popup-tip {
  display: none; /* Tip can cause gaps, custom SVG pin tip is better */
}

/* Entry animation for popup */
@keyframes popup-reveal {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.vibe-popup {
  animation: popup-reveal 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  font-family: var(--font-body, "Prompt", "Sarabun", system-ui, sans-serif);
}

/* Coin Glow Effect */
.marker-wrapper.coin-glow {
  filter: drop-shadow(0 0 4px rgba(234, 179, 8, 0.4));
  animation: coin-pulse 2.5s ease-in-out infinite;
}

@keyframes coin-pulse {
  0%,
  100% {
    filter: drop-shadow(0 0 4px rgba(234, 179, 8, 0.4));
  }
  50% {
    filter: drop-shadow(0 0 8px rgba(234, 179, 8, 0.6));
  }
}

@keyframes coin-spin {
  0%,
  100% {
    transform: rotateY(0deg);
  }
  50% {
    transform: rotateY(180deg);
  }
}

/* Giant Pin for Events - Premium SVG Design */
.giant-pin-marker {
  z-index: 150;
}

.giant-pin-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.4));
  animation: giant-pin-float 3s ease-in-out infinite;
}

.giant-pin-svg {
  overflow: visible;
}

.giant-pin-icon-overlay {
  position: absolute;
  top: 35px;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  pointer-events: none;
  font-size: 24px;
}

.giant-pin-label-new {
  position: absolute;
  bottom: -15px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  background: linear-gradient(
    135deg,
    rgba(15, 15, 25, 0.95),
    rgba(30, 30, 50, 0.95)
  );
  color: white;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  border-radius: 20px;
  white-space: nowrap;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(139, 92, 246, 0.5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  text-transform: uppercase;
}

.pulse-ring {
  transform-origin: 40px 35px;
  animation: ring-pulse 2s ease-out infinite;
}

@keyframes ring-pulse {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

@keyframes giant-pin-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-5px) rotate(2deg);
  }
  50% {
    transform: translateY(-12px) rotate(0deg);
  }
  75% {
    transform: translateY(-5px) rotate(-2deg);
  }
}

@keyframes giant-pulse {
  0% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}

/* Entertainment Distance Label */
.distance-badge {
  background: linear-gradient(
    135deg,
    rgba(6, 182, 212, 0.2),
    rgba(139, 92, 246, 0.2)
  );
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid rgba(6, 182, 212, 0.3);
  font-family: var(--font-mono, "JetBrains Mono", "Fira Code", monospace);
  letter-spacing: 0.5px;
}

/* LIVE Heartbeat Pulse - Multi Layered */
.live-pulse-ring-outer {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: rgba(255, 45, 85, 0.15);
  animation: marker-pulse-outer 3s infinite ease-out;
  pointer-events: none;
  z-index: -3;
}

.live-pulse-ring-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 45, 85, 0.3);
  animation: marker-pulse-inner 1.5s infinite ease-out;
  pointer-events: none;
  z-index: -2;
}

.live-pulse-core {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #ff2d55;
  box-shadow: 0 0 20px #ff2d55;
  animation: core-throb 0.8s infinite alternate ease-in-out;
  pointer-events: none;
  z-index: -1;
}

/* CSS Cleaned up - Duplicates removed in previous steps */

@keyframes marker-pulse-outer {
  0% {
    transform: translate(-50%, -50%) scale(0.6);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(3);
    opacity: 0;
  }
}

@keyframes marker-pulse-inner {
  0% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
}

@keyframes core-throb {
  from {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.8;
  }
  to {
    transform: translate(-50%, -50%) scale(1.3);
    opacity: 1;
  }
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
