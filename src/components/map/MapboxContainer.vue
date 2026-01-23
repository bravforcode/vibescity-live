// --- C:\vibecity.live\src\components\map\MapboxContainer.vue ---

<script setup>
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  shallowRef,
  nextTick,
} from "vue";
import { calculateDistance } from "../../utils/shopUtils";
import { useShopStore } from "../../store/shopStore";
import { useI18n } from "vue-i18n";
import "mapbox-gl/dist/mapbox-gl.css";

const { t, te, locale } = useI18n();
const tt = (key, fallback) => (te(key) ? t(key) : fallback);

const shopStore = useShopStore();

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
const updateRoadDirections = async () => {
  if (
    !props.userLocation ||
    props.userLocation.length < 2 ||
    !props.selectedShopCoords ||
    props.selectedShopCoords.length < 2
  ) {
    roadDistance.value = null;
    roadDuration.value = null;
    if (map.value && map.value.getSource("distance-line")) {
      map.value.getSource("distance-line").setData({
        type: "FeatureCollection",
        features: [],
      });
    }
    return;
  }

  const [uLat, uLng] = props.userLocation;
  const [sLat, sLng] = props.selectedShopCoords;

  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/walking/${uLng},${uLat};${sLng},${sLat}?geometries=geojson&access_token=${mapboxgl.accessToken}`,
    );
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      const route = data.routes[0].geometry;
      if (map.value && map.value.getSource("distance-line")) {
        map.value.getSource("distance-line").setData({
          type: "Feature",
          geometry: route,
        });
      }
      roadDistance.value = data.routes[0].distance;
      roadDuration.value = data.routes[0].duration;

      // Update popup if open
      if (activePopup.value && activePopup.value.isOpen()) {
        const popupEl = activePopup.value.getElement();
        const distLabel = popupEl.querySelector(".road-dist-label");
        if (distLabel) {
          const distTxt =
            roadDistance.value < 1000
              ? `${Math.round(roadDistance.value)} m`
              : `${(roadDistance.value / 1000).toFixed(1)} km`;
          const timeTxt = `${Math.round(roadDuration.value / 60)} min`;
          distLabel.innerHTML = `📍 ${distTxt} (${timeTxt})`;
        }
      }
    }
  } catch (err) {
    console.error("Directions Error:", err);
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
  if (!map.value) return;
  map.value.flyTo({ center: lngLat, zoom, essential: true });
};

const animateAtmosphere = (time) => {
  if (!map.value || !isMapReady.value) return;
  // ✅ ถ้า tab ไม่ active: ข้ามงานหนัก แต่ "ยังวนต่อ" เพื่อกลับมาได้เอง
  if (document.hidden)
    return (atmosphericAnimationRequest =
      requestAnimationFrame(animateAtmosphere));
  if (map.value.getZoom() < 12)
    return (atmosphericAnimationRequest =
      requestAnimationFrame(animateAtmosphere));

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

  // 3. Shops Source with Clustering
  if (!map.value.getSource("vibe-shops")) {
    map.value.addSource("vibe-shops", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: false, // ✅ Disable clustering as requested
    });

    // ❌ Cluster layers removed for "Lively" view
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

  // 2. Update shops source for clustering
  const shopSource = map.value.getSource("vibe-shops");
  if (shopSource && props.shops) {
    shopSource.setData({
      type: "FeatureCollection",
      features: props.shops
        .filter((shop) => {
          const lng = Number(shop.lng);
          const lat = Number(shop.lat);
          return (
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            Math.abs(lng) <= 180 &&
            Math.abs(lat) <= 90
          );
        })
        .map((shop) => ({
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
            has_coin: !shopStore.collectedCoins.has(shop.id),
          },
        })),
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

// ✅ แก้ไข: ให้ดึงค่าจาก .env ก่อน ถ้าไม่มีค่อยใช้ค่า Default
const DARK_STYLE = import.meta.env.VITE_MAPBOX_STYLE || "mapbox://styles/mapbox/dark-v11";

const LIGHT_STYLE = {
  version: 8,
  name: "VibeCIty Entertainment Light",
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto-tiles",
      type: "raster",
      source: "carto-light",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
  glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
};

// ✅ Day/Night Cycle
const currentHour = ref(new Date().getHours());
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

// ✅ Initialize Map (async)
const initializeMap = async () => {
  if (!mapContainer.value) return;

  const ok = await ensureMapboxLoaded();
  if (!ok) return;

  map.value = new mapboxgl.Map({
    container: mapContainer.value,
    style: props.isDarkMode ? DARK_STYLE : LIGHT_STYLE,
    center: center.value,
    zoom: zoom.value,
    maxBounds: [
      [97.6, 18.0],
      [100.3, 20.6],
    ],
    attributionControl: false,
    antialias: false,
  });

  // Navigation controls removed (user prefers cleaner map)

  // Enable smooth scrolling and pinch-zoom
  map.value.scrollZoom.setWheelZoomRate(1 / 300);
  map.value.dragRotate.disable();

  map.value.on("load", () => {
    isMapReady.value = true;
    setupMapLayers();
    updateMapSources();
    requestUpdateMarkers();
    updateEventMarkers();

    // ✅ Start Atmospheric Animations
    initFireflies();
    atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
  });

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

// MVP Unicorn Popup - Real-time vibe, distance, compact buttons
const createPopupHTML = (item) => {
  const isLive = item.status === "LIVE";
  const bgClass = props.isDarkMode ? "bg-zinc-900/95" : "bg-white/95";
  const textClass = props.isDarkMode ? "text-white" : "text-gray-900";
  const hasCoins = !shopStore.collectedCoins.has(item.id);

  // Real-time Vibe calculation based on hour and venue type
  const currentHour = new Date().getHours();
  const isNightVenue = ["Bar", "Club", "Live Music", "Nightlife"].includes(
    item.category,
  );
  const isCafe = item.category === "Cafe";
  const isRestaurant = item.category === "Restaurant";

  let vibeLevel = 3;
  if (isLive) {
    vibeLevel = 5;
  } else if (isNightVenue) {
    if (currentHour >= 21 || currentHour < 2) vibeLevel = 5;
    else if (currentHour >= 19) vibeLevel = 4;
    else if (currentHour >= 17) vibeLevel = 3;
    else vibeLevel = 1;
  } else if (isCafe) {
    if (currentHour >= 8 && currentHour <= 11) vibeLevel = 5;
    else if (currentHour >= 14 && currentHour <= 17) vibeLevel = 4;
    else if (currentHour >= 6 && currentHour <= 20) vibeLevel = 3;
    else vibeLevel = 1;
  } else if (isRestaurant) {
    if (
      (currentHour >= 11 && currentHour <= 13) ||
      (currentHour >= 18 && currentHour <= 20)
    )
      vibeLevel = 5;
    else vibeLevel = 3;
  }

  vibeLevel = item.vibe_level || item.VibeLevel || vibeLevel;

  const vibeBars = Array(5)
    .fill(0)
    .map(
      (_, i) =>
        `<div class="h-4 w-2 rounded-sm ${i < vibeLevel ? "bg-gradient-to-t from-pink-500 to-purple-400" : "bg-white"}"></div>`,
    )
    .join("");

  // Crowd emoji based on vibe
  const crowdMap = {
    5: tt("status.vibe_5", "คึกคัก"),
    4: tt("status.vibe_4", "มาก"),
    3: tt("status.vibe_3", "ปานกลาง"),
    2: tt("status.vibe_2", "น้อย"),
    1: tt("status.vibe_1", "เงียบ"),
  };
  const crowdEmoji = vibeLevel >= 4 ? "🔥" : vibeLevel >= 3 ? "👥" : "😌";
  const crowdText = crowdMap[vibeLevel] || "ปานกลาง";

  // Distance (Managed by Road API or fallback)
  let distanceHtml = "";
  if (roadDistance.value) {
    const distTxt =
      roadDistance.value < 1000
        ? `${Math.round(roadDistance.value)} m`
        : `${(roadDistance.value / 1000).toFixed(1)} km`;
    const timeTxt = `${Math.round(roadDuration.value / 60)} min`;
    distanceHtml = `<div class="road-dist-label absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black text-white text-[11px] font-black border border-white/30 shadow-xl">📍 ${distTxt} (${timeTxt})</div>`;
  } else if (item.distance !== undefined) {
    const fallbackTxt =
      item.distance < 1
        ? `${(item.distance * 1000).toFixed(0)} m`
        : `${item.distance.toFixed(1)} km`;
    distanceHtml = `<div class="road-dist-label absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black text-white text-[11px] font-black border border-white/30 shadow-xl">📍 ${fallbackTxt}</div>`;
  }

  // 🚀 HIGH-VIBE DESCRIPTIONS (Human-written style for MVP)
  const defaultDescs = {
    Cafe: tt(
      "categories.cafe_desc",
      "☕ ดื่มด่ำกับกาแฟพรีเมียมในบรรยากาศสุดชิลล์",
    ),
    Bar: tt(
      "categories.bar_desc",
      "🍸 บาร์ลับใจกลางเชียงใหม่ พร้อมเครื่องดื่มคราฟต์",
    ),
    Club: tt("categories.club_desc", "🪩 ปลดปล่อยความมันส์กับ DJ ชั้นนำ"),
    Restaurant: tt("categories.food_desc", "🍽️ สัมผัสรสชาติอาหารเลิศรส"),
    "Live Music": tt("categories.music_desc", "🎸 ฟังดนตรีสดจากวงชื่อดัง"),
    Nightlife: tt(
      "categories.nightlife_desc",
      "🌃 แหล่งรวมความบันเทิงยามค่ำคืน",
    ),
    Shopping: tt("categories.shopping_desc", "🛍️ แหล่งรวมสินค้าแฟชั่น"),
  };

  const description =
    item.description ||
    item.Description ||
    item.vibe_status ||
    defaultDescs[item.category] ||
    "✨ สถานที่ยอดนิยมที่คุณต้องมาสัมผัสด้วยตัวเองในยามค่ำคืนนี้";
  const shortDesc =
    description.length > 85
      ? description.substring(0, 85) + "..."
      : description;

  const openHours = item.open_hours || item.Open || "";

  return `
    <div class="vibe-popup ${bgClass} rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border-2 border-white/20 overflow-hidden w-[280px] backdrop-blur-3xl" data-shop-id="${item.id}">
     <div class="relative w-full aspect-[9/16] max-h-[360px] overflow-hidden">


        <div class="absolute inset-0 bg-gradient-to-br from-purple-700 via-pink-600 to-red-600"></div>
        ${item.Image_URL1 ? `<img src="${item.Image_URL1}" class="absolute inset-0 w-full h-full object-cover" />` : ""}
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>

        <div class="absolute top-2 left-2 flex flex-col gap-1">
          ${isLive ? `<div class="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse">● LIVE</div>` : ""}
          ${hasCoins ? `<div class="px-1.5 py-0.5 rounded-full bg-yellow-400 text-black text-[9px] font-black">🪙 +10</div>` : ""}
        </div>

        <button class="popup-close-btn absolute top-2 right-2 w-7 h-7 rounded-full bg-black text-white flex items-center justify-center text-sm font-black border-2 border-white/20 z-10">✕</button>

        <!-- Info Overlay on Media -->
        <div class="absolute bottom-3 left-3 right-3">
          <h3 class="text-sm font-black leading-tight mb-0.5 truncate uppercase text-white drop-shadow-lg">${item.name}</h3>
          <div class="text-[10px] font-black text-white/80 uppercase tracking-widest">${item.category || "Venue"}</div>
        </div>

        ${distanceHtml}
      </div>

      <div class="p-3 ${textClass}">
        <div class="flex items-center justify-between mb-2 p-1.5 rounded-lg bg-white/10 border border-white/20 backdrop-blur-md">
          <div class="flex items-center gap-1">
            <span class="text-[10px] font-black">VIBE</span>
            <div class="flex items-end gap-px">${vibeBars}</div>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-xs">${crowdEmoji}</span>
            <span class="text-[10px] font-black">${crowdText}</span>
          </div>
        </div>

        ${openHours ? `<div class="text-[10px] font-black mb-1.5">🕐 ${openHours}</div>` : ""}

        <p class="text-[11px] font-bold leading-relaxed mb-2">${shortDesc}</p>

        <div class="flex gap-2">
          <button class="popup-nav-btn flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white active:scale-95 transition-all">
            <span class="text-xs">🗺️</span>
            <span class="text-[11px] font-bold">นำทาง</span>
          </button>
          <button class="popup-ride-btn flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white border border-white/10 active:scale-95 transition-all">
            <span class="text-xs">🚗</span>
            <span class="text-[11px] font-bold">เรียกรถ</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

// ✅ Close Active Popup
const closeActivePopup = () => {
  if (activePopup.value) {
    activePopup.value.remove();
    activePopup.value = null;
  }
};

// ✅ Show Popup for Item (Fixed button handling)
const showPopup = (item) => {
  closeActivePopup();

  if (!map.value) return;

  const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    container: document.body, // ✅ Portal to body to overlap ANY UI
    className: "vibe-mapbox-popup",
    maxWidth: "320px",
    offset: [0, -60],
    anchor: "bottom",
  })
    .setLngLat([item.lng, item.lat])
    .setHTML(createPopupHTML(item))
    .addTo(map.value);

  activePopup.value = popup;

  // ✅ After popup is mounted, measure its height and refocus once (super smooth)
  requestAnimationFrame(() => {
    try {
      const popupEl = popup.getElement();
      const popupCard = popupEl?.querySelector(".vibe-popup");
      const popupH = popupCard?.getBoundingClientRect()?.height || 0;

      // Focus with smart offset using popup height
      focusLocation([item.lat, item.lng], 17, null, popupH);
    } catch (e) {
      // ignore
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

// ✅ Create Custom Marker Element (Premium Entertainment Style)
const createMarkerElement = (item, isHighlighted, isLive) => {
  const el = document.createElement("div");
  el.className = `vibe-marker ${isLive ? "vibe-marker-live" : ""} ${isHighlighted ? "vibe-marker-active" : ""}`;
  el.dataset.shopId = item.id;

  // ✅ Size increases when highlighted
  const size = isHighlighted ? 44 : 30;
  const hasCoin = !shopStore.collectedCoins.has(item.id);

  // ✅ FIXED: Keep original color based on status, don't override with blue
  // LIVE = red, TONIGHT = orange, normal = gray, but highlighted normal = blue
  const color = isLive
    ? "#FF2D55" // Vibrant red for LIVE (always)
    : item.status === "TONIGHT"
      ? "#FF9500" // Orange for TONIGHT (always)
      : isHighlighted
        ? "#3B82F6" // Blue only for highlighted NORMAL shops
        : "#8E8E93"; // Gray for normal

  // ✅ Add highlight glow for ALL highlighted markers (including LIVE)
  const highlightGlow = isHighlighted
    ? `<filter id="highlightGlow-${item.id}" x="-50%" y="-50%" width="200%" height="200%">
         <feGaussianBlur stdDeviation="3" result="blur" />
         <feMerge>
           <feMergeNode in="blur" />
           <feMergeNode in="SourceGraphic" />
         </feMerge>
       </filter>`
    : "";

  // LIVE markers get special treatment - no inner circle, just glow
  const innerCircle = isLive
    ? ""
    : `<circle cx="12" cy="10" r="4" fill="white" fill-opacity="0.9" />`;

  // ✅ Determine which filter to use
  const filterAttr = isHighlighted
    ? `filter="url(#highlightGlow-${item.id})"`
    : isLive
      ? `filter="url(#liveGlow-${item.id})"`
      : "";

  el.innerHTML = `
    <div class="marker-wrapper ${isHighlighted ? "highlighted-marker" : ""} ${isLive ? "live-marker" : ""}" style="width: ${size}px; height: ${size + 12}px; position: relative;">
      ${
        isLive
          ? `
        <div class="live-pulse-ring-outer"></div>
        <div class="live-pulse-ring-inner"></div>
        <div class="live-pulse-core"></div>
      `
          : ""
      }
      ${isHighlighted ? '<div class="highlight-pulse-ring"></div>' : ""}
      <svg viewBox="0 0 24 32" class="marker-svg" style="filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));">
        <defs>
          <linearGradient id="pinGrad-${item.id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${color}" />
            <stop offset="100%" stop-color="${isLive ? "#92001D" : color}" />
          </linearGradient>
          ${
            isLive
              ? `
          <filter id="liveGlow-${item.id}" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>`
              : ""
          }
          ${highlightGlow}
        </defs>
        <path d="M12 0C5.4 0 0 5.4 0 12c0 8 12 20 12 20s12-12 12-20c0-6.6-5.4-12-12-12z"
              fill="url(#pinGrad-${item.id})"
              ${filterAttr} />
        ${innerCircle}
      </svg>
      ${isLive ? '<div class="live-label">LIVE</div>' : ""}
      ${hasCoin && !isLive ? '<div class="coin-badge">🪙</div>' : ""}
    </div>
  `;

  el.style.cursor = "pointer";
  return el;
};

// ✅ Create Giant Pin for Events (Premium SVG Design)
const createGiantPinElement = (event) => {
  const el = document.createElement("div");
  el.className = "giant-pin-marker";
  el.dataset.eventId = event.id;

  // Premium SVG-based event marker
  el.innerHTML = `
    <div class="giant-pin-wrapper">
      <svg class="giant-pin-svg" width="80" height="100" viewBox="0 0 80 100" fill="none">
        <defs>
          <!-- Premium gradient -->
          <linearGradient id="eventGrad-${event.id}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8B5CF6"/>
            <stop offset="50%" stop-color="#EC4899"/>
            <stop offset="100%" stop-color="#F43F5E"/>
          </linearGradient>
          <!-- Glow filter -->
          <filter id="eventGlow-${event.id}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <!-- Inner shadow -->
          <filter id="eventInner-${event.id}">
            <feOffset dx="0" dy="2"/>
            <feGaussianBlur stdDeviation="2"/>
            <feComposite operator="out" in="SourceGraphic"/>
            <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.3 0"/>
            <feBlend in="SourceGraphic"/>
          </filter>
        </defs>

        <!-- Outer glow ring (animated) -->
        <circle cx="40" cy="35" r="30" fill="none" stroke="url(#eventGrad-${event.id})" stroke-width="2" opacity="0.5" class="pulse-ring"/>

        <!-- Main body -->
        <circle cx="40" cy="35" r="28" fill="url(#eventGrad-${event.id})" filter="url(#eventGlow-${event.id})"/>

        <!-- Highlight -->
        <ellipse cx="40" cy="28" rx="16" ry="10" fill="white" opacity="0.2"/>

        <!-- Icon circle -->
        <circle cx="40" cy="35" r="18" fill="rgba(255,255,255,0.15)"/>

        <!-- Pointer/Pin tip -->
        <path d="M30 55 L40 75 L50 55" fill="url(#eventGrad-${event.id})" filter="url(#eventGlow-${event.id})"/>
      </svg>

      <!-- Icon overlay -->
      <div class="giant-pin-icon-overlay" style="display: flex; align-items: center; justify-center; height: 100%;">
        ${
          event.icon &&
          (event.icon.includes("http") || event.icon.includes("/"))
            ? `<img src="${event.icon}" class="w-7 h-7 object-contain" />`
            : `<span style="font-size: 24px;">${event.icon || "🎪"}</span>`
        }
      </div>

      <!-- Label -->
      <div class="giant-pin-label-new">${event.shortName || event.name}</div>
    </div>
  `;

  el.style.cursor = "pointer";
  return el;
};

// ✅ Update Markers (Viewport-based filtering for performance)
const MAX_VISIBLE_MARKERS = 120; // Increased to show more activity

const updateMarkers = () => {
  if (!map.value || !isMapReady.value) return;

  const currentMarkers = markersMap.value;

  // ✅ Get current viewport bounds
  const bounds = map.value.getBounds();
  const currentZoom = map.value.getZoom();

  // ✅ Filter shops to only those in viewport + prioritize LIVE and highlighted
  let visibleShops = (props.shops || []).filter((item) => {
    if (
      !item.lat ||
      !item.lng ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lng)
    ) {
      return false;
    }
    const id = Number(item.id);
    const highlightedId =
      props.highlightedShopId != null ? Number(props.highlightedShopId) : null;

    // 1. Always include highlighted shop
    if (id === highlightedId) return true;

    // 2. Zoom threshold check: If extremely zoomed out, only show LIVE
    // Pins start appearing from zoom 12 for a lively city feel
    if (currentZoom < 12) {
      if (item.status === "LIVE") return true;
      return false;
    }

    // 3. Always include LIVE shops in viewport
    if (item.status === "LIVE") return true;

    // 4. Check if in viewport
    return bounds.contains([item.lng, item.lat]);
  });

  // ✅ Limit markers to prevent WebGL overload
  if (visibleShops.length > MAX_VISIBLE_MARKERS) {
    // Sort: highlighted first, then LIVE, then by distance to center
    const center = map.value.getCenter();
    visibleShops.sort((a, b) => {
      const aId = Number(a.id);
      const bId = Number(b.id);
      const highlightedId =
        props.highlightedShopId != null
          ? Number(props.highlightedShopId)
          : null;

      if (aId === highlightedId) return -1;
      if (bId === highlightedId) return 1;
      if (a.status === "LIVE" && b.status !== "LIVE") return -1;
      if (a.status !== "LIVE" && b.status === "LIVE") return 1;
      // Distance to viewport center
      const distA = Math.hypot(a.lng - center.lng, a.lat - center.lat);
      const distB = Math.hypot(b.lng - center.lng, b.lat - center.lat);
      return distA - distB;
    });
    visibleShops = visibleShops.slice(0, MAX_VISIBLE_MARKERS);
  }

  const shopIds = new Set(visibleShops.map((s) => Number(s.id)));

  // Remove markers not in current view (BUT NEVER remove the highlighted one!)
  const highlightedId =
    props.highlightedShopId != null ? Number(props.highlightedShopId) : null;
  currentMarkers.forEach((marker, id) => {
    const numId = Number(id);
    // ✅ CRITICAL: Never delete the highlighted marker, even if temporarily not in props.shops
    if (numId === highlightedId) return;
    if (!shopIds.has(numId)) {
      marker.remove();
      currentMarkers.delete(id);
    }
  });

  // Add/update visible markers
  visibleShops.forEach((item) => {
    const itemId = Number(item.id);
    const highlightedId =
      props.highlightedShopId != null ? Number(props.highlightedShopId) : null;
    const isHighlighted = itemId === highlightedId;
    const isLive = item.status === "LIVE";

    let marker = currentMarkers.get(itemId);

    // ✅ CRITICAL: Check if marker is actually attached to the map
    // Markers can become detached if the map style changes or other issues occur
    const isMarkerAttached =
      marker &&
      marker._map &&
      marker.getElement()?.classList.contains("mapboxgl-marker");

    if (marker && isMarkerAttached) {
      // ✅ Update only if state changed (saves GPU/CPU)
      const el = marker.getElement();
      const wasHighlighted = el.dataset.highlighted === "true";
      const wasLive = el.dataset.live === "true";

      if (wasHighlighted !== isHighlighted || wasLive !== isLive) {
        const newEl = createMarkerElement(item, isHighlighted, isLive);
        el.innerHTML = newEl.innerHTML;
        el.className = newEl.className;
        el.dataset.highlighted = isHighlighted;
        el.dataset.live = isLive;
      }

      // ✅ Update z-index even if element didn't change (for layering)
      if (isHighlighted || isLive) {
        el.style.zIndex = "200"; // Give priority
      } else {
        el.style.zIndex = "50";
      }
    } else {
      // Remove detached marker if it exists (silently recreate)
      if (marker) {
        try {
          marker.remove();
        } catch (e) {
          /* ignore */
        }
        currentMarkers.delete(itemId);
      }
      // Create new marker
      const el = createMarkerElement(item, isHighlighted, isLive);
      el.dataset.highlighted = isHighlighted;
      el.dataset.live = isLive;

      // ✅ Extra safety for map.value to prevent "appendChild of undefined" crash
      // Mapbox needs the canvas container to be ready to append markers
      if (!map.value || !map.value.getCanvasContainer) return;

      marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat([item.lng, item.lat])
        .addTo(map.value);

      // ✅ Click handler
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        handleMarkerClick(item);
      });

      // ✅ Set higher z-index for highlighted/live markers
      if (isHighlighted || isLive) {
        marker.getElement().style.zIndex = "250";
      } else {
        marker.getElement().style.zIndex = "50";
      }

      currentMarkers.set(itemId, marker);
    }
  });

  // ✅ IMPORTANT: Reassign to trigger state update on shallowRef
  markersMap.value = new Map(currentMarkers);

  // Check coin collection for all shops when user location changes
  if (props.userLocation) {
    visibleShops.forEach((shop) => checkCoinCollection(shop));
  }
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
const getSmartYOffset = (popupPx = 0) => {
  const top = Number(props.uiTopOffset || 64);
  const bottom =
    Number(props.uiBottomOffset || 0) + Number(props.legendHeight || 0);

  const viewportH = window.innerHeight;
  // If mobile, the popup/drawer is at the bottom, so push the marker HIGHER (top 30%)
  const isMobile = viewportH < 768;
  const visualCenter = isMobile
    ? viewportH * 0.35 // Higher up on mobile
    : (viewportH - bottom + top) / 2;

  const mapCenter = viewportH / 2;

  let y = Math.round(mapCenter - visualCenter);
  if (popupPx > 0) y += Math.round(popupPx / 4);

  return Math.max(-100, Math.min(600, y));
};

// ✅ Focus Location (Fly To) - Smooth & Precise Centering
const focusLocation = (latlng, targetZoom = 17, popupPx = 280) => {
  if (!map.value || !latlng) return;

  const [lat, lng] = latlng;
  const yOffset = getSmartYOffset(popupPx);

  map.value.flyTo({
    center: [lng, lat],
    zoom: targetZoom,
    duration: 1500,
    padding: { bottom: yOffset },
    essential: true,
    curve: 1.42,
    speed: 1.2,
    pitch: 45,
  });
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
    if (shop) showPopup(shop);
  },
);

watch(
  [() => props.userLocation, () => props.selectedShopCoords],
  () => {
    updateMapSources();
    if (props.userLocation) {
      props.shops?.forEach((shop) => checkCoinCollection(shop));
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

  markersMap.value.forEach((m) => m.remove());
  eventMarkersMap.value.forEach((m) => m.remove());

  if (map.value) {
    map.value.remove();
    map.value = null;
  }
});

// ✅ Expose methods
defineExpose({
  focusLocation,
  centerOnUser,
  map,
  flyTo: (coords, zoom) =>
    map.value?.flyTo({
      center: coords,
      zoom,
      essential: true,
      speed: 0.8,
      curve: 1.4,
    }),
});
</script>

<template>
  <div
    :class="[
      'relative w-full h-full z-0 transition-colors duration-500',
      isDarkMode ? 'bg-[#09090b]' : 'bg-gray-200',
    ]"
  >
    <!-- Mapbox Container -->
    <div ref="mapContainer" class="w-full h-full min-h-[100dvh]"></div>

    <!-- Zeppelin removed for cleaner UI -->

    <!-- ✅ Coin Counter Display (moved to bottom-right, above cards) -->
    <div
      class="absolute bottom-[260px] right-4 z-[50] flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border shadow-lg transition-all duration-500"
      :class="
        isDarkMode
          ? 'bg-zinc-900/80 border-yellow-500/30 text-yellow-400'
          : 'bg-white/90 border-yellow-400/50 text-yellow-600'
      "
    >
      <span class="text-lg">🪙</span>
      <span class="text-sm font-bold font-mono">{{
        shopStore.totalCoins
      }}</span>
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
.mapboxgl-popup {
  position: relative;
}

/* Mapbox Popup Overrides */
.mapboxgl-popup {
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
.vibe-marker {
  pointer-events: auto !important;
}

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

.coin-badge {
  position: absolute;
  top: -6px;
  left: -6px;
  font-size: 14px;
  animation: coin-spin 3s ease-in-out infinite;
  filter: drop-shadow(0 0 4px rgba(234, 179, 8, 0.8));
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

.highlight-pulse-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.3);
  animation: marker-pulse-inner 1s infinite ease-out;
  pointer-events: none;
  z-index: -1;
}

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
</style>
