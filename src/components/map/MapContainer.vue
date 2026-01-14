<script setup>
import {
  LMap,
  LTileLayer,
  LMarker,
  LIcon,
  LCircleMarker,
  LPolygon,
  LImageOverlay,
} from "@vue-leaflet/vue-leaflet";
import "leaflet/dist/leaflet.css";
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import PoiIcon from "./PoiIcon.vue";

const props = defineProps({
  shops: Array,
  userLocation: Array,
  currentTime: Date,
  highlightedShopId: [Number, String],
  isDarkMode: { type: Boolean, default: true },
  activeZone: { type: String, default: null },

  // Province focus
  activeProvince: { type: String, default: null },

  // Indoor floor plan
  activeFloorPlan: { type: String, default: null },
  isIndoorView: { type: Boolean, default: false },
  activeBuilding: { type: Object, default: null },

  buildings: { type: Object, default: () => ({}) },

  // ✅ selected floor
  activeFloor: { type: [String, Number], default: null },

  // ✅ POI list for current floor (from App.vue computed indoorPois)
  indoorPois: { type: Array, default: () => [] },

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

const emit = defineEmits(["select-shop", "open-detail", "open-building", "exit-indoor"]);

const bounceTick = ref(0);
const zoom = ref(15);
const center = ref([18.7985, 98.968]);
const mapObject = ref(null);

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * ✅ ทำให้ indoor อยู่ได้นานขึ้นตอนซูมออก + เฟดช้ากว่าเดิมมาก
 * - ใช้ smoother curve แบบ "easeOutCubic-ish"
 * - เป้าหมาย: ซูมออกมาแล้ว floorplan ยังเห็นอยู่นาน ก่อนค่อย ๆ ไป base map
 */
const smoothstep = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const indoorBlend = computed(() => {
  if (!props.activeFloorPlan || !props.activeBuilding) return 0;
  if (!props.isIndoorView) return 0;

  // ✅ ขยาย range เยอะ และ “เฟดช้าตอนซูมออก”
  // start: จุดเริ่มเริ่มเห็น indoor
  // end:   จุดที่ indoor เต็ม 100%
  // แนะนำให้ end ใหญ่หน่อยเพื่อให้ curve หน่วง
  const start = 12.0; // เริ่ม “มี indoor”
  const end = 20; // indoor เต็มช้ากว่าเดิม

  const t = clamp01((zoom.value - start) / (end - start));

  // ทำให้ช่วงต้นขึ้นช้า (ยังเห็น base อยู่) แต่ช่วงกลาง/ท้ายจะเข้า indoor แบบนิ่ม
  const s = smoothstep(t);

  // ✅ ปรับ curve ให้ “คา indoor นาน” ตอนซูมออก
  // - ตอน t ต่ำ: ยังเห็น base เยอะ
  // - ตอน t สูง: indoor ครองนานขึ้น
  const slowFade = 1 - Math.pow(1 - easeOut(s), 1.8);
  return slowFade;
});

const baseOpacity = computed(() => 1 - indoorBlend.value);
const floorOpacity = computed(() => indoorBlend.value);

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

/** -----------------------------
 * ✅ Map ready / focus
 * ----------------------------- */
const onMapReady = (mapInstance) => {
  mapObject.value = mapInstance;
  console.log("Map ready, shops:", props.shops?.length || 0);
};

const focusLocation = (latlng, targetZoom = 17) => {
  if (latlng && mapObject.value) {
    mapObject.value.flyTo(latlng, targetZoom, {
      animate: true,
      duration: 0.6,
      easeLinearity: 0.15,
      noMoveStart: false,
    });
  }
};

const centerOnUser = () => {
  // ✅ Exit Indoor Mode when clicking Locate Me
  if (props.isIndoorView) {
    emit('exit-indoor');
  }
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

const isShopOnActiveFloor = (shop) => {
  if (!props.activeFloor) return true;
  if (!shop.Floor) return true; // ถ้าไม่มีข้อมูลชั้น ไม่ตัดทิ้ง
  return normalize(shop.Floor) === normalize(props.activeFloor);
};

const displayMarkers = computed(() => {
  // ✅ Indoor Mode: Hide ALL shop markers, show only POI
  if (props.isIndoorView) {
    return []; // Shop markers hidden, Indoor POI markers render separately
  }

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
  emit("select-shop", item);
  bounceTick.value++;
};

const isHighlighted = (item) => item.id === props.highlightedShopId;
const isLive = (item) => item.status === "LIVE";

const isInActiveProvince = (item) => {
  if (!props.activeProvince) return true;
  return item.Province === props.activeProvince;
};

const isInActiveZone = (item) => {
  if (!props.activeZone) return true;
  return item.Zone === props.activeZone;
};

const shouldDimMarker = (item) => {
  if (props.isIndoorView) return false;
  if (props.activeProvince && !isInActiveProvince(item)) return true;
  if (props.activeZone && !isInActiveZone(item)) return true;
  return false;
};

const getMarkerOpacity = (item) => {
  // Highlighted (clicked) marker always fully visible
  if (isHighlighted(item)) return 1;

  // Indoor mode = full visibility
  if (props.isIndoorView) return 1;

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
  if (props.isIndoorView) return 1;
  if (!props.activeProvince && !props.activeZone) return 1;
  return shouldDimMarker(item) ? 0.62 : 1;
};

const getMarkerTranslateY = (item) => {
  if (props.isIndoorView) return 0;
  if (!props.activeProvince && !props.activeZone) return 0;
  return shouldDimMarker(item) ? 10 : 0;
};

const getMarkerTransform = (item) => {
  const s = getMarkerScale(item);
  const y = getMarkerTranslateY(item);
  return `translateY(${y}px) scale(${s})`;
};

/** -----------------------------
 * ✅ Province mask polygon with HIGH-RESOLUTION boundary
 * ----------------------------- */
const hiResChiangMaiBoundary = ref(null);

// Load high-resolution Chiang Mai boundary on mount
onMounted(async () => {
  try {
    const response = await fetch("/data/chiang-mai-boundary.json");
    const geoJsonCoords = await response.json();
    // Convert from GeoJSON [lng, lat] to Leaflet [lat, lng]
    hiResChiangMaiBoundary.value = geoJsonCoords.map((c) => [c[1], c[0]]);
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
  if (!props.activeProvince) return null;

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

const provinceMaskOptions = computed(() => ({
  color: "transparent",
  fillColor: "#09090b",
  fillOpacity: props.activeProvince ? 0.7 : 0,
  stroke: false,
  interactive: false,
  className: "feathered-mask", // CSS blur for smooth edge
}));

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

/** -----------------------------
 * ✅ Indoor POI (minimal dot + icon + zoneNo) + click flyTo highlight
 * ----------------------------- */
const POI_STYLE = {
  entrance: { color: "#22C55E", icon: "🚪" },
  lift: { color: "#A855F7", icon: "🛗" },
  escalator: { color: "#F59E0B", icon: "🪜" },
  stairs: { color: "#F59E0B", icon: "🪜" },
  toilet: { color: "#0EA5E9", icon: "🚻" },
  info: { color: "#38BDF8", icon: "ℹ️" },
  food: { color: "#EF4444", icon: "🍽️" },
  parking: { color: "#64748B", icon: "🅿️" },
};

// ✅ สีหมุดร้านใน indoor (ใช้ CategoryColor จาก CSV ก่อน ถ้ามี)
const getIndoorShopColor = (shop) => {
  // CSV ของคุณมี CategoryColor อยู่แล้ว -> ใช้อันนี้ดีที่สุด
  const cc = shop?.CategoryColor;
  if (cc && String(cc).trim()) return String(cc).trim();

  // fallback: map จาก category
  const key = (shop?.Category || shop?.category || "")
    .toString()
    .trim()
    .toLowerCase();
  const MAP = {
    cafe: "#8B4513",
    restaurant: "#E74C3C",
    bar: "#9B59B6",
    "bar/nightlife": "#9B59B6",
    dessert: "#FF69B4",
    healthy: "#27AE60",
    "community mall": "#F39C12",
    fashion: "#E91E63",
    "hotel/bar": "#3498DB",
    "work space": "#3498DB",
    supermarket: "#27AE60",
  };
  return MAP[key] || "#60A5FA";
};

// ✅ เลขโซนร้าน (อ่านจาก CSV: IndoorZoneNo) ถ้าไม่มี -> สร้างอัตโนมัติจากลำดับในชั้น
const getIndoorShopZoneNo = (shop, indexOnFloor = 0) => {
  const raw =
    shop?.IndoorZoneNo ??
    shop?.ZoneNo ??
    shop?.indoorZoneNo ??
    shop?.zoneNo ??
    null;

  if (raw !== null && raw !== undefined && String(raw).trim() !== "")
    return String(raw).trim();
  return String(indexOnFloor + 1); // fallback 1..N
};

const getPoiStyle = (poi) =>
  POI_STYLE[poi?.type] || { color: "#94A3B8", icon: "📍" };

const activePoiId = ref(null);
const poiPulseTick = ref(0);

const isPoiHighlighted = (poi) => poi?.id && poi.id === activePoiId.value;

const handlePoiClick = (poi) => {
  if (!poi?.lat || !poi?.lng) return;
  activePoiId.value = poi.id;
  poiPulseTick.value++;
  focusLocation([poi.lat, poi.lng], Math.max(zoom.value, 18.2));
};

// clear POI highlight when exit indoor
watch(
  () => props.isIndoorView,
  (v) => {
    if (!v) activePoiId.value = null;
  }
);

// ✅ DEV MODE: Click on map to get coordinates for POI placement
// Enable by setting window.POI_DEV_MODE = true in browser console
const handleMapClick = (e) => {
  if (!window.POI_DEV_MODE) return;
  if (!props.isIndoorView) return;

  const { lat, lng } = e.latlng;
  const coordStr = `"lat": ${lat.toFixed(4)}, "lng": ${lng.toFixed(4)}`;

  console.log(
    "%c📍 POI Coordinate Picked:",
    "color: #22C55E; font-weight: bold; font-size: 14px;"
  );
  console.log(`   Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`);
  console.log(`   JSON: { ${coordStr} }`);
  console.log("   Floor:", props.activeFloor);
  console.log("   Building:", props.activeBuilding?.name);

  // Copy to clipboard
  navigator.clipboard
    .writeText(`{ ${coordStr} }`)
    .then(() => {
      console.log("%c✅ Copied to clipboard!", "color: #0EA5E9;");
    })
    .catch(() => {});
};

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
const isDetailsVisible = (item) => {
  if (props.isIndoorView) return true; // Indoor always detailed
  if (isHighlighted(item) || isLive(item)) return true; // Important markers always detailed
  if (item.distance && item.distance <= 2.0) return true; // Nearby < 2km detailed
  return false; // Distant & Inactive -> Dot
};

// ✅ Dynamic Locate Button Position
const locateButtonBottom = computed(() => {
  // If not in indoor view OR sidebar is open (VIBE NOW list), use standard position
  if (!props.isIndoorView || props.isSidebarOpen) return "80px"; 

  // Use actual Navigation Legend height + fixed 16px gap
  // If legendHeight is 0 (not yet measured), use fallback calculation
  if (props.legendHeight > 0) {
    return `${props.legendHeight + 16}px`;
  }

  // Fallback: Calculate estimated height
  // This provides a reasonable default while waiting for real measurement
  const itemCount = indoorNavItems.value.length;
  const estimatedHeight = 180 + (itemCount * 28) + 12; 
  
  return `${estimatedHeight}px`;
});

defineExpose({ focusLocation });
</script>

<template>
  <div
    :class="[
      'relative w-full h-full z-0 transition-colors duration-500',
      isDarkMode ? 'bg-[#09090b]' : 'bg-gray-200',
    ]"
    style="content-visibility: auto;"
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
      <!-- ✅ 1. Category Filter Dropdown (Tab Style) -->
      <div
        class="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] font-sans pointer-events-auto"
      >
        <div class="relative">
          <!-- Main Toggle Button -->
          <button
            @click.stop="isFilterOpen = !isFilterOpen"
            :class="[
              'flex items-center gap-2 pl-3 pr-2 py-2.5 rounded-2xl shadow-xl transition-all duration-300 ease-spring border backdrop-blur-xl',
              isFilterOpen
                ? 'bg-white/95 ring-2 ring-blue-500/20'
                : 'bg-white/80 hover:bg-white',
              isDarkMode
                ? 'bg-zinc-900/90 border-white/10 text-white'
                : 'border-white/40 text-slate-700',
            ]"
          >
            <span class="text-sm shadow-sm">{{
              availableCategories.find((c) => c.label === activeCategory)?.icon
            }}</span>
            <span class="text-xs font-bold tracking-wide">{{
              activeCategory
            }}</span>
            <div
              :class="[
                'w-5 h-5 flex items-center justify-center rounded-full bg-slate-100/50 transition-transform duration-300',
                isFilterOpen ? 'rotate-180' : '',
              ]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3 opacity-60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </button>

          <!-- Dropdown Menu -->
          <transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="transform scale-95 opacity-0 -translate-y-2"
            enter-to-class="transform scale-100 opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="transform scale-100 opacity-100 translate-y-0"
            leave-to-class="transform scale-95 opacity-0 -translate-y-2"
          >
            <div
              v-if="isFilterOpen"
              class="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-40 p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl border origin-top overflow-hidden"
              :class="
                isDarkMode
                  ? 'bg-zinc-900/95 border-white/10'
                  : 'bg-white/95 border-white/40'
              "
            >
              <button
                v-for="cat in availableCategories"
                :key="cat.label"
                @click.stop="setCategory(cat.label)"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200',
                  activeCategory === cat.label
                    ? isDarkMode
                      ? 'bg-white/10 text-white'
                      : 'bg-blue-50 text-blue-600'
                    : isDarkMode
                    ? 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
                ]"
              >
                <span>{{ cat.icon }}</span>
                <span>{{ cat.label }}</span>
                <span
                  v-if="activeCategory === cat.label"
                  class="ml-auto w-1.5 h-1.5 rounded-full bg-current"
                ></span>
              </button>
            </div>
          </transition>
        </div>
      </div>

      <!-- ✅ 2. Premium Custom Zoom Controls -->
      <div
        class="absolute bottom-10 right-5 z-[1000] flex flex-col gap-3 pointer-events-auto"
      >
        <div
          class="flex flex-col p-1 rounded-[20px] shadow-2xl backdrop-blur-xl border transition-colors duration-300"
          :class="
            isDarkMode
              ? 'bg-zinc-900/80 border-white/10'
              : 'bg-white/80 border-white/40'
          "
        >
          <!-- Zoom In -->
          <button
            @click.stop="zoomIn"
            class="group w-10 h-10 flex items-center justify-center rounded-xl relative overflow-hidden transition-all duration-200 active:scale-90 hover:bg-blue-500/10"
          >
            <span
              :class="[
                'absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                isDarkMode ? 'bg-white/5' : 'bg-black/5',
              ]"
            ></span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              :class="[
                'w-5 h-5 transition-transform duration-300 group-hover:scale-110 group-active:scale-95',
                isDarkMode ? 'text-white' : 'text-slate-700',
              ]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <!-- Divider -->
          <div
            :class="[
              'h-[1px] w-6 mx-auto',
              isDarkMode ? 'bg-white/10' : 'bg-slate-200/50',
            ]"
          ></div>

          <!-- Zoom Out -->
          <button
            @click.stop="zoomOut"
            class="group w-10 h-10 flex items-center justify-center rounded-xl relative overflow-hidden transition-all duration-200 active:scale-90 hover:bg-blue-500/10"
          >
            <span
              :class="[
                'absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                isDarkMode ? 'bg-white/5' : 'bg-black/5',
              ]"
            ></span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              :class="[
                'w-5 h-5 transition-transform duration-300 group-hover:scale-110 group-active:scale-95',
                isDarkMode ? 'text-white' : 'text-slate-700',
              ]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
      <!-- Base tiles (fade out as indoorBlend increases) -->
      <l-tile-layer
        :url="tileLayerUrl"
        layer-type="base"
        :opacity="baseOpacity"
        :key="tileLayerUrl"
      />

      <!-- Floorplan overlay (fade in as indoorBlend increases) -->
      <l-image-overlay
        v-if="activeFloorPlan && floorPlanBounds"
        :url="activeFloorPlan"
        :bounds="floorPlanBounds"
        :opacity="floorOpacity"
        :z-index="200"
      />

      <!-- Province mask (hide during indoor) -->
      <l-polygon
        v-if="provinceMaskPolygon && !isIndoorView"
        :lat-lngs="provinceMaskPolygon"
        :color="provinceMaskOptions.color"
        :fill-color="provinceMaskOptions.fillColor"
        :fill-opacity="provinceMaskOptions.fillOpacity"
        :stroke="provinceMaskOptions.stroke"
        :interactive="provinceMaskOptions.interactive"
        :class-name="provinceMaskOptions.className"
      />

      <!-- ✅ Indoor POI pins (minimal vibe) -->
      <template v-if="isIndoorView && indoorNavItems?.length">
        <l-marker
          v-for="poi in indoorNavItems"
          :key="`poi-${poi.id}`"
          :lat-lng="[poi.lat, poi.lng]"
          :z-index-offset="900"
          @click="handlePoiClick(poi)"
        >
          <l-icon class-name="vibe-marker-icon" :icon-anchor="[12, 12]">
            <div class="poi-wrap pointer-events-auto select-none">
              <!-- dot -->
              <div
                class="poi-dot"
                :class="[isPoiHighlighted(poi) ? 'poi-dot-active' : '']"
                :style="{ backgroundColor: getPoiStyle(poi).color }"
              >
                <PoiIcon
                  :type="poi.type"
                  :size="14"
                  color="white"
                  class="poi-icon"
                />
                <span v-if="poi.zoneNo" class="poi-no">{{ poi.zoneNo }}</span>
              </div>

              <!-- label (only show if highlighted OR zoom high) -->
              <div
                v-if="isPoiHighlighted(poi) || zoom >= 18"
                class="poi-label"
                :class="isDarkMode ? 'poi-label-dark' : 'poi-label-light'"
              >
                {{ poi.label }}
              </div>
            </div>
          </l-icon>
        </l-marker>
      </template>

      <!-- Shop markers (Rich DOM - nearby, live, highlighted) -->
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
                'marker-container relative flex flex-col items-center cursor-pointer',
                isLive(item) && !isHighlighted(item)
                  ? 'marker-live-glow-subtle'
                  : '',
                shouldDimMarker(item) ? 'province-dimmed' : '',
              ]"
              :style="{
                opacity: getMarkerOpacity(item),
                transform: getMarkerTransform(item),
              }"
            >
                <!-- 1. FULL CARD MODE (Nearby / Live / Highlighted) -->
              <template v-if="isDetailsVisible(item)">
                <!-- ✅ MINI POPUP (Conditional: Hide for distant inactive markers) -->
                <div
                  v-if="isHighlighted(item) || isLive(item) || (item.distance !== undefined && item.distance <= 3)"
                  class="relative mb-1 w-[120px] rounded-lg shadow-lg overflow-hidden"
                  :class="[
                    isDarkMode
                      ? 'bg-zinc-900/95 border border-white/10'
                      : 'bg-white/95 border border-gray-200',
                    isLive(item) ? 'live-popup-blue-glow' : '',
                  ]"
                >
                  <!-- Mini Image Placeholder -->
                  <div
                    class="h-12 w-full bg-gradient-to-br from-purple-600/30 to-red-600/30 flex items-center justify-center"
                  >
                    <span class="text-lg">🎵</span>
                  </div>
                  <!-- Mini Name -->
                  <div class="px-2 py-1.5 flex items-center justify-between gap-1">
                    <span
                      :class="[
                        'text-[9px] font-bold truncate flex-1',
                        isDarkMode ? 'text-white' : 'text-gray-800',
                      ]"
                    >
                      {{ item.name }}
                    </span>
                    <span
                      v-if="item.distance !== undefined"
                      class="text-[9px] font-mono opacity-80"
                      :class="isDarkMode ? 'text-gray-400' : 'text-gray-500'"
                    >
                      {{ item.distance.toFixed(1) }}km
                    </span>
                    <span
                      v-if="isLive(item)"
                      class="w-2 h-2 rounded-full bg-red-500 live-pulse-dot"
                    ></span>
                    <span
                      v-else-if="item.status === 'ACTIVE'"
                      class="w-1.5 h-1.5 rounded-full bg-green-500"
                    ></span>
                  </div>
                </div>

                <!-- ✅ FULL POPUP (Only on Click) -->
                <transition name="label-pop">
                  <div
                    v-if="isHighlighted(item)"
                    @click.stop
                    class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[180px] rounded-xl shadow-2xl overflow-hidden z-50"
                    :class="[
                      isDarkMode
                        ? 'bg-zinc-900 border border-white/20'
                        : 'bg-white border border-gray-200',
                      hasUpcomingEvent(item)
                        ? 'ring-2 ring-blue-400 event-popup-glow'
                        : '',
                    ]"
                  >
                    <!-- Image Placeholder -->
                    <div
                      class="h-16 w-full bg-gradient-to-br from-purple-600/30 to-red-600/30 flex items-center justify-center"
                    >
                      <span class="text-2xl">🎵</span>
                    </div>

                    <!-- Full Content -->
                    <div class="p-3">
                      <div class="flex items-start justify-between gap-2 mb-2">
                        <h4
                          :class="[
                            'text-xs font-bold leading-tight',
                            isDarkMode ? 'text-white' : 'text-gray-900',
                          ]"
                        >
                          {{ item.name }}
                        </h4>
                        <span
                          :class="[
                            'shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase',
                            isLive(item)
                              ? 'bg-blue-500 text-white live-pulse-badge'
                              : item.status === 'TONIGHT'
                              ? 'bg-orange-500 text-white'
                              : item.status === 'ACTIVE'
                              ? 'bg-green-500 text-white'
                              : 'bg-zinc-600 text-white',
                          ]"
                        >
                          {{ isLive(item) ? "🔵 LIVE" : item.status === 'ACTIVE' ? "🟢 OPEN" : item.status || "OFF" }}
                        </span>
                      </div>

                      <!-- Event Badge -->
                      <div
                        v-if="hasUpcomingEvent(item)"
                        class="mb-2 px-2 py-1 bg-blue-500/20 rounded-lg border border-blue-500/30"
                      >
                        <p class="text-[9px] font-bold text-blue-400">
                          🎉 {{ item.EventName }}
                        </p>
                      </div>

                      <div
                        :class="[
                          'text-[10px] mb-3',
                          isDarkMode ? 'text-white/60' : 'text-gray-500',
                        ]"
                      >
                        <span>{{ item.category }}</span>
                        <span v-if="item.openTime" class="ml-1"
                          >• {{ item.openTime }} - {{ item.closeTime }}</span
                        >
                      </div>

                      <button
                        :onclick="`window.openVibeDetail(${item.id})`"
                        :class="[
                          'w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all active:scale-95',
                          isDarkMode
                            ? 'bg-gradient-to-r from-purple-600 to-red-600 text-white'
                            : 'bg-gradient-to-r from-purple-500 to-red-500 text-white',
                        ]"
                      >
                        <span>ดูรายละเอียด</span>
                      </button>
                    </div>
                  </div>
                </transition>
              </template>

              <!-- 2. DOT MODE (Distant & Inactive) - Ultra Light DOM -->
              <template v-else>
                <div 
                  class="w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all hover:scale-150"
                  :class="[
                    item.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'
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

    <!-- Locate button (shows in Indoor mode OR when user location available) -->
    <button
      v-if="userLocation || isIndoorView"
      @click="centerOnUser"
      :style="{ bottom: locateButtonBottom }"
      :class="[
        'absolute left-4 z-[1000] w-10 h-10 flex items-center justify-center rounded-full shadow-lg active:scale-90 border transition-all duration-500 ease-out',
        isDarkMode
          ? 'bg-zinc-900/90 border-white/20'
          : 'bg-white/90 border-gray-200',
      ]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-5 h-5 text-blue-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    </button>

    <!-- Count -->
    <div
      :class="[
        'absolute top-4 right-4 z-[1000] px-2.5 py-1 rounded-full text-xs font-medium shadow-md',
        isDarkMode
          ? 'bg-zinc-900/90 text-white/80 border border-white/10'
          : 'bg-white/90 text-gray-700 border border-gray-200',
      ]"
    >
      📍 {{ displayMarkers.length }} ร้าน
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
