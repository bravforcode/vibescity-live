<script setup>
import {
  LMap,
  LTileLayer,
  LMarker,
  LIcon,
  LCircleMarker,
  LPolygon,
  LPolyline,
  // LImageOverlay, // REMOVED
} from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
// ✅ Import atmosphere styles
import "../../assets/map-atmosphere.css";
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import PoiIcon from "./PoiIcon.vue";
import L from "leaflet";
// TrafficPolylineLayer removed as we use CSS flow now

const props = defineProps({
  shops: Array,
  userLocation: Array,
  currentTime: Date,
  highlightedShopId: [Number, String],
  isDarkMode: { type: Boolean, default: true },
  activeZone: { type: String, default: null },
  uiTopOffset: { type: Number, default: 0 },
  uiBottomOffset: { type: Number, default: 0 },

  // Province focus
  activeProvince: { type: String, default: null },

  // Indoor floor plan REMOVED
  activeBuilding: { type: Object, default: null },

  buildings: { type: Object, default: () => ({}) },

  // activeFloor: { type: [String, Number], default: null }, // REMOVED
  // indoorPois: { type: Array, default: () => [] }, // REMOVED

  // ✅ Sidebar Open State (from App.vue)
  isSidebarOpen: { type: Boolean, default: false },

  // ✅ Navigation Legend Height (from App.vue)
  legendHeight: { type: Number, default: 0 },
});

// ✅ indoorNavItems: alias เพื่อให้อ่านง่าย/ใช้ต่อได้
const indoorNavItems = computed(() => props.indoorPois || []);

const chiangMaiBounds = [
  [18.0, 97.6], // SW
  [20.6, 100.3], // NE
];

const emit = defineEmits([
  "select-shop",
  "open-detail",
  "open-building",
  "exit-indoor",
  "open-ride-modal",
]);

const bounceTick = ref(0);
const zoom = ref(15);
const center = ref([18.7985, 98.968]);
const mapObject = ref(null);
const trafficLayerRef = ref(null);
const trafficRoutesLoaded = ref(false);
const isMapMoving = ref(false); // ✅ For physics wobble
const isRaining = ref(false); // ✅ Atmosphere state
const showClouds = ref(true); // ✅ Atmosphere state
const confettiParticles = ref([]); // ✅ Confetti explosion state

// ✅ Holographic Beams Data
const landmarkBeams = [
  { id: "maya", lat: 18.8021, lng: 98.9675, color: "#ec4899", height: "120px" }, // Maya (Pink)
  {
    id: "onenimman",
    lat: 18.8,
    lng: 98.968,
    color: "#f59e0b",
    height: "100px",
  }, // One Nimman (Orange)
  {
    id: "threekings",
    lat: 18.7902,
    lng: 98.9874,
    color: "#3b82f6",
    height: "150px",
  }, // Three Kings (Blue)
  {
    id: "thaapae",
    lat: 18.7877,
    lng: 98.9932,
    color: "#ef4444",
    height: "110px",
  }, // Tha Phae Gate (Red)
];

const getTrafficProfileByTime = (d = new Date()) => {
  const h = d.getHours();

  // peak เช้า/เย็น
  const isMorningPeak = h >= 7 && h <= 10;
  const isEveningPeak = h >= 16 && h <= 20;

  // night โล่งมาก
  const isNight = h >= 0 && h <= 5;

  // default กลางวันทั่วไป
  let vehicleCount = 120;
  let speedMin = 18;
  let speedMax = 42;

  if (isMorningPeak || isEveningPeak) {
    vehicleCount = 260; // ✅ รถเยอะมาก
    speedMin = 10;
    speedMax = 26;
  } else if (isNight) {
    vehicleCount = 60; // ✅ โล่ง
    speedMin = 22;
    speedMax = 55;
  }

  return { vehicleCount, speedMin, speedMax };
};

watch(
  () => props.currentTime,
  (t) => {
    if (!trafficLayerRef.value) return;
    const profile = getTrafficProfileByTime(t || new Date());
    trafficLayerRef.value.setOptions({
      vehicleCount: profile.vehicleCount,
      speedMin: profile.speedMin,
      speedMax: profile.speedMax,
    });
  },
  { immediate: true }
);

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ✅ Base map opacity (always 1 since indoor mode was removed)
const baseOpacity = computed(() => 1);

/** -----------------------------
 * ✅ Theme tile
 * ----------------------------- */
const tileLayerUrl = computed(() => {
  return props.isDarkMode
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
});

watch(
  () => props.isDarkMode,
  (newVal) => {
    console.log("Map theme changed:", newVal ? "dark" : "light");
  }
);

const updateTrafficEnabled = () => {
  const layer = trafficLayerRef.value;
  const map = mapObject.value;
  if (!layer || !map) return;

  /* const enabled = !props.isIndoorView && zoom.value >= 13.2; */
  const enabled = zoom.value >= 13.2;
  layer.setEnabled(enabled);
};

watch([/* () => props.isIndoorView, */ zoom], () => {
  updateTrafficEnabled();
});

watch(
  () => props.currentTime,
  (t) => {
    const layer = trafficLayerRef.value;
    if (!layer) return;

    const profile = getTrafficProfileByTime(t || new Date());

    // ต้องมีเมธอด setOptions ใน TrafficPolylineLayer (เดี๋ยวด้านล่างบอกให้เพิ่ม)
    layer.setOptions({
      vehicleCount: profile.vehicleCount,
      speedMin: profile.speedMin,
      speedMax: profile.speedMax,
    });
  },
  { deep: false }
);

// ✅ Load main road routes from GeoJSON
// ✅ Import OSM Utility
import { fetchRoadsFromOSM } from "../../utils/osmRoads";

// ✅ Load main road routes based on bounds
const loadMainRoadRoutes = async (bounds = null) => {
  try {
    const osmRoutes = await fetchRoadsFromOSM(bounds);
    if (osmRoutes && osmRoutes.length > 0) return osmRoutes;

    // Only fallback if initial load fails
    if (!bounds) {
      const res = await fetch("/data/chiangmai-main-roads-lanes.geojson");
      if (res.ok) {
        const data = await res.json();
        // Safer coordinate mapping
        return (data.features || [])
          .map((f) => {
            if (!f.geometry || !f.geometry.coordinates) return [];
            return f.geometry.coordinates.map((c) => [c[1], c[0]]);
          })
          .filter((r) => r && r.length > 1);
      }
    }
    return [];
  } catch (e) {
    console.warn("Road load error:", e);
    // Hardcoded fallback only on init
    if (!bounds) {
      return [
        [
          [18.7955, 98.9772],
          [18.7955, 98.9932],
          [18.7822, 98.9932],
          [18.7822, 98.9772],
          [18.7955, 98.9772],
        ],
      ];
    }
    return [];
  }
};

// ✅ Static Glow Routes
const mainRoadRoutes = ref([]);

// ✅ Handle Map Movement (Infinite Road Loading)
const handleMapMoveEnd = async () => {
  if (!mapObject.value) return;

  // Get current bounds
  const b = mapObject.value.getBounds();
  const bounds = {
    south: b.getSouth(),
    west: b.getWest(),
    north: b.getNorth(),
    east: b.getEast(),
  };

  // Fetch new roads for this area
  const newRoutes = await loadMainRoadRoutes(bounds);

  if (!isComponentMounted.value) return; // ✅ Guard against unmount during fetch

  if (newRoutes.length > 0) {
    // Append unique roads to Ref (for Glow)
    const currentStrings = new Set(
      mainRoadRoutes.value.map((r) => JSON.stringify(r))
    );
    const uniqueNew = newRoutes.filter(
      (r) => !currentStrings.has(JSON.stringify(r))
    );

    if (uniqueNew.length > 0) {
      mainRoadRoutes.value = [...mainRoadRoutes.value, ...uniqueNew];
      console.log(`🗺️ Loaded ${uniqueNew.length} new road segments.`);
    }
  }
};

const isComponentMounted = ref(false);

onMounted(async () => {
  isComponentMounted.value = true;
  try {
    const routes = await loadMainRoadRoutes();
    if (isComponentMounted.value) {
      mainRoadRoutes.value = routes;
      console.log("Road glow routes loaded:", routes.length);
    }
  } catch (e) {
    console.warn("Failed to load road glow:", e);
  }
});

onUnmounted(() => {
  isComponentMounted.value = false;
  mainRoadRoutes.value = []; // Clear routes to help cleanup
});

/** -----------------------------
 * ✅ Map ready / focus
 * ----------------------------- */
const onMapReady = async (mapInstance) => {
  if (!isComponentMounted.value) return;
  mapObject.value = mapInstance;
  console.log("Map ready, shops:", props.shops?.length || 0);

  mapObject.value.on("zoomend", () => {
    zoom.value = mapObject.value.getZoom();
  });

  // ✅ Physics Wobble Listeners & Dynamic Loading
  mapObject.value.on("movestart", () => {
    isMapMoving.value = true;
  });
  mapObject.value.on("moveend", () => {
    // ✅ Long delay to prevent API spam (429 errors) and allow smooth panning
    setTimeout(() => {
      if (!isComponentMounted.value) return;
      isMapMoving.value = false;
      handleMapMoveEnd(); // ✅ Fetch new roads
    }, 1000);
  });

  // ✅ Random Atmosphere cycle (optional)
  const rainInterval = setInterval(() => {
    if (!isComponentMounted.value) {
      clearInterval(rainInterval);
      return;
    }
    // 30% chance of rain every 5 mins
    isRaining.value = Math.random() > 0.7;
  }, 300000);
};

const focusLocation = (latlng, targetZoom = 17, manualYOffset = null) => {
  const map = mapObject.value;
  if (!latlng || !map) return;

  const currentZoom = map.getZoom();
  const center = map.getCenter();
  const dist = map.distance(center, latlng); // Distance in meters? Leaflet uses meters.
  // Actually, let's use pixel distance for decision or just check zoom match.

  // ✅ Calculate target point in "visual center" logic
  // yOffset adjusts for the top/bottom UI bars (Search vs Carousel)
  // Default: Center in the *visible* space between top and bottom bars
  let yOffset = (props.uiTopOffset - props.uiBottomOffset) / 2;

  // If manual override is provided, use it explicitly (ignoring UI)
  if (manualYOffset !== null && manualYOffset !== undefined) {
    yOffset = manualYOffset;
  }

  const targetPoint = map.project(latlng, targetZoom);
  const targetPointWithOffset = targetPoint.subtract([0, yOffset]);
  const finalLatLng = map.unproject(targetPointWithOffset, targetZoom);

  // ✅ Smart Move:
  // If target zoom is same as current AND distance is reasonable, use panTo (Smoother, no zoom effect)
  // If zoom needs change, use flyTo (Cinematic)

  if (currentZoom === targetZoom) {
    map.panTo(finalLatLng, {
      animate: true,
      duration: 1.0, // Smooth slide
      easeLinearity: 0.25,
      noMoveStart: true,
    });
  } else {
    map.flyTo(finalLatLng, targetZoom, {
      animate: true,
      duration: 1.5, // Slower for elegance
      easeLinearity: 0.2,
      noMoveStart: true,
    });
  }
};

const centerOnUser = () => {
  // ✅ Exit Indoor Mode logic REMOVED
  if (props.userLocation) focusLocation(props.userLocation, 17);
};

/** -----------------------------
 * ✅ Shops filter: indoor -> only building + floor
 * ----------------------------- */
const activeBuildingKey = computed(() => {
  if (!props.activeBuilding) return null;
  return (
    props.activeBuilding.key ||
    props.activeBuilding.id ||
    props.activeBuilding.name ||
    null
  );
});

const normalize = (v) => (v == null ? "" : String(v).trim().toLowerCase());

const isShopInActiveBuilding = (shop) => {
  if (!props.activeBuilding) return false;

  const shopB = normalize(shop.Building);
  const bKey = normalize(activeBuildingKey.value);
  const bName = normalize(props.activeBuilding?.name);

  // ถ้าไม่มี key ชัด ๆ ก็ถือว่า "มี Building" คืออยู่ในตึก
  if (!bKey && !bName) return !!shop.Building;

  return shopB === bKey || shopB === bName;
};

// isShopOnActiveFloor REMOVED

const displayMarkers = computed(() => {
  // ✅ Indoor Mode Check REMOVED
  let list = props.shops || [];

  // Filter by Category (if active)
  if (activeCategory.value !== "All") {
    list = list.filter((item) => {
      const cat = (item.Category || item.category || "").toLowerCase();
      const target = activeCategory.value.toLowerCase();
      // Match partial (e.g. 'Bar' matches 'Bar/Nightlife')
      return cat.includes(target);
    });
  }

  return list;
});

// ✅ STABLE RENDERING - All markers use DOM for reliability
// Hybrid Canvas was removed due to Vue-Leaflet lifecycle issues
const richMarkers = computed(() => {
  return displayMarkers.value; // All markers use DOM rendering
});

// Lite Markers disabled - was causing '_leaflet_id undefined' errors
const liteMarkers = computed(() => {
  return []; // Disabled for stability
});

// ✅ Category Filters Logic
const activeCategory = ref("All");
const isFilterOpen = ref(false); // Dropdown state
const availableCategories = [
  { label: "All", icon: "🏠" },
  { label: "Cafe", icon: "☕" },
  { label: "Food", icon: "🍽️" },
  { label: "Nightlife", icon: "🍺" },
  { label: "Fashion", icon: "👗" },
  { label: "Art", icon: "🎨" },
];

const setCategory = (catLabel) => {
  activeCategory.value = catLabel;
  isFilterOpen.value = false;
};

// ✅ Custom Zoom Logic
const zoomIn = () => {
  if (zoom.value < 18) zoom.value += 1;
};
const zoomOut = () => {
  if (zoom.value > 10) zoom.value -= 1;
};

// ✅ REDUCED PARTICLES FOR PERFORMANCE
const fireflyPositions = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${(i * 10 + 5) % 100}%`,
  top: `${(i * 13 + 10) % 100}%`,
  delay: `${(i * 0.8) % 8}s`,
  duration: `${4 + (i % 4)}s`,
}));

const leafPositions = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  left: `${(i * 9 + 3) % 100}%`,
  delay: `${(i * 1.2) % 10}s`,
  duration: `${8 + (i % 6)}s`,
}));

// ✅ NEW: Clouds & Rain particle generation
const clouds = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  width: `${250 + Math.random() * 300}px`,
  height: `${150 + Math.random() * 200}px`,
  top: `${Math.random() * 80}%`,
  left: `${Math.random() * 100}%`,
  delay: `${Math.random() * 20}s`,
  duration: `${40 + Math.random() * 60}s`,
}));

const raindrops = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  delay: `${Math.random() * 2}s`,
  duration: `${0.6 + Math.random() * 0.4}s`,
}));

// ✅ Star Twinkle Effect
const starPositions = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  delay: `${Math.random() * 8}s`,
  duration: `${3 + Math.random() * 4}s`,
}));

// ✅ ทำ index ต่อ floor เพื่อ fallback zoneNo ให้ stable ภายในชั้น
const indoorIndexMap = computed(() => {
  if (!props.isIndoorView) return new Map();
  const m = new Map();

  const list = displayMarkers.value || [];
  // เรียงให้คงที่ (ตามชื่อ) จะได้ zone fallback ไม่แกว่ง
  const sorted = [...list].sort((a, b) =>
    String(a.Name || a.name).localeCompare(String(b.Name || b.name))
  );

  sorted.forEach((s, i) => {
    m.set(s.id, i);
  });

  return m;
});

/** -----------------------------
 * ✅ Marker states
 * ----------------------------- */
const handleMarkerClick = (item) => {
  if (!item) return;

  // ✅ Confetti Explosion for LIVE items
  if (item.status === "LIVE") {
    triggerConfetti();
  }

  // ✅ toggle open/close
  if (String(item.id) === String(props.highlightedShopId)) {
    emit("select-shop", null);
  } else {
    emit("select-shop", item);
  }

  bounceTick.value++;
};

const isHighlighted = (item) => item.id === props.highlightedShopId;
const isLive = (item) => item.status === "LIVE";

// ✅ Handle map click (deselect shop)
const handleMapClick = () => {
  emit("select-shop", null);
};

// ✅ Confetti Explosion Function
const confettiColors = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];
const triggerConfetti = () => {
  const particles = [];
  for (let i = 0; i < 30; i++) {
    const angle = (Math.PI * 2 * i) / 30;
    const distance = 80 + Math.random() * 60;
    particles.push({
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 50,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      delay: Math.random() * 0.15,
    });
  }
  confettiParticles.value = particles;
  setTimeout(() => {
    confettiParticles.value = [];
  }, 1200);
};

const isInActiveProvince = (item) => {
  if (!props.activeProvince) return true;
  return item.Province === props.activeProvince;
};

const isInActiveZone = (item) => {
  if (!props.activeZone) return true;
  return item.Zone === props.activeZone;
};

const shouldDimMarker = (item) => {
  // if (props.isIndoorView) return false; (REMOVED)
  if (props.activeProvince && !isInActiveProvince(item)) return true;
  if (props.activeZone && !isInActiveZone(item)) return true;
  return false;
};

const getMarkerOpacity = (item) => {
  // Highlighted (clicked) marker always fully visible
  if (isHighlighted(item)) return 1;

  // Indoor mode logic REMOVED
  // if (props.isIndoorView) return 1;

  const z = zoom.value;

  // ✅ GLOBAL ZOOM OVERRIDE:
  // If zoomed OUT (<= 15), show EVERYTHING clearly. (Adjusted to 15 per user request)
  // This ensures user sees all markers clearly without needing to zoom out extremely far.
  if (z <= 15) return 1;

  // Province/Zone dim takes priority (only at very high zoom 16+)
  if (shouldDimMarker(item)) return 0.15;

  // ✅ Calculate base distance opacity (if location available)
  let baseOpacity = 1;
  if (props.userLocation && item?.distance !== undefined) {
    if (item.distance > 5) {
      baseOpacity = 0.35; // Very far = dim
    } else if (item.distance > 3) {
      baseOpacity = 0.55; // Far = slightly dim
    }
  }

  // ✅ ZOOM-BASED RECOVERY: (Only needed if we went deeper than 15, but logic holds)
  // Since we return 1 for <= 15, this part only affects z > 15
  return baseOpacity;
};

const getMarkerScale = (item) => {
  // if (props.isIndoorView) return 1; (REMOVED)
  if (!props.activeProvince && !props.activeZone) return 1;
  return shouldDimMarker(item) ? 0.62 : 1;
};

const getMarkerTranslateY = (item) => {
  // if (props.isIndoorView) return 0; (REMOVED)
  if (!props.activeProvince && !props.activeZone) return 0;
  return shouldDimMarker(item) ? 10 : 0;
};

const getMarkerStyle = (item) => {
  const s = getMarkerScale(item);
  const y = getMarkerTranslateY(item);
  return `transform: translateY(${y}px) scale(${s})`;
};

const getMarkerTransform = (item) => {
  const s = getMarkerScale(item);
  const y = getMarkerTranslateY(item);
  return `translateY(${y}px) scale(${s})`;
};

/** -----------------------------
 * ✅ Giant Pin (Building Markers)
 * ----------------------------- */
const handleBuildingClick = (key, building) => {
  // Emit event to open Mall Drawer (via activeBuilding in App.vue)
  const buildingWithKey = { ...building, key: key };
  emit("open-building", buildingWithKey);

  // Also focus the map on the building
  if (building.lat && building.lng) {
    focusLocation([building.lat, building.lng], 16, 120); // offset to show drawer
  }
};

const getBuildingIconSize = (key) => {
  const isActive = props.activeBuilding && props.activeBuilding.key === key;
  return isActive ? [60, 60] : [50, 50]; // Giant size
};

const getBuildingZIndex = (key) => {
  const isActive = props.activeBuilding && props.activeBuilding.key === key;
  return isActive ? 1000 : 900; // Above normal shops
};

/** -----------------------------
 * ✅ Province mask polygon with HIGH-RESOLUTION boundary
 * ----------------------------- */
const hiResChiangMaiBoundary = ref(null);

// Load high-resolution Chiang Mai boundary on mount (already in [lat, lng] Leaflet format)
onMounted(async () => {
  try {
    const response = await fetch("/data/chiang-mai-leaflet.json");
    const leafletCoords = await response.json();
    // Already in [lat, lng] format - use directly
    hiResChiangMaiBoundary.value = leafletCoords;
    console.log(
      "✅ Loaded high-res Chiang Mai boundary:",
      hiResChiangMaiBoundary.value.length,
      "points"
    );
  } catch (e) {
    console.warn("Could not load hi-res boundary, using fallback");
  }
});

const provinceMaskPolygon = computed(() => {
  // ✅ Show mask when zoomed out (< 14) - always visible on base map
  // if (props.isIndoorView) return null; (REMOVED)

  const outerRing = [
    [25, 90],
    [25, 110],
    [5, 110],
    [5, 90],
  ];

  // Use high-res boundary if loaded, otherwise fallback
  const chiangMaiHole = hiResChiangMaiBoundary.value || [
    [19.95, 97.95],
    [20.1, 97.98],
    [20.2, 98.05],
    [20.35, 98.15],
    [20.45, 98.3],
    [20.48, 98.45],
    [20.45, 98.6],
    [20.4, 98.75],
    [20.35, 98.9],
    [20.25, 99.05],
    [20.12, 99.2],
    [19.98, 99.35],
    [19.85, 99.5],
    [19.7, 99.65],
    [19.55, 99.8],
    [19.42, 99.92],
    [19.28, 100.0],
    [19.15, 100.08],
    [19.02, 100.12],
    [18.88, 100.15],
    [18.75, 100.12],
    [18.62, 100.05],
    [18.5, 99.95],
    [18.4, 99.82],
    [18.32, 99.68],
    [18.25, 99.52],
    [18.18, 99.35],
    [18.12, 99.18],
    [18.08, 99.0],
    [18.05, 98.82],
    [18.03, 98.65],
    [18.02, 98.48],
    [18.05, 98.32],
    [18.1, 98.18],
    [18.18, 98.05],
    [18.28, 97.92],
    [18.4, 97.82],
    [18.52, 97.75],
    [18.65, 97.7],
    [18.78, 97.68],
    [18.92, 97.7],
    [19.05, 97.72],
    [19.18, 97.75],
    [19.32, 97.78],
    [19.45, 97.82],
    [19.58, 97.85],
    [19.7, 97.88],
    [19.82, 97.9],
    [19.95, 97.95],
  ];

  return [outerRing, chiangMaiHole];
});

const provinceMaskOptions = computed(() => {
  // ✅ Fade in mask when zoomed out (below zoom 13)
  // Zoom 15+ = 0 opacity, Zoom 11- = 0.85 opacity
  const zoomFactor = Math.max(0, Math.min(1, (14 - zoom.value) / 3));
  const baseOpacity = 0.85 * zoomFactor;

  return {
    color: "transparent",
    fillColor: props.isDarkMode ? "#09090b" : "#1f2937",
    fillOpacity: baseOpacity,
    stroke: false,
    interactive: false,
    className: "province-mask-blur",
  };
});

// Empty - gradient rings removed

/** -----------------------------
 * ✅ Floorplan bounds (same logic)
 * ----------------------------- */
const floorPlanBounds = computed(() => {
  if (!props.activeBuilding) return null;
  const { lat, lng } = props.activeBuilding;

  const z = zoom.value;
  const base = 0.014;
  const shrink = (z - 15) * 0.0016;
  const scale = Math.max(0.006, base - shrink);

  return [
    [lat - scale, lng - scale],
    [lat + scale, lng + scale],
  ];
});

// Indoor POI logic REMOVED
const isPoiHighlighted = () => false;

/** -----------------------------
 * ✅ Keep legacy detail open (same as your old system)
 * ----------------------------- */
const shopsRef = computed(() => props.shops);

onMounted(() => {
  window.openVibeDetail = (shopId) => {
    const shop = shopsRef.value?.find((s) => s.id === shopId);
    if (shop)
      window.dispatchEvent(
        new CustomEvent("vibe-open-detail", { detail: shop })
      );
  };
});

onUnmounted(() => {
  delete window.openVibeDetail;

  if (trafficLayerRef.value && mapObject.value) {
    try {
      trafficLayerRef.value.removeFrom(mapObject.value);
    } catch {}
  }
});

// ✅ Check if shop has an upcoming event within 1 hour (for blue glow popup)
const hasUpcomingEvent = (item) => {
  if (!item?.EventDateTime || !item?.EventName) return false;

  try {
    const eventTime = new Date(item.EventDateTime);
    const now = new Date();
    const diffMs = eventTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Within 1 hour before event start
    return diffHours > 0 && diffHours <= 1;
  } catch {
    return false;
  }
};

// ✅ Smart Content Switching: Determines if marker shows Detail or Dot
// ✅ Smart Content Switching: Determines if marker shows Detail or Dot
const isDetailsVisible = (item) => {
  if (isHighlighted(item) || isLive(item)) return true; // Important markers always detailed
  if (item.distance && item.distance <= 2.0) return true; // Nearby < 2km detailed
  return false; // Distant & Inactive -> Dot
};

// ✅ Dynamic Locate Button Position
// ✅ Dynamic Locate Button Position
const locateButtonBottom = computed(() => {
  if (props.isSidebarOpen) return "80px";
  return "80px";
});

defineExpose({ focusLocation, centerOnUser, mapObject });
</script>

<template>
  <div
    :class="[
      'relative w-full h-full z-0 transition-colors duration-500',
      isDarkMode ? 'bg-[#09090b]' : 'bg-gray-200',
    ]"
    style="content-visibility: auto"
  >
    <l-map
      v-model:zoom="zoom"
      v-model:center="center"
      :use-global-leaflet="false"
      :options="{
        zoomControl: false,
        attributionControl: false,
        maxBounds: chiangMaiBounds,
        maxBoundsViscosity: 1.0,
      }"
      @ready="onMapReady"
      @click="handleMapClick"
      class="z-0"
    >
      <!-- Category Filter is now in App.vue - removed duplicate here -->

      <!-- Zoom Controls Removed -->
      <!-- Base tiles (fade out as indoorBlend increases) -->
      <l-tile-layer
        :url="tileLayerUrl"
        layer-type="base"
        :opacity="baseOpacity"
        :key="tileLayerUrl"
      />

      <!-- ✅ Static Road Glow (Blue Veins) -->
      <!-- ✅ Static Road Glow (Blue Veins) - RGB Animated via CSS -->
      <l-polyline
        v-for="(route, i) in mainRoadRoutes"
        :key="`road-${i}`"
        :lat-lngs="route"
        color="#3b82f6"
        :weight="3"
        :opacity="0.4"
        class-name="road-glow"
      />

      <!-- ✅ Visual effects moved outside l-map for proper rendering -->

      <!-- Floorplan overlay REMOVED -->

      <template v-for="b in buildings" :key="b.key">
        <l-marker
          :lat-lng="[b.lat, b.lng]"
          :z-index-offset="getBuildingZIndex(b.key)"
          @click="handleBuildingClick(b.key, b)"
        >
          <l-icon
            :icon-size="getBuildingIconSize(b.key)"
            :icon-anchor="[25, 50]"
            class-name="giant-pin-marker"
          >
            <div
              class="relative w-full h-full drop-shadow-2xl transition-transform duration-300 hover:scale-110"
              :class="isMapMoving ? 'is-wobbling' : ''"
            >
              <!-- Ripple Effect for All Giant Pins/Buildings -->
              <div class="ripple-effect"></div>

              <!-- Glowing Base -->
              <div
                class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-2 bg-black/40 blur-sm rounded-full"
              ></div>

              <!-- Icon Image -->
              <img
                src="/images/pins/pin-red.svg"
                class="w-full h-full object-contain filter drop-shadow-lg"
                alt="Mall"
                @error="
                  (e) =>
                    (e.target.src =
                      'https://cdn-icons-png.flaticon.com/512/3721/3721703.png')
                "
              />

              <!-- Live Badge (Optional if Mall has event) -->
              <div
                v-if="b.status === 'LIVE'"
                class="absolute -top-2 -right-2 px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-bold rounded-full shadow-md animate-bounce"
              >
                LIVE
              </div>
            </div>
          </l-icon>
        </l-marker>
      </template>

      <!-- ✅ ATMOSPHERE LAYERS (Between Tile & Markers) -->
      <div v-if="showClouds" class="clouds-container">
        <div
          v-for="c in clouds"
          :key="c.id"
          class="cloud-particle"
          :style="{
            width: c.width,
            height: c.height,
            top: c.top,
            left: c.left,
            animationDelay: c.delay,
            animationDuration: c.duration,
          }"
        ></div>
      </div>

      <div v-if="isRaining" class="rain-container">
        <div
          v-for="r in raindrops"
          :key="r.id"
          class="rain-drop"
          :style="{
            left: r.left,
            top: r.top,
            animationDelay: r.delay,
            animationDuration: r.duration,
          }"
        ></div>
      </div>

      <!-- ✅ Ambient Lighting Overlay (Dynamic based on time) -->
      <div
        class="ambient-overlay absolute inset-0 pointer-events-none z-[350]"
        :style="{
          backgroundColor: isDarkMode
            ? 'rgba(15, 23, 42, 0.4)'
            : 'rgba(255, 247, 237, 0.15)',
          mixBlendMode: isDarkMode ? 'multiply' : 'soft-light',
        }"
      ></div>

      <!-- Province mask (hide during indoor) -->
      <l-polygon
        v-if="provinceMaskPolygon"
        :lat-lngs="provinceMaskPolygon"
        :color="provinceMaskOptions.color"
        :fill-color="provinceMaskOptions.fillColor"
        :fill-opacity="provinceMaskOptions.fillOpacity"
        :stroke="provinceMaskOptions.stroke"
        :interactive="provinceMaskOptions.interactive"
        :class-name="provinceMaskOptions.className"
        :opacity="1"
      />

      <!-- ✅ INDOOR POI MARKERS REMOVED -->

      <!-- ✅ Markers Pane (Above Map) -->
      <template v-for="item in richMarkers" :key="item.id">
        <l-marker
          :lat-lng="[item.lat, item.lng]"
          @click="handleMarkerClick(item)"
          :z-index-offset="
            isHighlighted(item)
              ? 1000
              : (isLive(item) ? 120 : 60) - (shouldDimMarker(item) ? 40 : 0)
          "
        >
          <l-icon class-name="vibe-marker-icon" :icon-anchor="[60, 160]">
            <div
              :class="[
                'marker-container relative flex flex-col items-center cursor-pointer transition-all duration-300',
                isLive(item) && !isHighlighted(item)
                  ? 'marker-live-glow-subtle'
                  : '',
                shouldDimMarker(item) ? 'province-dimmed' : '',
                isMapMoving ? 'is-wobbling' : '',
              ]"
              :style="{
                opacity: getMarkerOpacity(item),
                transform: getMarkerTransform(item),
              }"
            >
              <!-- Ripple Effect for Giant Pins (Events) Only -->
              <div v-if="item.isEvent" class="ripple-effect"></div>
              <!-- 1. FULL CARD MODE (Nearby / Live / Highlighted) -->
              <template v-if="isDetailsVisible(item)">
                <!-- ✅ MINI-POPUP: Name + Distance Only (Simple Label) -->
                <transition name="label-pop">
                  <div
                    v-if="isDetailsVisible(item) && !isHighlighted(item)"
                    class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                  >
                    <!-- Simple Label -->
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-lg shadow-xl border whitespace-nowrap"
                      :class="[
                        isDarkMode
                          ? 'bg-zinc-900/80 border-white/10 text-white'
                          : 'bg-white/90 border-gray-200 text-gray-900',
                        isLive(item)
                          ? 'ring-2 ring-blue-500/50 shadow-blue-500/20'
                          : '',
                      ]"
                    >
                      <span
                        v-if="isLive(item)"
                        class="w-2 h-2 rounded-full bg-red-500 animate-pulse"
                      ></span>
                      <span class="text-[11px] font-bold">{{ item.name }}</span>
                      <span
                        v-if="item.distance !== undefined"
                        class="text-[10px] opacity-60"
                      >
                        {{ item.distance.toFixed(1) }}km
                      </span>
                    </div>
                    <!-- Triangle -->
                    <div
                      class="w-2 h-2 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2"
                      :class="isDarkMode ? 'bg-zinc-900/80' : 'bg-white/90'"
                    ></div>
                  </div>
                </transition>

                <!-- ✅ BIG POPUP: Full Details (Above Mini Popup, On Marker Click) -->
                <transition name="label-pop">
                  <div
                    v-if="isHighlighted(item)"
                    class="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-[100] w-[220px]"
                    @click.stop
                  >
                    <div
                      class="rounded-xl shadow-2xl border overflow-hidden backdrop-blur-xl"
                      :class="
                        isDarkMode
                          ? 'bg-zinc-900/95 border-white/10'
                          : 'bg-white/95 border-gray-200'
                      "
                    >
                      <!-- Header with Image/Gradient -->
                      <div
                        class="h-32 w-full relative bg-gradient-to-br from-purple-700 via-pink-600 to-red-600 flex items-center justify-center"
                      >
                        <img
                          v-if="item.Image_URL1"
                          :src="item.Image_URL1"
                          class="absolute inset-0 w-full h-full object-cover opacity-70"
                        />
                        <div
                          class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
                        ></div>

                        <!-- LIVE Badge -->
                        <div
                          v-if="isLive(item)"
                          class="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-600 text-white text-[9px] font-bold animate-pulse"
                        >
                          🔴 LIVE
                        </div>

                        <!-- Close Button -->
                        <button
                          @click.stop="$emit('select-shop', null)"
                          class="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 text-white/90 flex items-center justify-center text-xs hover:bg-black/60"
                        >
                          ✕
                        </button>
                      </div>

                      <!-- Content -->
                      <div class="p-3">
                        <div class="flex items-start justify-between mb-1">
                          <h3
                            :class="[
                              'text-sm font-bold leading-tight',
                              isDarkMode ? 'text-white' : 'text-gray-900',
                            ]"
                          >
                            {{ item.name }}
                          </h3>
                          <span
                            v-if="item.distance !== undefined"
                            class="text-[10px] font-mono opacity-70 whitespace-nowrap ml-2"
                          >
                            📍 {{ item.distance.toFixed(1) }} km
                          </span>
                        </div>

                        <!-- Category + Hours -->
                        <div
                          class="flex items-center gap-1 text-[10px] opacity-60 mb-2"
                        >
                          <span>{{ item.category || "Bar" }}</span>
                          <span v-if="item.openTime"
                            >• {{ item.openTime }} - {{ item.closeTime }}</span
                          >
                        </div>

                        <!-- ✅ Vibe Info (Modal Style) -->
                        <div
                          v-if="item.Vibe_Info"
                          class="mb-2 p-2 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20"
                        >
                          <p
                            :class="[
                              'text-[10px] italic leading-relaxed text-center',
                              isDarkMode
                                ? 'text-purple-200'
                                : 'text-purple-700',
                            ]"
                          >
                            "{{ item.Vibe_Info }}"
                          </p>
                        </div>

                        <!-- ✅ Tags: Crowd + Zone -->
                        <div class="flex flex-wrap gap-1 mb-3">
                          <span
                            v-if="item.Crowd_Info"
                            class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                            :class="
                              isDarkMode
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-blue-100 text-blue-700'
                            "
                          >
                            👥 {{ item.Crowd_Info }}
                          </span>
                          <span
                            v-if="item.Zone"
                            class="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
                            :class="
                              isDarkMode
                                ? 'bg-gray-500/20 text-gray-300'
                                : 'bg-gray-100 text-gray-600'
                            "
                          >
                            📍 {{ item.Zone }}
                          </span>
                        </div>

                        <!-- Action Buttons (Navigate + Ride) -->
                        <div class="grid grid-cols-2 gap-2 mt-2">
                          <a
                            :href="`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`"
                            target="_blank"
                            @click.stop
                            class="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold bg-black hover:bg-zinc-800 text-white transition-all"
                          >
                            นำทาง
                          </a>
                          <button
                            @click.stop="$emit('open-ride-modal', item)"
                            class="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-green-600 to-emerald-500 text-white transition-all active:scale-95"
                          >
                            เรียกรถ
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Triangle Pointer -->
                    <div
                      class="w-3 h-3 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2 shadow-lg"
                      :class="isDarkMode ? 'bg-zinc-900/95' : 'bg-white/95'"
                    ></div>
                  </div>
                </transition>
              </template>

              <!-- 2. DOT MODE (Distant & Inactive) - Ultra Light DOM -->
              <template v-else>
                <div
                  class="w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all hover:scale-150"
                  :class="[
                    item.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400',
                  ]"
                ></div>
              </template>

              <!-- Pin with LIVE-only Glow -->
              <svg
                viewBox="0 0 24 36"
                :class="[
                  'drop-shadow-lg',
                  isHighlighted(item) ? 'w-8 h-10 pin-bounce-once' : 'w-5 h-6',
                  isLive(item) ? 'live-pin-glow' : '',
                ]"
              >
                <path
                  d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z"
                  :class="[
                    isHighlighted(item)
                      ? 'fill-blue-500'
                      : isLive(item)
                      ? 'fill-red-500'
                      : item.status === 'TONIGHT'
                      ? 'fill-orange-500'
                      : 'fill-zinc-500',
                  ]"
                />
                <circle
                  cx="12"
                  cy="11"
                  :r="isHighlighted(item) ? 4 : 3"
                  class="fill-white/90"
                />
              </svg>
            </div>
          </l-icon>
        </l-marker>
      </template>

      <!-- Lite Markers (Canvas - distant, not live) -->
      <l-circle-marker
        v-for="item in liteMarkers"
        :key="`lite-${item.id}`"
        :lat-lng="[item.lat, item.lng]"
        :radius="6"
        :color="item.status === 'TONIGHT' ? '#F97316' : '#71717A'"
        :weight="1.5"
        :fill-opacity="0.6"
        :fill-color="item.status === 'TONIGHT' ? '#F97316' : '#A1A1AA'"
        @click="handleMarkerClick(item)"
      />

      <!-- ✅ Holographic Beams (Holo-Markers) -->
      <l-marker
        v-for="beam in landmarkBeams"
        :key="`beam-${beam.id}`"
        :lat-lng="[beam.lat, beam.lng]"
        :z-index-offset="-500"
      >
        <l-icon
          :icon-size="[24, 200]"
          :icon-anchor="[12, 190]"
          class-name="vibe-marker-icon"
        >
          <div
            class="holo-beam"
            :style="{ '--beam-color': beam.color, height: beam.height }"
          ></div>
        </l-icon>
      </l-marker>

      <!-- ✅ Sonar Pulse (Heartbeat) at Moat Center -->
      <l-marker :lat-lng="[18.7883, 98.9853]" :z-index-offset="-1000">
        <l-icon
          :icon-size="[300, 300]"
          :icon-anchor="[150, 150]"
          class-name="vibe-marker-icon"
        >
          <div class="sonar-pulse-container" style="--pulse-color: #3b82f6">
            <div class="sonar-wave"></div>
            <div class="sonar-wave"></div>
            <div class="sonar-wave"></div>
          </div>
        </l-icon>
      </l-marker>

      <!-- User location -->
      <l-circle-marker
        v-if="userLocation"
        :lat-lng="userLocation"
        :radius="8"
        color="white"
        :weight="2"
        :fill-opacity="1"
        fill-color="#3B82F6"
        pane="popupPane"
      />
    </l-map>

    <!-- ✅ Entertainment Atmosphere Effects (Outside l-map for proper rendering) -->
    <div class="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
      <!-- Gradient Vignette -->
      <div class="gradient-vignette"></div>

      <!-- Spotlights -->
      <div class="spotlight-container">
        <div class="spotlight s1"></div>
        <div class="spotlight s2"></div>
        <div class="spotlight s3"></div>
      </div>

      <!-- Star Twinkle -->
      <div class="star-field">
        <div
          v-for="star in starPositions"
          :key="`star-${star.id}`"
          class="star"
          :style="{
            left: star.left,
            top: star.top,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }"
        ></div>
      </div>
    </div>

    <!-- ✅ Firefly / Floating Particles Effect -->
    <div class="absolute inset-0 z-[1502] pointer-events-none overflow-hidden">
      <div
        v-for="ff in fireflyPositions"
        :key="`firefly-${ff.id}`"
        class="firefly"
        :style="{
          left: ff.left,
          top: ff.top,
          animationDelay: ff.delay,
          animationDuration: ff.duration,
        }"
      ></div>
    </div>

    <!-- ✅ Confetti Explosion Effect -->
    <div v-if="confettiParticles.length" class="confetti-container">
      <div
        v-for="p in confettiParticles"
        :key="`confetti-${p.id}`"
        class="confetti-particle"
        :style="{
          left: '50%',
          top: '40%',
          backgroundColor: p.color,
          '--x': `${p.x}px`,
          '--y': `${p.y}px`,
          animationDelay: `${p.delay}s`,
        }"
      ></div>
    </div>
  </div>
</template>

<style>
.vibe-marker-icon {
  background: transparent !important;
  border: none !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  overflow: visible !important;
}

.leaflet-container {
  height: 100% !important;
  width: 100% !important;
  background-color: inherit !important;
}

/* Active marker */
.marker-active {
  z-index: 9999 !important;
}

/* ✅ Performance Optimization */
.leaflet-marker-icon {
  will-change: transform;
}
.leaflet-map-pane {
  will-change: transform;
}

/* Label pop */
.label-pop-enter-active {
  animation: label-pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.label-pop-leave-active {
  animation: label-pop-out 0.2s ease-in;
}
@keyframes label-pop-in {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
@keyframes label-pop-out {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.8) translateY(5px);
  }
}

/* Fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Highlight glow */
.marker-highlighted {
  filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.7));
}

/* Hover */
.vibe-marker-icon svg {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.vibe-marker-icon:hover svg {
  transform: scale(1.06) translateY(-2px);
}

/* Bounce once */
.pin-bounce-once {
  animation: pin-bounce-once 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 1 both;
  transform-origin: 50% 100%;
  will-change: transform;
}
@keyframes pin-bounce-once {
  0% {
    transform: translateY(0) scale(1);
  }
  40% {
    transform: translateY(-10px) scale(1.06);
  }
  70% {
    transform: translateY(0) scale(0.98);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

/* ✅ ENTERTAINMENT MAP - LIVE Glow Effects */

/* LIVE Popup - Blue Glow */
.live-popup-blue-glow {
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.4);
  animation: livePopupBlue 2s ease-in-out infinite;
}

@keyframes livePopupBlue {
  0%,
  100% {
    box-shadow: 0 0 6px rgba(59, 130, 246, 0.5),
      0 0 12px rgba(59, 130, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.8),
      0 0 24px rgba(59, 130, 246, 0.5);
  }
}

/* LIVE Pin - Red Glow (30% opacity) */
.marker-live-glow-subtle {
  filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.3))
    drop-shadow(0 0 16px rgba(239, 68, 68, 0.15));
}

.marker-live-glow {
  filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.8))
    drop-shadow(0 0 20px rgba(239, 68, 68, 0.4));
}

.live-pin-glow {
  filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.4))
    drop-shadow(0 0 12px rgba(239, 68, 68, 0.2));
}

/* LIVE pulse animations - stable CSS animations */
.live-pulse-dot {
  animation: liveDotPulse 1.5s ease-in-out infinite;
}

.live-pulse-badge {
  animation: liveBadgePulse 1.5s ease-in-out infinite;
}

@keyframes liveDotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.2);
  }
}

@keyframes liveBadgePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4);
  }
  50% {
    box-shadow: 0 0 8px 2px rgba(239, 68, 68, 0.6);
  }
}

/* ✅ Event Blue Glow Effect (for popups) */
.event-glow {
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.5), 0 0 16px rgba(59, 130, 246, 0.3);
}

.event-popup-glow {
  animation: eventPopupGlow 2s ease-in-out infinite;
}

@keyframes eventPopupGlow {
  0%,
  100% {
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.4), 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  50% {
    box-shadow: 0 0 25px rgba(59, 130, 246, 0.8),
      0 4px 30px rgba(59, 130, 246, 0.4);
  }
}

/* ✅ Firefly / Floating Particles */
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
  box-shadow: 0 0 8px rgba(255, 220, 100, 0.7), 0 0 15px rgba(255, 200, 50, 0.4);
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

/* Dim */
.province-dimmed {
  filter: saturate(0.55) brightness(0.85);
  will-change: transform, opacity, filter;
}
.marker-container {
  will-change: transform, opacity;
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

/* LIVE soft pulse */
.marker-soft-pulse::before {
  content: "";
  position: absolute;
  top: 52%;
  left: 50%;
  width: 54px;
  height: 54px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 70%
  );
  border-radius: 50%;
  animation: soft-pulse 2.6s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}
@keyframes soft-pulse {
  0%,
  100% {
    opacity: 0.1;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.18;
    transform: translate(-50%, -50%) scale(1.18);
  }
}

/* Active glow */
.marker-active-glow::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80px;
  height: 80px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(59, 130, 246, 0.4) 0%,
    transparent 70%
  );
  border-radius: 50%;
  animation: active-glow-pulse 1.5s ease-in-out infinite;
  pointer-events: none;
  z-index: -1;
}
@keyframes active-glow-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.7;
    transform: translate(-50%, -50%) scale(1.2);
  }
}

/* ✅ Indoor POI minimal style */
.poi-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.2s ease;
}
.poi-wrap:hover {
  transform: scale(1.1);
}
.poi-dot {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  border: 2.5px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 20px var(--poi-glow-color, rgba(59, 130, 246, 0.4)),
    0 8px 16px rgba(0, 0, 0, 0.25);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateZ(0);
  transition: all 0.25s ease;
  /* Removed poiEnter animation to prevent reset on pan/zoom */
}
.poi-dot:hover {
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 0 30px var(--poi-glow-color, rgba(59, 130, 246, 0.6)),
    0 10px 20px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
}
@keyframes poiEnter {
  0% {
    opacity: 0;
    transform: scale(0.3) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
.poi-icon {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: transform 0.2s ease;
}
.poi-dot:hover .poi-icon {
  transform: scale(1.1);
}
.poi-emoji {
  font-size: 13px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}
.poi-no {
  position: absolute;
  right: -8px;
  top: -8px;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.95),
    rgba(139, 92, 246, 0.95)
  );
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.9);
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}
.poi-dot-active {
  outline: 3px solid rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 0 12px rgba(59, 130, 246, 0.15),
    0 0 40px rgba(59, 130, 246, 0.4), 0 12px 26px rgba(0, 0, 0, 0.35);
  animation: poiPulse 1.5s ease-in-out infinite;
}
@keyframes poiPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}
.poi-label {
  padding: 5px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  animation: labelFadeIn 0.3s ease-out 0.2s backwards;
}
@keyframes labelFadeIn {
  0% {
    opacity: 0;
    transform: translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}
.poi-label-dark {
  background: linear-gradient(
    135deg,
    rgba(24, 24, 27, 0.95),
    rgba(39, 39, 42, 0.95)
  );
  color: rgba(255, 255, 255, 0.9);
}
.poi-label-light {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.98),
    rgba(249, 250, 251, 0.98)
  );
  color: rgba(24, 24, 27, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* ✅ Province Mask - Sharp Edge */
.feathered-mask {
  transition: opacity 0.5s ease-in-out; /* Smooth fade in/out */
  pointer-events: none; /* Let clicks pass through to map below */
}

/* ✅ ALIVE MAP EFFECTS */

/* 1. Moving Clouds - Individual cloud elements */
.cloud-layer {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.cloud {
  position: absolute;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  filter: blur(40px);
  animation: cloudFloat linear infinite;
}

.cloud-1 {
  width: 300px;
  height: 120px;
  top: 10%;
  left: 10%;
  animation-duration: 90s;
}

.cloud-2 {
  width: 400px;
  height: 150px;
  top: 40%;
  left: 40%;
  animation-duration: 120s;
}

.cloud-3 {
  width: 250px;
  height: 100px;
  top: 70%;
  left: 70%;
  animation-duration: 100s;
}

@keyframes cloudFloat {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(100vw + 400px));
  }
}

/* 2. Rain Effect */
.rain-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.raindrop {
  position: absolute;
  top: -30px;
  width: 2px;
  height: 25px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(100, 149, 237, 0.6),
    transparent
  );
  animation: rainfall linear infinite;
}

@keyframes rainfall {
  0% {
    transform: translateY(0) rotate(12deg);
    opacity: 0;
  }
  5% {
    opacity: 0.7;
  }
  95% {
    opacity: 0.5;
  }
  100% {
    transform: translateY(100vh) rotate(12deg);
    opacity: 0;
  }
}

/* 3. Fireflies / Floating Particles */
.firefly {
  position: absolute;
  width: 6px;
  height: 6px;
  background: radial-gradient(
    circle,
    rgba(255, 220, 100, 0.9) 0%,
    rgba(255, 200, 50, 0.5) 50%,
    transparent 70%
  );
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(255, 220, 100, 0.8),
    0 0 20px rgba(255, 200, 50, 0.4);
  animation: fireflyFloat ease-in-out infinite;
}

@keyframes fireflyFloat {
  0%,
  100% {
    transform: translateY(0) translateX(0) scale(1);
    opacity: 0.3;
  }
  25% {
    transform: translateY(-30px) translateX(15px) scale(1.2);
    opacity: 0.9;
  }
  50% {
    transform: translateY(-50px) translateX(-10px) scale(0.8);
    opacity: 0.6;
  }
  75% {
    transform: translateY(-20px) translateX(20px) scale(1.1);
    opacity: 0.8;
  }
}

/* 4. Falling Leaves */
.leaf {
  position: absolute;
  top: -30px;
  width: 20px;
  height: 20px;
  background: linear-gradient(
    135deg,
    rgba(139, 90, 43, 0.7) 0%,
    rgba(184, 115, 51, 0.6) 50%,
    rgba(210, 150, 80, 0.5) 100%
  );
  border-radius: 0 50% 50% 50%;
  transform-origin: center;
  animation: leafFall linear infinite;
}

@keyframes leafFall {
  0% {
    transform: translateY(0) rotate(0deg) translateX(0);
    opacity: 0;
  }
  5% {
    opacity: 0.7;
  }
  25% {
    transform: translateY(25vh) rotate(90deg) translateX(30px);
  }
  50% {
    transform: translateY(50vh) rotate(180deg) translateX(-20px);
  }
  75% {
    transform: translateY(75vh) rotate(270deg) translateX(25px);
  }
  95% {
    opacity: 0.5;
  }
  100% {
    transform: translateY(100vh) rotate(360deg) translateX(-10px);
    opacity: 0;
  }
}

/* 5. Light Flares */
.flare {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 200, 100, 0.15) 0%,
    rgba(255, 180, 50, 0.08) 40%,
    transparent 70%
  );
  animation: flareMove ease-in-out infinite;
}

.flare-1 {
  width: 300px;
  height: 300px;
  top: 5%;
  left: 60%;
  animation-duration: 25s;
}

.flare-2 {
  width: 200px;
  height: 200px;
  top: 30%;
  left: 10%;
  animation-duration: 30s;
  animation-delay: 10s;
}

.flare-3 {
  width: 250px;
  height: 250px;
  top: 60%;
  left: 75%;
  animation-duration: 35s;
  animation-delay: 5s;
}

@keyframes flareMove {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
    opacity: 0.4;
  }
  25% {
    transform: translate(-30px, 20px) scale(1.1);
    opacity: 0.6;
  }
  50% {
    transform: translate(20px, -15px) scale(0.95);
    opacity: 0.5;
  }
  75% {
    transform: translate(-10px, 30px) scale(1.05);
    opacity: 0.55;
  }
}

/* Enhanced Marker Ripple for Highlighted */
.marker-active-glow::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 60px;
  height: 60px;
  margin: -30px 0 0 -30px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.3);
  animation: markerRipple 2s ease-out infinite;
}

@keyframes markerRipple {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
