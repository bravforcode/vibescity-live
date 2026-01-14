<script setup>
import { ref, onMounted, computed, onUnmounted, watch, shallowRef } from "vue";
import MapContainer from "./components/map/MapContainer.vue";
import VideoPanel from "./components/panel/VideoPanel.vue";
import VibeModal from "./components/modal/VibeModal.vue";
import NavigationLegend from "./components/map/NavigationLegend.vue";
import FloorSelector from "./components/map/FloorSelector.vue";
import { fetchShopData } from "./services/sheetsService";
import { useShopFilters } from "./composables/useShopFilters";
import { calculateShopStatus, isGoldenTime } from "./utils/shopUtils";

// ใช้ CSV แบบ local ก่อน แล้วค่อยเปลี่ยนเป็น Google Sheets
const SHEET_CSV_URL = "/data/shops.csv";

// --- State ---
const rawShops = shallowRef([]);
const currentTime = ref(new Date());
const selectedShop = ref(null);
const activeShopId = ref(null);
const activeCategories = ref([]);
const activeStatus = ref("ALL");
const isDataLoading = ref(true);
const mapRef = ref(null);
const isMobileView = ref(false);
const rideModalShop = ref(null);

// ✅ Mobile: VIBE NOW collapse state
const isVibeNowCollapsed = ref(false);
const toggleVibeNow = () => {
  isVibeNowCollapsed.value = !isVibeNowCollapsed.value;
};

// ✅ Navigation Legend height tracking
const legendHeight = ref(0);
const handleLegendHeightChange = (height) => {
  legendHeight.value = height;
};


// --- Zone & Building Navigation State ---
const buildingsData = ref({});
const activeZone = ref(null);
const activeBuilding = ref(null);
const activeFloor = ref(null);
const showFloorSelector = ref(false);
const isIndoorView = ref(false);

// ✅ NEW: Province focus state
const activeProvince = ref(null);

// ✅ Geolocation State
const userLocation = ref(null);
const locationPermissionDenied = ref(false);
const maxNearbyDistance = 5; // km (reverted from 3km)
const maxNearbyMarkers = 30;
const rotationSeed = ref(0); // For rotating markers

// ✅ Update rotation seed every 30 minutes
setInterval(() => {
  rotationSeed.value = Math.floor(Date.now() / (30 * 60 * 1000));
}, 60000); // Check every minute

// ✅ Calculate distance between two points (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((Number(lat1) * Math.PI) / 180) *
      Math.cos((Number(lat2) * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ✅ Request user's geolocation
const requestGeolocation = () => {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation.value = [
        position.coords.latitude,
        position.coords.longitude,
      ];
      console.log("📍 User location:", userLocation.value);
    },
    (error) => {
      console.warn("Geolocation error:", error.message);
      locationPermissionDenied.value = true;
      // Default to Chiang Mai center if denied
      userLocation.value = [18.7883, 98.9853];
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
};

// ✅ Floor plan URL based on selected building and floor
const activeFloorPlan = computed(() => {
  if (!activeBuilding.value || !activeFloor.value) return null;

  const urls = activeBuilding.value.floorPlanUrls || {};
  const key = activeFloor.value;

  if (urls[key]) return urls[key];

  const found = Object.keys(urls).find(
    (k) => k.toLowerCase() === String(key).toLowerCase()
  );
  return found ? urls[found] : null;
});

// ✅ NEW: indoor POIs for current building+floor (from buildings.json indoorNavByFloor)
const indoorPois = computed(() => {
  if (!activeBuilding.value || !activeFloor.value) return [];
  return activeBuilding.value.indoorNavByFloor?.[activeFloor.value] || [];
});

// ✅ Alias ชื่อที่คุณต้องการ: indoorNavItems
const indoorNavItems = computed(() => indoorPois.value);

// ✅ NEW: legend meta for current building
const poiLegendMeta = computed(() => {
  if (!activeBuilding.value) return {};
  return activeBuilding.value.poiLegendMeta || {};
});

// ✅ Floor label for legend header
const activeFloorLabel = computed(() => {
  if (!activeBuilding.value || !activeFloor.value) return "";
  return (
    activeBuilding.value.floorNames?.[activeFloor.value] ||
    String(activeFloor.value)
  );
});

// ✅ Legend shows only when indoor AND VIBE NOW is collapsed (mutual exclusion)
const showLegend = computed(
  () => isIndoorView.value && !!activeBuilding.value && isVibeNowCollapsed.value
);

// Open ride service modal
const openRideModal = (shop) => {
  rideModalShop.value = shop;
};

// Theme State - ใช้ reactive ref ให้ถูกต้อง
const isDarkMode = ref(true);

// --- Real-time Logic: แปลงข้อมูลดิบตามเวลาปัจจุบัน ---
const shops = computed(() => {
  return rawShops.value.map((shop) => {
    const dynamicStatus = calculateShopStatus(shop, currentTime.value);
    const golden = isGoldenTime(shop, currentTime.value);
    return {
      ...shop,
      status: dynamicStatus,
      isGolden: golden,
    };
  });
});

const { filteredShops } = useShopFilters(shops, activeCategories, activeStatus);

// ✅ All shops with distance info (for opacity-based rendering, NO filtering)
const nearbyShops = computed(() => {
  if (!userLocation.value || !filteredShops.value) return filteredShops.value;

  const [userLat, userLng] = userLocation.value;

  // Add distance to each shop (for MapContainer to apply opacity)
  const shopsWithDistance = filteredShops.value.map((shop, idx) => ({
    ...shop,
    distance: calculateDistance(userLat, userLng, shop.lat, shop.lng),
    rotationOrder: (idx + rotationSeed.value) % filteredShops.value.length,
  }));

  // Sort: LIVE first, then by distance (closest first)
  shopsWithDistance.sort((a, b) => {
    const aIsLive = a.status === "LIVE" || a.Status === "LIVE";
    const bIsLive = b.status === "LIVE" || b.Status === "LIVE";
    if (aIsLive && !bIsLive) return -1;
    if (!aIsLive && bIsLive) return 1;
    return a.distance - b.distance;
  });

  // Return ALL shops (no limit, no distance filter)
  return shopsWithDistance;
});

// --- Time Loop ---
let timeInterval = null;

// Debug watcher for floor selector
watch(
  [showFloorSelector, activeBuilding],
  ([show, building]) => {
    console.log(
      "🏢 FloorSelector State Changed - showFloorSelector:",
      show,
      "activeBuilding:",
      building?.name || null
    );
  },
  { immediate: true }
);

// ✅ Auto-collapse VIBE NOW when entering indoor mode (so Navigation Legend shows)
watch(isIndoorView, (isIndoor) => {
  if (isIndoor) {
    isVibeNowCollapsed.value = true;
  }
});

onMounted(async () => {
  try {
    // Check mobile view
    checkMobileView();
    window.addEventListener("resize", checkMobileView);

    // Load saved theme
    const savedTheme = localStorage.getItem("vibecity-theme");
    if (savedTheme !== null) {
      isDarkMode.value = savedTheme === "dark";
    }

    // Load shop data
    rawShops.value = await fetchShopData(SHEET_CSV_URL);
    console.log("Loaded shops:", rawShops.value.length);

    // ✅ Request geolocation on mount
    requestGeolocation();

    // Load buildings data
    try {
      const buildingsResponse = await fetch("/data/buildings.json");
      buildingsData.value = await buildingsResponse.json();
      console.log("Loaded buildings:", Object.keys(buildingsData.value).length);
    } catch (e) {
      console.warn("Buildings data not found, continuing without it");
    }

    // Start Clock Loop (Update every 1 minute)
    timeInterval = setInterval(() => {
      currentTime.value = new Date();
    }, 60000);

    // Setup scroll observer for mobile cards after a short delay
    setTimeout(() => {
      setupMobileScrollObserver();
    }, 500);

    // Listen for window custom event from Leaflet marker (bypasses Vue emit limitation)
    window.addEventListener("vibe-open-detail", handleVibeOpenDetail);
  } catch (err) {
    console.error("Initialization Error:", err.message);
  } finally {
    isDataLoading.value = false;
  }
});

// Mobile scroll observer
const mobileCardScrollRef = ref(null);
let scrollTimeout = null;

const setupMobileScrollObserver = () => {
  if (!mobileCardScrollRef.value) {
    console.log("mobileCardScrollRef not ready, retrying...");
    setTimeout(setupMobileScrollObserver, 300);
    return;
  }

  console.log("Setting up scroll observer");

  // Use scroll event for more reliable detection
  mobileCardScrollRef.value.addEventListener("scroll", handleMobileScroll, {
    passive: true,
  });
};

const handleMobileScroll = () => {
  // Debounce scroll handling
  if (scrollTimeout) clearTimeout(scrollTimeout);

  scrollTimeout = setTimeout(() => {
    if (!mobileCardScrollRef.value) return;

    const container = mobileCardScrollRef.value;
    const cards = container.querySelectorAll(".mobile-shop-card");
    const containerTop = container.scrollTop;
    const cardHeight = 90; // Approximate card height with gap

    // Find which card is most visible (closest to top)
    let closestCard = null;
    let minDistance = Infinity;

    cards.forEach((card, index) => {
      const cardTop = card.offsetTop - container.offsetTop;
      const distance = Math.abs(cardTop - containerTop);

      if (distance < minDistance) {
        minDistance = distance;
        closestCard = card;
      }
    });

    if (closestCard) {
      const shopId = parseInt(closestCard.dataset.shopId);
      if (shopId && activeShopId.value !== shopId) {
        const shop = filteredShops.value.find((s) => s.id === shopId);
        if (shop && shop.lat && shop.lng) {
          console.log("Scrolled to shop:", shop.name);
          activeShopId.value = shopId;
          if (mapRef.value) {
            mapRef.value.focusLocation([shop.lat, shop.lng], 16);
          }
        }
      }
    }
  }, 100); // Small debounce for smooth performance
};

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval);
  window.removeEventListener("resize", checkMobileView);
  window.removeEventListener("vibe-open-detail", handleVibeOpenDetail);
  if (mobileCardScrollRef.value) {
    mobileCardScrollRef.value.removeEventListener("scroll", handleMobileScroll);
  }
  if (scrollTimeout) clearTimeout(scrollTimeout);
});

const checkMobileView = () => {
  isMobileView.value = window.innerWidth < 768;
};

// Toggle theme - แก้ไขให้ทำงานถูกต้อง
const toggleTheme = () => {
  console.log("Toggle theme clicked, current:", isDarkMode.value);
  isDarkMode.value = !isDarkMode.value;
  console.log("New theme:", isDarkMode.value);
  localStorage.setItem("vibecity-theme", isDarkMode.value ? "dark" : "light");
};

// --- Bi-directional Sync Handlers ---

// Panel → Map: When scrolling panel, pan map to that location
const handlePanelScroll = (shop) => {
  activeShopId.value = shop.id;

  // ✅ province focus
  activeProvince.value = shop.Province || null;

  // ✅ zone focus (optional)
  activeZone.value = shop.Zone || null;

  if (mapRef.value && shop.lat && shop.lng) {
    mapRef.value.focusLocation([shop.lat, shop.lng], 16);
  }
};

// Map → Card: When clicking marker, set active and focus
const handleMarkerClick = (shop) => {
  activeShopId.value = shop.id;

  activeProvince.value = "เชียงใหม่";
  activeZone.value = shop.Zone || null;

  const buildingKey = shop.Building;
  const buildingRaw = buildingKey ? buildingsData.value[buildingKey] : null;

  if (!buildingRaw) {
    showFloorSelector.value = false;
    isIndoorView.value = false;
    activeBuilding.value = null;
    activeFloor.value = null;
  } else {
    // ✅ ใส่ key เพื่อให้ MapContainer กรองหมุดได้ “ตรงเป๊ะ”
    activeBuilding.value = { ...buildingRaw, key: buildingKey };

    activeFloor.value = shop.Floor || buildingRaw.floors?.[0] || null;
    showFloorSelector.value = true;

    // ยังไม่เข้า indoor จนกดเลือกชั้น
    isIndoorView.value = false;
  }

  if (mapRef.value && shop.lat && shop.lng) {
    mapRef.value.focusLocation([shop.lat, shop.lng], 17);
  }
};

// Close floor selector and exit indoor view
const handleCloseFloorSelector = () => {
  showFloorSelector.value = false;
  isIndoorView.value = false;
  activeBuilding.value = null;
  activeFloor.value = null;
};

// Handle floor selection - enter indoor view
const handleFloorSelect = (floor) => {
  activeFloor.value = floor;
  isIndoorView.value = true;

  // ✅ Close detail popup when entering floor view
  selectedShop.value = null;

  // ✅ Collapse VIBE NOW drawer for better floor plan visibility
  isVibeNowCollapsed.value = true;

  if (mapRef.value && activeBuilding.value) {
    mapRef.value.focusLocation(
      [activeBuilding.value.lat, activeBuilding.value.lng],
      18
    );
  }
};

// Shop card click - pan to shop first
const handleCardClick = (shop) => {
  activeShopId.value = shop.id;

  // ✅ province focus
  activeProvince.value = shop.Province || null;

  // ✅ zone focus
  activeZone.value = shop.Zone || null;

  if (mapRef.value && shop.lat && shop.lng) {
    mapRef.value.focusLocation([shop.lat, shop.lng], 17);
  }
  handleMarkerClick(shop);
};

// Hover on card - pan map to location
const handleCardHover = (shop) => {
  activeShopId.value = shop.id;
  activeProvince.value = "เชียงใหม่";
  activeZone.value = shop.Zone || null;

  // hover แล้วถ้าไม่ใช่ตึก ให้ปิด tabs
  const buildingKey = shop.Building;
  const building = buildingKey ? buildingsData.value[buildingKey] : null;
  if (!building) {
    showFloorSelector.value = false;
    isIndoorView.value = false;
    activeBuilding.value = null;
    activeFloor.value = null;
  }

  if (mapRef.value && shop.lat && shop.lng) {
    mapRef.value.focusLocation([shop.lat, shop.lng], 16);
  }
};

// Handler for window event from Leaflet marker (bypasses Vue emit)
const handleVibeOpenDetail = (event) => {
  const shop = event.detail;
  if (shop) {
    selectedShop.value = shop; // Open modal directly
  }
};

// Open detail modal DIRECTLY
const handleOpenDetail = (shop) => {
  selectedShop.value = shop; // Open modal
};

// Live count
const liveCount = computed(() => {
  return shops.value.filter((s) => s.status === "LIVE").length;
});
</script>

<template>
  <main
    :class="[
      'relative w-full h-[100dvh] overflow-hidden font-sans transition-colors duration-500',
      isDarkMode ? 'bg-[#0b0d11]' : 'bg-gray-100',
    ]"
  >
    <!-- Theme Toggle Button - บนซ้ายสุด -->
    <button
      @click="toggleTheme"
      :class="[
        'fixed top-4 left-4 z-[5000] w-10 h-10 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 active:scale-95',
        isDarkMode
          ? 'bg-zinc-800/90 border border-white/20 text-yellow-400 hover:bg-zinc-700'
          : 'bg-white/90 border border-gray-300 text-gray-700 hover:bg-gray-100 shadow-md',
      ]"
      title="เปลี่ยนธีม"
    >
      <!-- Sun Icon -->
      <svg
        v-if="isDarkMode"
        xmlns="http://www.w3.org/2000/svg"
        class="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      <!-- Moon Icon -->
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        class="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    </button>

    <!-- Desktop Layout: Map (65%) + Panel (35%) -->
    <div v-if="!isMobileView" class="grid grid-cols-[65%_35%] h-full">
      <!-- Map Container -->
      <div class="relative">
        <MapContainer
          ref="mapRef"
          :shops="nearbyShops"
          :userLocation="userLocation"
          :currentTime="currentTime"
          :highlightedShopId="activeShopId"
          :isDarkMode="isDarkMode"
          :activeZone="activeZone"
          :activeProvince="activeProvince"
          :buildings="buildingsData"
          :activeFloorPlan="activeFloorPlan"
          :isIndoorView="isIndoorView"
          :activeBuilding="activeBuilding"
          :activeFloor="activeFloor"
          :indoorPois="indoorPois"
          @select-shop="handleMarkerClick"
          @exit-indoor="handleCloseFloorSelector"
        />

        <!-- Floor Selector Popup - Moved outside for better z-index control -->
      </div>

      <!-- Navigation Legend desktop (OUTSIDE map container for proper positioning) -->
      <NavigationLegend
        :isDarkMode="isDarkMode"
        :activeZone="activeZone"
        :isVisible="isIndoorView && !!activeBuilding && !showFloorSelector"
        :poiItems="indoorNavItems"
        :poiLegendMeta="poiLegendMeta"
        :buildingName="activeBuilding?.shortName || activeBuilding?.name || ''"
        :floorName="activeFloorLabel"
      />

      <!-- Floor Selector Tabs Bar (Desktop) - Fixed at top -->
      <FloorSelector
        :building="activeBuilding"
        :selectedFloor="activeFloor"
        :isDarkMode="isDarkMode"
        :isVisible="showFloorSelector"
        @close="handleCloseFloorSelector"
        @select-floor="handleFloorSelect"
      />

      <!-- Video Panel -->
      <VideoPanel
        ref="panelRef"
        :shops="filteredShops"
        :activeShopId="activeShopId"
        :isDarkMode="isDarkMode"
        @scroll-to-shop="handlePanelScroll"
        @select-shop="handleCardClick"
        @open-detail="handleOpenDetail"
        @hover-shop="handleCardHover"
      />
    </div>

    <!-- Mobile Layout: Full Map + Small Floating Button -->
    <template v-else>
      <!-- Full Map -->
      <MapContainer
        ref="mapRef"
        :shops="nearbyShops"
        :userLocation="userLocation"
        :currentTime="currentTime"
        :highlightedShopId="activeShopId"
        :isDarkMode="isDarkMode"
        :activeZone="activeZone"
        :activeProvince="activeProvince"
        :buildings="buildingsData"
        :activeFloorPlan="activeFloorPlan"
        :isIndoorView="isIndoorView"
        :activeBuilding="activeBuilding"
        :activeFloor="activeFloor"
        :indoorPois="indoorPois"
        :isSidebarOpen="!isVibeNowCollapsed"
        :legendHeight="legendHeight"
        @select-shop="handleMarkerClick"
        @open-detail="handleOpenDetail"
        @exit-indoor="handleCloseFloorSelector"
        class="absolute inset-0"
      />

      <!-- Navigation Legend (mobile) - Shows when VIBE NOW is collapsed -->
      <NavigationLegend
        :isDarkMode="isDarkMode"
        :activeZone="activeZone"
        :isVisible="showLegend"
        :poiItems="indoorNavItems"
        :poiLegendMeta="poiLegendMeta"
        :buildingName="activeBuilding?.shortName || activeBuilding?.name || ''"
        :floorName="activeFloorLabel"
        @height-change="handleLegendHeightChange"
      />

      <!-- Floor Selector Popup (mobile) -->
      <FloorSelector
        :building="activeBuilding"
        :shop="filteredShops.find((s) => s.id === activeShopId)"
        :isDarkMode="isDarkMode"
        :isVisible="showFloorSelector"
        @close="handleCloseFloorSelector"
        @select-floor="handleFloorSelect"
      />

      <!-- VIBE NOW Drawer (Mobile) - Auto-collapses during indoor view -->
      <div
        class="absolute top-1/2 right-0 z-[1200] transition-transform duration-500 ease-out"
        :style="{
          transform: isVibeNowCollapsed
            ? 'translate(calc(100% - 0px), -50%)'
            : 'translate(0, -50%)',
        }"
      >
        <!-- Toggle Button (attached to drawer) -->
        <button
          class="absolute -left-10 top-1/2 -translate-y-1/2 w-10 h-20 rounded-l-2xl shadow-xl flex items-center justify-center border-l border-t border-b transition-all duration-300 hover:scale-105 active:scale-95"
          :class="
            isDarkMode
              ? 'bg-zinc-900/60 border-white/25 text-white backdrop-blur-xl'
              : 'bg-white/50 border-white/50 text-gray-800 backdrop-blur-xl'
          "
          @click="toggleVibeNow"
          title="พับ/กาง VIBE NOW"
        >
          <svg
            class="w-5 h-5 transition-transform duration-300"
            :class="isVibeNowCollapsed ? 'rotate-180' : ''"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>

        <!-- Drawer Panel -->
        <div
          class="w-40 h-[555px] rounded-l-3xl overflow-hidden shadow-2xl border-l border-t border-b"
          :class="
            isDarkMode
              ? 'bg-zinc-900/20 border-white/20 backdrop-blur-3xl'
              : 'bg-white/15 border-white/40 backdrop-blur-3xl'
          "
        >
          <!-- Header -->
          <div
            class="px-3 py-2.5 border-b"
            :class="isDarkMode ? 'border-white/10' : 'border-gray-200/50'"
          >
            <div class="flex items-center justify-between">
              <span
                :class="[
                  'text-xs font-bold tracking-widest uppercase',
                  isDarkMode ? 'text-white' : 'text-gray-800',
                ]"
              >
                VIBE NOW
              </span>
              <span
                class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10"
              >
                <span
                  class="w-2 h-2 bg-red-500 rounded-full animate-pulse"
                ></span>
                <span class="text-[11px] font-semibold text-red-500">{{
                  liveCount
                }}</span>
              </span>
            </div>
          </div>

          <!-- Cards Scroll Area -->
          <div
            ref="mobileCardScrollRef"
            class="h-[calc(100%-44px)] overflow-y-auto scrollbar-hide"
            style="scroll-behavior: smooth; -webkit-overflow-scrolling: touch"
          >
            <div class="flex flex-col gap-1.5 p-1.5">
              <div
                v-for="shop in [...filteredShops]
                  .sort(
                    (a, b) =>
                      (b.status === 'LIVE' ? 1 : 0) -
                      (a.status === 'LIVE' ? 1 : 0)
                  )
                  .slice(0, 50)"
                :key="shop.id"
                class="mobile-shop-card flex-shrink-0 rounded-xl shadow-lg border cursor-pointer transition-all duration-300 active:scale-[0.98] overflow-hidden backdrop-blur-xl"
                :data-shop-id="shop.id"
                :class="[
                  activeShopId === shop.id
                    ? isDarkMode
                      ? 'bg-blue-500/40 border-blue-400/50 ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20'
                      : 'bg-blue-500/50 border-blue-400/60 ring-2 ring-blue-400/40 shadow-lg shadow-blue-400/25'
                    : isDarkMode
                    ? 'bg-white/10 border-white/20 hover:bg-white/15 hover:border-white/30 shadow-md'
                    : 'bg-white/20 border-white/40 hover:bg-white/35 hover:border-white/50 shadow-md',
                ]"
                @click="handleCardClick(shop)"
              >
                <!-- Image -->
                <div
                  :class="[
                    'h-14 w-full flex items-center justify-center',
                    shop.Image_URL1
                      ? ''
                      : isDarkMode
                      ? 'bg-zinc-800'
                      : 'bg-gray-100',
                  ]"
                >
                  <img
                    v-if="shop.Image_URL1"
                    :src="shop.Image_URL1"
                    :alt="shop.name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="flex items-center justify-center h-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      :class="[
                        'w-8 h-8',
                        isDarkMode ? 'text-zinc-600' : 'text-gray-400',
                      ]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                </div>

                <!-- Info -->
                <div class="px-2 py-1">
                  <div class="flex items-center gap-1 mb-1">
                    <div
                      :class="[
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        shop.status === 'LIVE' ? 'bg-red-500' : 'bg-zinc-500',
                      ]"
                    ></div>

                    <span
                      :class="[
                        'text-[9px] font-bold truncate leading-tight drop-shadow-sm',
                        activeShopId === shop.id
                          ? 'text-white drop-shadow-md'
                          : isDarkMode
                          ? 'text-white'
                          : 'text-gray-900',
                      ]"
                    >
                      {{ shop.name }}
                    </span>
                  </div>

                  <div class="flex gap-1">
                    <a
                      :href="`https://www.google.com/maps/search/?api=1&query=${shop.lat},${shop.lng}`"
                      target="_blank"
                      @click.stop
                      :class="[
                        'flex-1 flex items-center justify-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-medium transition-all',
                        isDarkMode
                          ? 'bg-white/10 text-white/80 hover:bg-white/20'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      ]"
                    >
                      <span>นำทาง</span>
                    </a>

                    <button
                      @click.stop="openRideModal(shop)"
                      :class="[
                        'flex-1 flex items-center justify-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-medium transition-all',
                        isDarkMode
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-green-50 text-green-600 hover:bg-green-100',
                      ]"
                    >
                      <span>เรียกรถ</span>
                    </button>
                  </div>
                </div>
              </div>
              <!-- /card -->
            </div>
            <!-- /stack -->
          </div>
          <!-- /scroll -->
        </div>
        <!-- /glass -->
      </div>
      <!-- /absolute -->

      <!-- Ride Service Modal Popup -->
      <transition name="modal-fade">
        <div
          v-if="rideModalShop"
          class="fixed inset-0 z-[2000] flex items-center justify-center p-4"
          @click="rideModalShop = null"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

          <!-- Modal Content -->
          <transition name="modal-scale">
            <div
              v-if="rideModalShop"
              @click.stop
              :class="[
                'relative w-full max-w-xs rounded-2xl shadow-2xl overflow-hidden',
                isDarkMode ? 'bg-zinc-900 border border-white/10' : 'bg-white',
              ]"
            >
              <!-- Header -->
              <div
                :class="[
                  'px-4 py-3 border-b',
                  isDarkMode ? 'border-white/10' : 'border-gray-100',
                ]"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <h3
                      :class="[
                        'text-sm font-bold',
                        isDarkMode ? 'text-white' : 'text-gray-900',
                      ]"
                    >
                      เรียกรถไป
                    </h3>
                    <p
                      :class="[
                        'text-xs mt-0.5',
                        isDarkMode ? 'text-white/60' : 'text-gray-500',
                      ]"
                    >
                      {{ rideModalShop.name }}
                    </p>
                  </div>
                  <button
                    @click="rideModalShop = null"
                    :class="[
                      'w-8 h-8 flex items-center justify-center rounded-full transition-all',
                      isDarkMode
                        ? 'hover:bg-white/10 text-white/60'
                        : 'hover:bg-gray-100 text-gray-400',
                    ]"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Ride Options -->
              <div class="p-3 space-y-2">
                <!-- Grab -->
                <a
                  :href="`https://grab.onelink.me/2695613898?af_dp=grab://open?screenType=BOOKING&dropOffLatitude=${rideModalShop.lat}&dropOffLongitude=${rideModalShop.lng}`"
                  target="_blank"
                  @click="rideModalShop = null"
                  :class="[
                    'flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                    isDarkMode
                      ? 'bg-white/5 hover:bg-white/10 active:scale-95'
                      : 'bg-gray-50 hover:bg-gray-100 active:scale-95',
                  ]"
                >
                  <div
                    class="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-green-500/30"
                  >
                    G
                  </div>
                  <div class="flex-1">
                    <div
                      :class="[
                        'font-semibold text-sm',
                        isDarkMode ? 'text-white' : 'text-gray-900',
                      ]"
                    >
                      Grab
                    </div>
                    <div
                      :class="[
                        'text-[10px]',
                        isDarkMode ? 'text-white/50' : 'text-gray-500',
                      ]"
                    >
                      เรียกรถแกร็บ
                    </div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    :class="[
                      'w-5 h-5',
                      isDarkMode ? 'text-white/30' : 'text-gray-400',
                    ]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>

                <!-- Bolt -->
                <a
                  :href="`https://bolt.eu/ride/?destination_lat=${rideModalShop.lat}&destination_lng=${rideModalShop.lng}`"
                  target="_blank"
                  @click="rideModalShop = null"
                  :class="[
                    'flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                    isDarkMode
                      ? 'bg-white/5 hover:bg-white/10 active:scale-95'
                      : 'bg-gray-50 hover:bg-gray-100 active:scale-95',
                  ]"
                >
                  <div
                    class="w-10 h-10 rounded-xl bg-[#34D186] flex items-center justify-center shadow-lg shadow-[#34D186]/30"
                  >
                    <svg
                      class="w-6 h-6 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path
                        d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.5L17.5 8 12 11.5 6.5 8 12 4.5z"
                      />
                    </svg>
                  </div>
                  <div class="flex-1">
                    <div
                      :class="[
                        'font-semibold text-sm',
                        isDarkMode ? 'text-white' : 'text-gray-900',
                      ]"
                    >
                      Bolt
                    </div>
                    <div
                      :class="[
                        'text-[10px]',
                        isDarkMode ? 'text-white/50' : 'text-gray-500',
                      ]"
                    >
                      เรียกรถโบลท์
                    </div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    :class="[
                      'w-5 h-5',
                      isDarkMode ? 'text-white/30' : 'text-gray-400',
                    ]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>

                <!-- Lineman -->
                <a
                  :href="`https://lineman.asia/taxi?dropoff_lat=${rideModalShop.lat}&dropoff_lng=${rideModalShop.lng}`"
                  target="_blank"
                  @click="rideModalShop = null"
                  :class="[
                    'flex items-center gap-3 p-3 rounded-xl transition-all duration-200',
                    isDarkMode
                      ? 'bg-white/5 hover:bg-white/10 active:scale-95'
                      : 'bg-gray-50 hover:bg-gray-100 active:scale-95',
                  ]"
                >
                  <div
                    class="w-10 h-10 rounded-xl bg-[#00B14F] flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-[#00B14F]/30"
                  >
                    L
                  </div>
                  <div class="flex-1">
                    <div
                      :class="[
                        'font-semibold text-sm',
                        isDarkMode ? 'text-white' : 'text-gray-900',
                      ]"
                    >
                      Lineman
                    </div>
                    <div
                      :class="[
                        'text-[10px]',
                        isDarkMode ? 'text-white/50' : 'text-gray-500',
                      ]"
                    >
                      เรียกรถไลน์แมน
                    </div>
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    :class="[
                      'w-5 h-5',
                      isDarkMode ? 'text-white/30' : 'text-gray-400',
                    ]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </transition>
        </div>
      </transition>

      <!-- Bottom Control Bar - simplified -->
      <div class="absolute bottom-3 left-3 z-[1000] pointer-events-none">
        <!-- LIVE Status Badge -->
        <div
          :class="[
            'pointer-events-auto px-3 py-2 rounded-full shadow-lg flex items-center gap-2 backdrop-blur-md border',
            isDarkMode
              ? 'bg-zinc-900/90 border-white/10'
              : 'bg-white/90 border-gray-200',
          ]"
        >
          <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span class="text-[10px] font-bold text-red-500 uppercase">LIVE</span>
          <span
            :class="[
              'text-[10px] font-medium',
              isDarkMode ? 'text-white/70' : 'text-gray-600',
            ]"
          >
            {{ liveCount }} ร้าน
          </span>
        </div>
      </div>
    </template>

    <!-- Detail Modal -->
    <transition name="fade">
      <VibeModal
        v-if="selectedShop"
        :shop="selectedShop"
        @close="selectedShop = null"
      />
    </transition>

    <!-- Loading Overlay -->
    <transition name="fade">
      <div
        v-if="isDataLoading"
        :class="[
          'absolute inset-0 z-[7000] flex items-center justify-center',
          isDarkMode ? 'bg-[#0b0d11]' : 'bg-gray-100',
        ]"
      >
        <div class="flex flex-col items-center">
          <div class="relative w-14 h-14 mb-6">
            <div
              :class="[
                'absolute inset-0 border-[3px] rounded-full',
                isDarkMode ? 'border-white/5' : 'border-gray-200',
              ]"
            ></div>
            <div
              class="absolute inset-0 border-[3px] border-red-600 rounded-full border-t-transparent animate-spin"
            ></div>
          </div>
          <p
            :class="[
              'font-black tracking-[0.4em] uppercase text-[10px] animate-pulse',
              isDarkMode ? 'text-white' : 'text-gray-700',
            ]"
          >
            Loading Vibes
          </p>
        </div>
      </div>
    </transition>

    <!-- Debug info -->
    <div
      v-if="false"
      class="fixed top-20 left-4 z-[9999] bg-black/80 text-white p-2 text-xs"
    >
      Theme: {{ isDarkMode ? "Dark" : "Light" }}<br />
      Shops: {{ shops.length }}<br />
      Live: {{ liveCount }}
    </div>
  </main>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

/* Modal Animations - Smooth & Beautiful */
.modal-fade-enter-active {
  transition: opacity 0.25s ease-out;
}
.modal-fade-leave-active {
  transition: opacity 0.2s ease-in;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-scale-enter-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-scale-leave-active {
  transition: all 0.2s ease-in;
}
.modal-scale-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(20px);
}
.modal-scale-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(10px);
}

/* Hide scrollbar but allow scrolling */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
</style>
