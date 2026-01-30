// --- C:\vibecity.live\src\components\map\MapboxContainer.vue ---

<script setup>
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
import { useTimeTheme } from "../../composables/useTimeTheme";
import { useShopStore } from "../../store/shopStore";
import {
  createGiantPinElement,
  createMarkerElement,
  createPopupHTML,
} from "../../utils/mapRenderer";
import { calculateDistance } from "../../utils/shopUtils";

const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

const { t, te, locale } = useI18n();
const tt = (key, fallback) => (te(key) ? t(key) : fallback);

const shopStore = useShopStore();

// ✅ Phase 2: Dynamic Vibe Shifting
const { isNightMode, mapStyle, currentHour } = useTimeTheme();

// ✅ Vibe Effects
import { useVibeEffects } from "../../composables/useVibeEffects";
import { socketService } from "../../services/socketService";
const { activeVibeEffects, triggerVibeEffect } = useVibeEffects();

// Socket Listener
onMounted(() => {
  socketService.addListener((data) => {
    if (data.type === "vibe" && data.lat && data.lng) {
      // Trigger effect on map
      triggerVibeEffect(
        { id: data.shopId, lat: data.lat, lng: data.lng },
        data.content,
      );
    }
  });

  socketService.addListener((data) => {
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
  });
});

// ✅ Heatmap Logic
const heatmapGeoJson = {
  type: "FeatureCollection",
  features: [],
};

const updateHeatmapData = (densityData) => {
  // densityData: { shopId: count }
  if (!props.shops) return;

  const features = [];
  Object.entries(densityData).forEach(([shopId, count]) => {
    const shop = props.shops.find((s) => s.id == shopId);
    if (shop && shop.lat && shop.lng) {
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
  if (map.value && map.value.getSource("heatmap-source")) {
    map.value.getSource("heatmap-source").setData(heatmapGeoJson);
  }
};

// Add Heatmap Layer
const addHeatmapLayer = () => {
  if (!map.value) return;

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

// Watch for Theme Changes and update Mapbox Style dynamically
watch(mapStyle, (newStyle) => {
  if (map.value && isMapReady.value) {
    // Preserve layers before switching style (optional advanced logic, for MVP we reload style)
    // Mapbox GL JS setStyle removes custom layers. We need to re-add them.
    map.value.setStyle(newStyle);
    map.value.once("style.load", () => {
      setupMapLayers();
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

// ✅ Map State
const mapContainer = ref(null);
const map = shallowRef(null);
const zoom = ref(15);
const center = ref([98.968, 18.7985]); // Mapbox uses [lng, lat]
const isMapReady = ref(false);
const mapLoaded = ref(false); // ✅ Fade-in control
const activePopup = shallowRef(null);
const markersMap = shallowRef(new Map());
const eventMarkersMap = shallowRef(new Map());

let hourInterval = null;

// ✅ Throttled Update Logic (100ms min between updates for performance)
let updateMarkersRequested = false;
let lastMarkerUpdate = 0;
const MARKER_UPDATE_THROTTLE = 100; // ms

const secondCounter = ref(0);
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
    if (map.value?.getSource("distance-line")) {
      map.value.getSource("distance-line").setData({
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

    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${uLng},${uLat};${sLng},${sLat}?geometries=geojson&access_token=${mapboxgl.accessToken}`,
    );

    if (!res.ok) return;

    const data = await res.json();
    if (data.routes?.[0]) {
      const route = data.routes[0].geometry;

      // Update Map Source
      if (map.value?.getSource("distance-line")) {
        map.value.getSource("distance-line").setData({
          type: "Feature",
          geometry: route,
        });
      }

      // Update State & UI
      roadDistance.value = data.routes[0].distance;
      roadDuration.value = data.routes[0].duration;
      updatePopupUi(roadDistance.value, roadDuration.value);
    }
  } catch (err) {
    // Silent catch: Network/API errors are expected occasionally and shouldn't disrupt UX
  }
};

watch(() => props.selectedShopCoords, updateRoadDirections);

const requestUpdateMarkers = () => {
  if (updateMarkersRequested) return;
  const now = Date.now();
  const timeSinceLastUpdate = now - lastMarkerUpdate;

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
      if (!effects.find((e) => e.id === id)) {
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
        "clusters",
        "unclustered-point",
        "cluster-count",
        "vibe-shops-regular",
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

const animateAtmosphere = (time) => {
  if (!map.value || !isMapReady.value) return;
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

  // 2. Fireflies Drift (throttled on low zoom)
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

  atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
};

onUnmounted(() => {
  if (atmosphericAnimationRequest) {
    cancelAnimationFrame(atmosphericAnimationRequest);
  }
});

// ✅ Map Layers & Sources Setup
/**
 * Setup static map layers (sources and layers).
 * This is called once on map load or style change.
 */
const setupMapLayers = () => {
  if (!map.value) return;

  // 0. Neon Roads (Atmospheric Chiang Mai roads)
  if (!map.value.getSource("neon-roads")) {
    try {
      map.value.addSource("neon-roads", {
        type: "geojson",
        data: "/data/chiangmai-main-roads-lanes.geojson",
      });
      map.value.addLayer({
        id: "neon-roads-outer",
        type: "line",
        source: "neon-roads",
        paint: {
          "line-color": "#06b6d4",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 4],
          "line-opacity": 0.15,
          "line-blur": 5,
        },
      });
      map.value.addLayer({
        id: "neon-roads-inner",
        type: "line",
        source: "neon-roads",
        paint: {
          "line-color": "#22d3ee",
          "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 1.5],
          "line-opacity": 0.6,
        },
      });
    } catch (e) {
      console.warn("⚠️ Neon roads setup failed:", e.message);
    }
  }

  // Fireflies Layer
  if (!map.value.getSource("fireflies")) {
    initFireflies();
    map.value.addSource("fireflies", {
      type: "geojson",
      data: firefliesData.value,
    });
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

  // 1. Distance Line (The cyan path between user and destination)
  if (!map.value.getSource("distance-line")) {
    map.value.addSource("distance-line", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.value.addLayer({
      id: "distance-line-layer",
      type: "line",
      source: "distance-line",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#00ffff",
        "line-width": 3,
        "line-dasharray": [3, 2],
        "line-opacity": 0.9,
      },
    });

    map.value.addLayer({
      id: "distance-line-glow",
      type: "line",
      source: "distance-line",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#00ffff",
        "line-width": 6,
        "line-opacity": 0.25,
        "line-blur": 2,
      },
    });
  }

  // 2. User Location
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

  // 3. Shops Source (Split Layers)

  // A. Regular Shops (Clustered)
  if (!map.value.getSource("vibe-shops-regular")) {
    map.value.addSource("vibe-shops-regular", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterMaxZoom: 14, // Stop clustering at zoom 14
      clusterRadius: 50,
    });

    // Cluster Circles
    map.value.addLayer({
      id: "clusters",
      type: "circle",
      source: "vibe-shops-regular",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#60a5fa", // Blue (< 10)
          10,
          "#a855f7", // Purple (< 30)
          30,
          "#ec4899", // Pink (> 30)
        ],
        "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.8,
      },
    });

    // Cluster Count Text
    map.value.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "vibe-shops-regular",
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

    // Unclustered Point (Layer for interactions when zoomed in)
    // Note: We don't render actual dots here because we use `updateMarkers` (HtmlMarker)
    // But we need this layer to detect where "regular items" are for click logic if we wanted GL-based markers.
    // However, our existing system uses DOM Markers.
    // PROBLEM: Mapbox GL Clustering requires GL Layers to visualize clusters.
    // DOM Markers *cannot* easily be clustered by Mapbox logic unless we manually query the cluster source.
    // SOLUTION: We will keep DOM Markers for Zoom >= 14 (Individual) and handling updates.
    // But for clusters (Zoom < 14), we use the GL layers above.
    // We need to sync `updateMarkers` to ONLY show DOM markers that are NOT in a cluster. (? No, better: only show DOM markers when not clustered at all?)
    // Actually, `updateMarkers` iterates `props.shops`.
    // We need to modify `updateMarkers` to Check if map zoom < 14 and verify visibility?
    // A simpler approach for "Hybrid":
    // 1. Zoom < 14: Show Clusters (GL). Hide individual DOM markers for regular shops.
    // 2. Zoom >= 14: Show individual DOM markers.
  }

  // B. Giant Shops (Unclustered / Always Visible)
  if (!map.value.getSource("vibe-shops-giant")) {
    map.value.addSource("vibe-shops-giant", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: false,
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

  // 2. Shops Source - Split into Regular (Clustered) vs Giant/Promoted (Always Visible)
  const regularSource = map.value.getSource("vibe-shops-regular");
  const giantSource = map.value.getSource("vibe-shops-giant");

  if (props.shops) {
    const validShops = props.shops.filter((s) => {
      const lng = Number(s.lng);
      const lat = Number(s.lat);
      return (
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        Math.abs(lng) <= 180 &&
        Math.abs(lat) <= 90
      );
    });

    // Split Logic
    const regularFeatures = [];
    const giantFeatures = [];

    validShops.forEach((shop) => {
      const feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [Number(shop.lng), Number(shop.lat)],
        },
        properties: {
          id: shop.id,
          name: shop.name,
          category: shop.category,
          status: shop.status,
          is_giant: shop.is_giant_active,
          has_coin: !shopStore.collectedCoins.has(shop.id),
          is_glowing: shop.is_glowing || false,
        },
      };

      if (shop.is_giant_active) {
        giantFeatures.push(feature);
      } else {
        regularFeatures.push(feature);
      }
    });

    if (regularSource)
      regularSource.setData({
        type: "FeatureCollection",
        features: regularFeatures,
      });
    if (giantSource)
      giantSource.setData({
        type: "FeatureCollection",
        features: giantFeatures,
      });
  }
};

const COLLECT_DISTANCE_KM = 0.05; // 50 meters to collect
// Check if user is close enough to collect
const checkCoinCollection = (shop) => {
  if (!props.userLocation || shopStore.collectedCoins.has(shop.id)) return;
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

// ✅ Mapbox lazy module holder + token
let mapboxgl = null;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// ✅ Ensure Mapbox is loaded (Lazy Load + Code Split)
const ensureMapboxLoaded = async () => {
  if (mapboxgl) return true;

  if (!MAPBOX_TOKEN || !MAPBOX_TOKEN.startsWith("pk.")) {
    isTokenInvalid.value = true;
    return false;
  }

  // 🔥 Dynamic import = code splitting
  const mod = await import("mapbox-gl");
  mapboxgl = mod.default || mod;

  // ✅ Set token only AFTER mapbox is loaded
  mapboxgl.accessToken = MAPBOX_TOKEN;

  return true;
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

// ✅ Initialize Map (async)
const initializeMap = async () => {
  console.log("🗺️ Starting map initialization...");

  if (!mapContainer.value) {
    console.error("❌ Map container not found");
    return;
  }

  // Check WebGL support first
  if (!checkWebGLSupport()) {
    console.error("❌ WebGL not supported");
    webGLSupported.value = false;
    isMapReady.value = true; // Allow UI to render fallback
    return;
  }

  const ok = await ensureMapboxLoaded();
  if (!ok) {
    console.error("❌ Mapbox GL JS failed to load");
    return;
  }

  if (!mapContainer.value) {
    console.error("❌ Map container lost during Mapbox load");
    return;
  }

  console.log("🗺️ Creating Mapbox map instance...");

  try {
    map.value = new mapboxgl.Map({
      container: mapContainer.value,
      style: props.isDarkMode ? DARK_STYLE : LIGHT_STYLE,
      center: center.value,
      zoom: zoom.value,
      // ✅ Expanded to cover all of Thailand (not just Chiang Mai)
      maxBounds: [
        [97, 5.5], // Southwest: Myanmar border to Malaysia border
        [106, 21], // Northeast: Laos/Cambodia to Northern Thailand
      ],
      attributionControl: false,
      antialias: false,
      failIfMajorPerformanceCaveat: false, // Allow software rendering
      preserveDrawingBuffer: true,
    });
    console.log("✅ Mapbox map instance created");
  } catch (err) {
    console.error("❌ Map initialization failed:", err);
    console.error("Error details:", err.message, err.stack);
    webGLSupported.value = false;
    isMapReady.value = true;
    return;
  }

  // Navigation controls removed (user prefers cleaner map)

  // Enable smooth scrolling and pinch-zoom
  map.value.scrollZoom.setWheelZoomRate(1 / 300);
  map.value.dragRotate.disable();

  // Handle map errors gracefully
  map.value.on("error", (e) => {
    console.error("🗺️ Map error:", e.error?.message || e);
    if (e.error?.message?.includes("WebGL")) {
      webGLSupported.value = false;
    }
    // Still show map even with errors
    if (!mapLoaded.value) {
      console.warn("⚠️ Map error occurred, forcing visibility");
      mapLoaded.value = true;
      isMapReady.value = true;
    }
  });

  // Style/source data events - no logging needed (too noisy)

  map.value.on("load", () => {
    console.log("🗺️ Map load event fired");
    isMapReady.value = true;
    setupMapLayers();
    setupMapInteractions(); // ✅ Setup click handlers for layers
    updateMapSources();
    requestUpdateMarkers();
    updateEventMarkers();

    // ✅ Start Atmospheric Animations
    // ✅ Performance: Disabled atmospheric loops
    // initFireflies();
    // atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);

    // ✅ Fade In Map
    setTimeout(() => {
      mapLoaded.value = true;
      console.log("✅ Map fully loaded and visible");
    }, 100);
  });

  // ✅ Fallback: If load event doesn't fire within 5 seconds, show map anyway
  setTimeout(() => {
    if (!mapLoaded.value) {
      console.warn("⚠️ Map load timeout - forcing visibility");
      mapLoaded.value = true;
      isMapReady.value = true;
    }
  }, 5000);

  // Sync maps state on movement
  map.value.on("moveend", () => {
    zoom.value = map.value.getZoom();
    center.value = [map.value.getCenter().lng, map.value.getCenter().lat];
    requestUpdateMarkers();
    updateMapSources();
  });

  map.value.on("resize", () => requestUpdateMarkers());

  // Map click to deselect
  map.value.on("click", (e) => {
    const features = map.value.queryRenderedFeatures(e.point);
    if (!features.length) {
      closeActivePopup();
    }
  });
};

// MVP Unicorn Popup - Logic extracted to mapRenderer.js
const getPopupHTML = (item) => {
  return createPopupHTML({
    item,
    isDarkMode: props.isDarkMode,
    hasCoins: !shopStore.collectedCoins.has(item.id),
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

  if (!map.value) return;

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

  // ✅ After popup is mounted, measure its height and refocus once (super smooth)
  requestAnimationFrame(() => {
    try {
      const popupEl = popup.getElement();
      const popupCard = popupEl?.querySelector(".vibe-popup");
      const popupH = popupCard?.getBoundingClientRect()?.height || 0;
    } catch (e) {
      // Ignore focus errors during animation
    }
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
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`,
          "_blank",
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
const createMarkerElementWrapper = (item, isHighlighted, isLive) => {
  return createMarkerElement({
    item,
    isHighlighted,
    isLive,
    hasCoins: !shopStore.collectedCoins.has(item.id),
  });
};

// ✅ Create Giant Pin for Events - Logic extracted to mapRenderer.js
const createGiantPinElementWrapper = (event) => {
  return createGiantPinElement(event);
};

// ✅ Update Markers (Viewport-based filtering for performance)
const MAX_VISIBLE_MARKERS = 120; // Increased to show more activity

// ✅ Update Markers (Optimized Diffing)
const updateMarkers = () => {
  if (!map.value || !isMapReady.value || !props.shops) return;

  const newShops = props.shops; // This is the new list
  const newShopIds = new Set(newShops.map((s) => String(s.id)));

  // 1. Remove markers that are no longer in the new list
  markersMap.value.forEach((value, key) => {
    if (!newShopIds.has(key)) {
      value.marker.remove();
      markersMap.value.delete(key);
    }
  });

  // 2. Add or Update markers
  newShops.forEach((shop) => {
    const idStr = String(shop.id);
    const isGiant = shop.is_giant_active;
    const isSelected = Number(shop.id) === Number(props.highlightedShopId);

    // Check if marker already exists
    if (markersMap.value.has(idStr)) {
      const { marker: existingMarker, shop: existingShop } =
        markersMap.value.get(idStr);
      const el = existingMarker.getElement();

      // Update Highlight State
      if (isSelected) {
        el.setAttribute("data-highlighted", "true");
        el.style.zIndex = "300";
      } else {
        el.removeAttribute("data-highlighted");
        el.style.zIndex = isGiant ? "1000" : "50";
      }

      // Update Live State if changed
      // (Optional: deep check if needed, for performance we rely on CSS classes if we added them)

      // Update stored shop data reference
      markersMap.value.set(idStr, { marker: existingMarker, shop });
      return;
    }

    // Create DOM Element
    let el;
    const isLive = shop.status === "LIVE";

    // ✅ Optimization: ONLY create DOM markers for Giant/Active shops
    // Regular shops are now rendered via WebGL layer ("unclustered-point")
    if (!isGiant && !isSelected) {
      return;
    }

    if (isGiant) {
      el = document.createElement("div");
      el.className = `marker-container transition-all duration-500 will-change-transform z-[1000]`;
      el.innerHTML = `
            <div class="relative group cursor-pointer w-12 h-12">
                <div class="relative w-full h-full rounded-2xl bg-gradient-to-br from-red-600 via-pink-600 to-purple-600 border-2 border-white shadow-xl flex items-center justify-center transform group-hover:scale-110 transition-transform">
                <span class="text-xl">🔥</span>
                </div>
                <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black text-white text-[9px] font-black uppercase tracking-widest border border-white/20 whitespace-nowrap shadow-md">
                GIANT
                </div>
            </div>
        `;
    } else {
      el = createMarkerElementWrapper(shop, isSelected, isLive);
    }

    const marker = new mapboxgl.Marker({
      element: el,
      anchor: "bottom",
    })
      .setLngLat([Number(shop.lng), Number(shop.lat)])
      .addTo(map.value);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      activePopup.value = shop;
      shopStore.incrementClick(shop.id);
      if (isGiant) {
        emit("open-building", shop);
      } else {
        emit("select-shop", shop);
        showPopup(shop);
      }
    });

    // ✅ Respect visibility state
    if (!pinsVisible.value) {
      el.style.opacity = "0";
    }

    markersMap.value.set(idStr, { marker, shop });
  });
};

// ✅ Interaction for GL Layers (Regular Shops)
const setupMapInteractions = () => {
  if (!map.value) return;

  // Click on Unclustered Point Logic (Regular Shops)
  // We need to add a layer for unclustered points first!
  if (!map.value.getLayer("unclustered-point")) {
    map.value.addLayer({
      id: "unclustered-point",
      type: "circle",
      source: "vibe-shops-regular",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": [
          "match",
          ["get", "status"],
          "LIVE",
          "#ef4444", // Red
          "TONIGHT",
          "#f97316", // Orange
          "#3b82f6", // Default Blue
        ],
        "circle-radius": [
          "case",
          ["boolean", ["get", "is_glowing"], false],
          9,
          6,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Add text label for name? Maybe too cluttered.
  }

  // Click Event
  map.value.on("click", "unclustered-point", (e) => {
    const features = e.features;
    if (!features.length) return;

    const feature = features[0];
    // Geometry to LatLng
    const coordinates = feature.geometry.coordinates.slice();
    const featureProps = feature.properties; // has id, name, etc.

    // Fix logic for wrapped worlds
    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    // Trigger Select
    // Note: feature.properties values are serialised. ID might be number or string.
    // We need to find the full shop object from props.shops usually,
    // OR pass enough data in properties.
    const fullShop = props.shops
      ? props.shops.find((s) => String(s.id) === String(featureProps.id))
      : { ...featureProps };

    shopStore.incrementClick(fullShop.id); // ✅ Real Data Tracking
    emit("select-shop", fullShop);
  });

  // Pointer Cursor
  map.value.on("mouseenter", "unclustered-point", () => {
    map.value.getCanvas().style.cursor = "pointer";
  });
  map.value.on("mouseleave", "unclustered-point", () => {
    map.value.getCanvas().style.cursor = "";
  });

  // Cluster Click -> Zoom
  map.value.on("click", "clusters", (e) => {
    const features = map.value.queryRenderedFeatures(e.point, {
      layers: ["clusters"],
    });
    const clusterId = features[0].properties.cluster_id;
    map.value
      .getSource("vibe-shops-regular")
      .getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.value.easeTo({
          center: features[0].geometry.coordinates,
          zoom: zoom,
        });
      });
  });

  map.value.on("mouseenter", "clusters", () => {
    map.value.getCanvas().style.cursor = "pointer";
  });
  map.value.on("mouseleave", "clusters", () => {
    map.value.getCanvas().style.cursor = "";
  });
};

// ✅ Update Giant Pin Markers for Events
const updateEventMarkers = () => {
  if (!map.value || !isMapReady.value) return;

  const currentMarkers = eventMarkersMap.value;
  const eventIds = new Set(activeEvents.value.map((e) => e.id));

  // Remove expired event markers
  currentMarkers.forEach((marker, id) => {
    if (!eventIds.has(id)) {
      marker.remove();
      currentMarkers.delete(id);
    }
  });

  // Add new event markers
  activeEvents.value.forEach((event) => {
    if (!event.lat || !event.lng) return;
    if (currentMarkers.has(event.id)) return;

    const el = createGiantPinElement(event);
    const marker = new mapboxgl.Marker({
      element: el,
      anchor: "bottom",
    })
      .setLngLat([event.lng, event.lat])
      .addTo(map.value);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      emit("open-building", event);
    });

    // ✅ Respect visibility state
    if (!pinsVisible.value) {
      el.style.opacity = "0";
    }

    currentMarkers.set(event.id, marker);
  });

  eventMarkersMap.value = currentMarkers;
};

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

  const source = map.value.getSource("distance-line");
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
  addHeatmapLayer(); // Heatmap First
  add3DBuildings();
  addPulsingDot();
};

// ✅ Center on User
const centerOnUser = () => {
  if (props.userLocation) {
    focusLocation(props.userLocation, 17);
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
  () => props.shops,
  (newShops, oldShops) => {
    // ⚡ Smart Diffing: Only update if shops actually changed significantly
    // This prevents "flicker" when dragging or small state updates occur

    const isSameSet =
      newShops.length === oldShops?.length &&
      newShops.every((s, i) => s.id === oldShops[i].id);

    if (isSameSet) return;

    if (props.highlightedShopId != null) {
      const highlightedId = Number(props.highlightedShopId);
      const shopInNewList = newShops?.some(
        (s) => Number(s.id) === highlightedId,
      );
      if (
        shopInNewList &&
        !oldShops?.some((s) => Number(s.id) === highlightedId)
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
    if (!newId) {
      closeActivePopup();
      return;
    }
    const shop = props.shops?.find((s) => Number(s.id) === Number(newId));
    if (shop) {
      showPopup(shop);
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
  if (import.meta.env.VITE_E2E === "true") {
    console.log("E2E Mode: Skipping Mapbox Initialization");
    isMapReady.value = true;
    return;
  }

  await initializeMap();

  hourInterval = setInterval(() => {
    currentHour.value = new Date().getHours();
    updateEventMarkers();
  }, 60000);
});

onUnmounted(() => {
  if (hourInterval) {
    clearInterval(hourInterval);
    hourInterval = null;
  }

  // ถ้าคุณมี animation request ของ atmosphere อยู่แล้ว ให้เคลียร์ด้วย
  if (atmosphericAnimationRequest) {
    cancelAnimationFrame(atmosphericAnimationRequest);
    atmosphericAnimationRequest = null;
  }

  closeActivePopup();

  markersMap.value.forEach((m) => {
    m.remove();
  });
  eventMarkersMap.value.forEach((m) => {
    m.remove();
  });

  if (map.value) {
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
            class="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/25 active:scale-95"
          >
            🔄 Reload Page
          </button>
          <button
            @click="maplessMode = true"
            class="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-orange-500/25 active:scale-95"
          >
            📱 Continue Without Map
          </button>
          <a
            href="https://get.webgl.org/"
            target="_blank"
            class="block w-full py-3.5 bg-white/10 text-white/80 font-bold rounded-xl hover:bg-white/20 transition-all"
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
      <div class="firefly-container">
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
            class="text-blue-400 underline"
            >Mapbox Dashboard</a
          >
          ครับ
        </p>
        <button
          @click="window.location.reload()"
          class="w-full py-3 bg-white text-black font-bold rounded-xl active:scale-95 transition-all"
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
  font-family: inherit;
}

.vibe-popup button {
  transition: all 0.2s ease;
}

.vibe-popup button:active {
  transform: scale(0.95);
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
  font-family: "JetBrains Mono", "Fira Code", monospace;
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
