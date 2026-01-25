// --- C:\vibecity.live\src\App.vue ---

<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import PortalLayer from "./components/system/PortalLayer.vue";

const MapContainer = defineAsyncComponent(
  () => import("./components/map/MapboxContainer.vue"),
);

// ✅ Async load heavy components
const VideoPanel = defineAsyncComponent(
  () => import("./components/panel/VideoPanel.vue"),
);
const MallDrawer = defineAsyncComponent(
  () => import("./components/modal/MallDrawer.vue"),
);
const ProfileDrawer = defineAsyncComponent(
  () => import("./components/modal/ProfileDrawer.vue"),
);
const VibeModal = defineAsyncComponent(
  () => import("./components/modal/VibeModal.vue"),
);

// ✅ Enterprise MVP UI Components (Lazy loaded)
const BottomNav = defineAsyncComponent(
  () => import("./components/ui/BottomNav.vue"),
);
const SkeletonCard = defineAsyncComponent(
  () => import("./components/ui/SkeletonCard.vue"),
);
const ConfettiEffect = defineAsyncComponent(
  () => import("./components/ui/ConfettiEffect.vue"),
);
const OnboardingTour = defineAsyncComponent(
  () => import("./components/ui/OnboardingTour.vue"),
);
const PhotoGallery = defineAsyncComponent(
  () => import("./components/ui/PhotoGallery.vue"),
);
const DailyCheckin = defineAsyncComponent(
  () => import("./components/ui/DailyCheckin.vue"),
);
const LuckyWheel = defineAsyncComponent(
  () => import("./components/ui/LuckyWheel.vue"),
);
const AchievementBadges = defineAsyncComponent(
  () => import("./components/ui/AchievementBadges.vue"),
);
const Leaderboard = defineAsyncComponent(
  () => import("./components/ui/Leaderboard.vue"),
);
const ReferralShare = defineAsyncComponent(
  () => import("./components/ui/ReferralShare.vue"),
);
const SwipeCard = defineAsyncComponent(
  () => import("./components/ui/SwipeCard.vue"),
);
const VibeSkeleton = defineAsyncComponent(
  () => import("./components/ui/VibeSkeleton.vue"),
);
const VibeError = defineAsyncComponent(
  () => import("./components/ui/VibeError.vue"),
);
const VisitorCount = defineAsyncComponent(
  () => import("./components/ui/VisitorCount.vue"),
);
const SidebarDrawer = defineAsyncComponent(
  () => import("./components/ui/SidebarDrawer.vue"),
);

import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
// ✅ Composables
import { useHaptics } from "./composables/useHaptics";
import { useShopFilters } from "./composables/useShopFilters";
import { fetchRealTimeEvents } from "./services/eventService";
import { fetchRealTimeEvents } from "./services/eventService";
import { fetchShopData } from "./services/sheetsService";
import { usePerformance } from "./composables/usePerformance"; // ✅ Performance
import { useShopStore } from "./store/shopStore";
import { useUserStore } from "./store/userStore";
import {
  calculateDistance,
  calculateShopStatus,
  isGoldenTime,
} from "./utils/shopUtils";
import {
  loadFavoritesWithTTL,
  saveFavoriteItem,
  removeFavoriteItem,
} from "./utils/storageHelper";

const { t, locale } = useI18n();
const userStore = useUserStore();

const toggleLanguage = () => {
  const newLang = locale.value === "th" ? "en" : "th";
  locale.value = newLang;
  userStore.setLanguage(newLang);
  tapFeedback();
};

// ✅ Haptic feedback
const { tapFeedback, selectFeedback, successFeedback } = useHaptics();

// ใช้ CSV แบบ local ก่อน แล้วค่อยเปลี่ยนเป็น Google Sheets
const SHEET_CSV_URL = "/data/shops.csv";

// --- State Management (Pinia) ---
const shopStore = useShopStore();
const {
  rawShops,
  currentTime,
  activeShopId,
  activeCategories,
  activeStatus,
  isDataLoading,
  totalCoins,
  userLevel,
  nextLevelXP,
  levelProgress,
  rotationSeed,
  userLocation,
} = storeToRefs(shopStore);

const showConfetti = ref(false);

// ✅ userStore state (Centralized Preferences)
const { preferences } = storeToRefs(userStore);
const isDarkMode = computed(() => preferences.value.isDarkMode);

// --- Local UI State ---
const selectedShop = ref(null);
const mapRef = ref(null);
const isMobileView = ref(false);
const rideModalShop = ref(null);
const showCategoryDropdown = ref(false);
const favorites = ref([]); // ✅ Favorites list (ids)
const isPanelOpen = ref(true);

// ✅ Enterprise MVP State
const activeTab = ref("map"); // 'map' | 'events' | 'favorites' | 'profile'

// ✅ URL Sync Cleanup Watcher
watch(activeShopId, (newId) => {
  const url = new URL(window.location);
  if (newId) {
    url.searchParams.set("shop", newId);
    window.history.replaceState({}, "", url);
  } else {
    url.searchParams.delete("shop");
    window.history.replaceState({}, "", url);
  }
});
const realTimeEvents = ref([]); // ✅ Real-time events from API
const timedEvents = ref([]); // ✅ Dynamic events from events.json
const galleryImages = ref([]);
const isGalleryOpen = ref(false);
const dailyCheckinRef = ref(null);
const luckyWheelRef = ref(null);
const showSidebar = ref(false); // ✅ Replaces showProfileDrawer
const showProfileDrawer = ref(false); // Kept for compat if needed, synced
const errorMessage = ref(null); // ✅ Global error feedback for user

import {
  CheckCircle,
  ChevronDown,
  Coffee,
  Globe,
  Guitar,
  Languages,
  LocateFixed,
  Martini,
  Moon,
  Music,
  Search,
  ShoppingBag,
  Sun,
  User,
  Utensils,
  X,
  Menu, // ✅ Sidebar Icon
} from "lucide-vue-next";

// ✅ Landscape & Orientation Logic
const isLandscape = ref(false);
const checkOrientation = () => {
  isLandscape.value = window.innerWidth > window.innerHeight;
};
// Add listener in onMounted
onMounted(() => {
  window.addEventListener("resize", checkOrientation);
  checkOrientation();
});
onUnmounted(() => {
  window.removeEventListener("resize", checkOrientation);
});

// ✅ Performance Monitoring
const { initPerformanceMonitoring, isLowPowerMode } = usePerformance();
onMounted(() => {
    initPerformanceMonitoring();
});

let rotationInterval = null;

// ✅ FIXED: Robust FlyTo Logic with Validation
const smoothFlyTo = (targetCoords) => {
  if (!mapRef.value || !targetCoords) return;
  if (!Array.isArray(targetCoords) || targetCoords.length !== 2) return;

  // Validate coordinates (basic check for valid lat/lng ranges)
  const [lat, lng] = targetCoords;
  if (isNaN(lat) || isNaN(lng)) return;
  // Basic range check: Lat -90 to 90, Lng -180 to 180
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn("Invalid coordinates for flyTo:", targetCoords);
    return;
  }

  // Pre-calculate visual offsets
  const bottomPanelHeight = bottomUiRef.value?.offsetHeight || 0;

  // Create fly options
  const flyOptions = {
    center: [lng, lat], // Mapbox uses [lng, lat]
    zoom: 17.5,
    pitch: 45, // Cinematic pitch
    bearing: 0,
    speed: 0.5, // 0.8 -> 0.5 (Slower/Smoother)
    curve: 1.5, // 1.2 -> 1.5 (More gradual zoom)
    essential: true,
    padding: {
      // ✅ Balanced Padding: Centers the pin vertically in the viewport
      // allowing the popup (above pin) to sit comfortably in the upper half.
      bottom: isMobileView.value ? bottomPanelHeight + 40 : 50,
      top: isMobileView.value ? bottomPanelHeight + 40 : 50,
      left: isMobileView.value ? 20 : window.innerWidth * 0.35 + 20,
      right: 20,
    },
    maxDuration: 2500, // Cap duration for long flights
  };

  // Execute Fly
  // Mapbox GL expects map.flyTo({center, zoom, ...})
  if (mapRef.value.map && typeof mapRef.value.map.flyTo === "function") {
    mapRef.value.map.flyTo(flyOptions);
  } else if (typeof mapRef.value.flyTo === "function") {
    // If MapContainer exposes a wrapper flyTo(options)
    mapRef.value.flyTo(flyOptions);
  }
};

// ✅ Global Edge Swipe (Left) to Open Drawer
import { useEdgeSwipe } from "./composables/useGestures";

useEdgeSwipe(() => {
  showSidebar.value = true;
});

onMounted(() => {
  window.addEventListener("resize", checkMobileView);
  window.addEventListener("resize", measureBottomUi);
});

onUnmounted(() => {
  window.removeEventListener("touchstart", onGlobalTouchStart);
  window.removeEventListener("touchend", onGlobalTouchEnd);

  // ✅ remove listeners
  window.removeEventListener("resize", checkMobileView);
  window.removeEventListener("resize", measureBottomUi);

  // ✅ clear intervals
  if (timeInterval) clearInterval(timeInterval);
  if (rotationInterval) clearInterval(rotationInterval);

  // ✅ cleanup carousel listeners (only if handlers exist)
  const el = mobileCardScrollRef.value;
  if (el && typeof onScrollEnd === "function") {
    el.removeEventListener("touchend", onScrollEnd);
    el.removeEventListener("touchcancel", onScrollEnd);
    el.removeEventListener("mouseup", onScrollEnd);
    el.removeEventListener("mouseleave", onScrollEnd);
  }
});

// --- Global Identifiers & State ---
let timeInterval = null;

const openModalOnCardClick = ref(true);

const currentUserStats = ref({
  name: "Explorer",
  coins: 0,
  rank: 99,
  totalVisits: 0,
  liveVenuesVisited: 0,
  coinsCollected: 0,
  checkInStreak: 0,
  nightVisits: 0,
});

// ✅ Computeds

const selectedShopCoords = computed(() => {
  if (!activeShopId.value) return null;
  const shop = shops.value.find(
    (s) => Number(s.id) === Number(activeShopId.value),
  );
  return shop?.lat && shop.lng ? [shop.lat, shop.lng] : null;
});

// ✅ UI offsets for "visual center" (between top bar & bottom carousel)
const mapUiTopOffset = computed(() => {
  return 64;
});

/**
 * Computes the padding needed for the map based on the bottom carousel height on mobile.
 */
const mapUiBottomOffset = computed(() => {
  if (isMobileView.value) return bottomUiHeight.value;
  return 0;
});

// ✅ Mobile: VIBE NOW collapse state
const isVibeNowCollapsed = ref(false);
const toggleVibeNow = () => {
  isVibeNowCollapsed.value = !isVibeNowCollapsed.value;
};

const bottomUiRef = ref(null);
const bottomUiHeight = ref(0);

const measureBottomUi = () => {
  bottomUiHeight.value = bottomUiRef.value?.offsetHeight || 0;
};

// ✅ Mobile: VIBE NOW collapse state

const showMallDrawer = ref(false);
// เมื่อ UI ล่างเปลี่ยน (เช่น collapse/expand, modal ขึ้น)
watch([isVibeNowCollapsed, showMallDrawer, rideModalShop], () => {
  nextTick(measureBottomUi);
});

// ✅ Navigation Legend height tracking
const legendHeight = ref(0);
const handleLegendHeightChange = (height) => {
  legendHeight.value = height;
};

// --- Zone & Building Navigation State ---
const buildingsData = ref({});
const activeZone = ref(null);
const activeBuilding = ref(null);

// ✅ MOCK EVENTS DATA (To be replaced by API later)
const mockEvents = {
  oneNimman: {
    id: "event-onenimman-01",
    buildingId: "oneNimman",
    name: "Chiang Mai Food Festival 2024",
    shortName: "Food Fest",
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=1000&auto=format&fit=crop",
    video: "https://www.w3schools.com/html/mov_bbb.mp4", // Placeholder
    description:
      "ที่สุดของมหกรรมอาหารเหนือและสตรีทฟู้ดร้านดังกว่า 50 ร้าน พร้อมดนตรีสดตลอดคืน!",
    startTime: "2024-01-01T10:00:00", // Long running for demo
    endTime: "2030-12-31T22:00:00",
    status: "LIVE",
    highlights: [
      {
        type: "image",
        src: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1",
      },
      {
        type: "image",
        src: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38",
      },
    ],
    zones: [
      {
        title: "Street Food Zone",
        description: "รวมร้านเด็ดเชียงใหม่",
        image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
      },
      {
        title: "Craft Beer Garden",
        description: "เบียร์คราฟต์ไทย",
        image: "https://images.unsplash.com/photo-1575037614876-c38a4d44f5b8",
      },
    ],
    timeline: [
      { time: "17:00", activity: "Opening Ceremony" },
      { time: "18:30", activity: "Live Band: The Yers" },
      { time: "20:00", activity: "DJ Stage" },
    ],
  },
  maya: {
    id: "event-maya-01",
    buildingId: "maya",
    name: "MAYA Rooftop Cinema",
    shortName: "Rooftop Cinema",
    image:
      "https://images.unsplash.com/photo-1517604931442-710c8ef5ad25?q=80&w=1000",
    description: "ดูหนังกลางแปลงบนดาดฟ้า บรรยากาศสุดชิล",
    startTime: "2024-01-01T18:00:00",
    endTime: "2025-12-31T23:00:00",
    status: "UPCOMING",
  },
  // Others have no events -> No Giant Pin
};

// ✅ SEO & Metadata Management
/**
 * Updates the page title and meta description reactively.
 */
const updateMetadata = () => {
  const baseTitle = "VibeCity.live | Local Entertainment Map";
  const selectedShopName = selectedShop.value?.name;
  const activeCat = activeCategories.value[0];

  if (selectedShopName) {
    document.title = `${selectedShopName} - VibeCity.live`;
  } else if (activeCat) {
    document.title = `${activeCat} in Chiang Mai - VibeCity.live`;
  } else {
    document.title = baseTitle;
  }

  // Update OG/Meta description (simulated tag update)
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.setAttribute(
      "content",
      selectedShopName
        ? `Check out ${selectedShopName} on VibeCity.live - Your Chiang Mai entertainment guide.`
        : "Explore Chiang Mai's best cafes, bars, and clubs with real-time vibe updates.",
    );
  }
};

watch(() => [activeShopId.value, activeCategories.value], updateMetadata, {
  immediate: true,
});

/**
 * Fetches real-time events from the API and local sources.
 */
const updateEventsData = async () => {
  try {
    const events = await fetchRealTimeEvents();
    realTimeEvents.value = events;
  } catch (err) {
    console.warn("Real-time events sync failed:", err.message);
    // Fallback logic handled by service returning empty list
  }
};

// ✅ Computed: Active Events
// Returns buildings object but decorated with event data IF event is active
const activeEvents = computed(() => {
  const result = [];
  if (!buildingsData.value) return [];

  const now = currentTime.value;

  // 1. Process mockEvents (Fixed buildings with events)
  Object.keys(mockEvents).forEach((key) => {
    const building = buildingsData.value[key];
    const event = mockEvents[key];
    if (building && event) {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      if (now >= start && now <= end) {
        result.push({
          ...building,
          ...event,
          key: key,
          isEvent: true,
        });
      }
    }
  });

  // 2. Process timedEvents (from events.json)
  if (Array.isArray(timedEvents.value)) {
    timedEvents.value.forEach((event) => {
      const start = new Date(event.startTime || event.date);
      const end = new Date(
        event.endTime || new Date(new Date(event.date).getTime() + 86400000),
      );
      if (now >= start && now <= end) {
        result.push({
          ...event,
          key: event.id,
          isEvent: true,
        });
      }
    });
  }

  // 3. Process realTimeEvents (from API)
  if (Array.isArray(realTimeEvents.value)) {
    realTimeEvents.value.forEach((event) => {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);
      if (now >= start && now <= end) {
        result.push({
          ...event,
          key: event.id,
          isEvent: true,
        });
      }
    });
  }

  return result;
});

// Indoor/Mall Navigation State (Simplified/Legacy)
const activeFloor = ref("GF");
const showFloorSelector = ref(false);
const isIndoorView = ref(false);

/**
 * Handles entering indoor mode for a building.
 * @param {Object} building - The building data object.
 */
const handleEnterIndoor = (building) => {
  isIndoorView.value = true;
  activeBuilding.value = building;
  showFloorSelector.value = true;
  activeFloor.value = "GF";
};

// ✅ Mall Drawer State
const activeMall = computed(() => activeBuilding.value);
const mallShops = computed(() => {
  if (!activeMall.value) return [];
  // Filter shops that belong to this building
  // Ensure comparsion is robust (string/number, trimmed, case-insensitive)
  const targetKey = String(activeMall.value.key || "")
    .trim()
    .toLowerCase();
  return shops.value.filter((s) => {
    const shopBuilding = String(s.Building || "")
      .trim()
      .toLowerCase();
    return shopBuilding === targetKey;
  });
});

// ✅ Watch activeBuilding to open drawer (User Request: Click Giant Pin -> Drawer)
watch(activeBuilding, (newVal) => {
  if (newVal) {
    showMallDrawer.value = true;
  }
});

const handleBuildingOpen = (building) => {
  activeBuilding.value = building;
};

// ✅ Global Search State
const globalSearchQuery = ref("");
const showSearchResults = ref(false);
const globalSearchResults = computed(() => {
  if (!globalSearchQuery.value || globalSearchQuery.value.length < 2) return [];

  // Emoji Search Mapping
  const emojiMap = {
    "☕": "cafe",
    "🍽️": "restaurant",
    "🍜": "food",
    "🍺": "bar",
    "🍷": "wine",
    "💃": "club",
    "🎵": "live music",
    "🎨": "art",
    "🛍️": "fashion",
    "🏢": "mall",
  };

  let searchQuery = globalSearchQuery.value.toLowerCase();
  for (const [emoji, term] of Object.entries(emojiMap)) {
    if (searchQuery.includes(emoji)) {
      searchQuery = searchQuery.replace(emoji, term);
    }
  }

  const q = searchQuery;

  // Search in ALL shops
  const matches = shops.value.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.category || "").toLowerCase().includes(q),
  );

  // Sort by Distance (avoid mutating original reactive objects)
  if (userLocation.value) {
    const [uLat, uLng] = userLocation.value;
    return matches
      .map((s) => ({
        ...s,
        distance:
          s.lat && s.lng
            ? calculateDistance(uLat, uLng, s.lat, s.lng)
            : Infinity,
      }))
      .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))
      .slice(0, 10);
  }

  return matches.slice(0, 10);
});

const handleGlobalSearchSelect = (shop) => {
  handleMarkerClick(shop);
  globalSearchQuery.value = "";
  showSearchResults.value = false;
};

// ✅ NEW: Province focus state
const activeProvince = ref(null);

// ✅ Geolocation settings
const locationPermissionDenied = ref(false);
const maxNearbyDistance = 5; // km (reverted from 3km)
const maxNearbyMarkers = 30;

// ✅ calculateDistance moved to utils/shopUtils.js

const requestGeolocation = () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation.value = [pos.coords.latitude, pos.coords.longitude];
    },
    () => {
      locationPermissionDenied.value = true;
      userLocation.value = [18.7883, 98.9853]; // Fallback
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
  );
};

// ✅ Open Ride App Selection Modal
const openRideModal = (shop) => {
  rideModalShop.value = shop;
};

const closeRideModal = () => {
  rideModalShop.value = null;
};

const openRideApp = (appName) => {
  if (!rideModalShop.value) return;
  const { lat, lng, name } = rideModalShop.value;

  let url = "";
  switch (appName) {
    case "grab":
      url = `https://grab.onelink.me/2695613898?af_dp=grab%3A%2F%2Fopen%3FdropOffLatitude%3D${lat}%26dropOffLongitude%3D${lng}%26dropOffName%3D${encodeURIComponent(name)}`;
      break;
    case "lineman":
      url = `https://lineman.page.link/?link=https://lineman.page.link/ride?dropoff_lat%3D${lat}%26dropoff_lng%3D${lng}&apn=th.co.lineman&isi=1080952492&ibi=th.co.lineman`;
      break;
    case "bolt":
      url = `https://bolt.eu/en/order/?destination=${lat},${lng}`;
      break;
    default:
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  window.open(url, "_blank");
  closeRideModal();
};

// Theme State - Managed by userStore
const toggleTheme = () => {
  userStore.toggleDarkMode();
  tapFeedback();
};

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

const { filteredShops } = useShopFilters(
  shops,
  activeCategories,
  activeStatus,
  activeShopId,
);

// ✅ Smart Rotation Logic: 30 Random Shops every 30 mins
const localNearbyShops = computed(() => {
  if (!filteredShops.value) return [];
  if (!userLocation.value) return filteredShops.value; // Fallback: show all if no location

  const [userLat, userLng] = userLocation.value;
  let candidates = filteredShops.value.map((shop, _idx) => ({
    ...shop,
    distance: calculateDistance(userLat, userLng, shop.lat, shop.lng),
    // Stable random sort key based on seed + shop ID
    randomKey: (shop.id + rotationSeed.value * 1103515245) % 12345,
  }));

  // Logic:
  // 1. If explicit category/search active -> Show ALL matches (no limit)
  // 2. If general view -> Show max 30 randomized shops
  const isDefaultView =
    activeCategories.value.length === 0 && activeStatus.value === "ALL";

  if (isDefaultView) {
    // Separate LIVE/Important shops to ensuring they appear
    const liveShops = candidates.filter(
      (s) => s.status === "LIVE" || s.Status === "LIVE",
    );
    const normalShops = candidates.filter(
      (s) => s.status !== "LIVE" && s.Status !== "LIVE",
    );

    // Sort normal shops randomly using seed
    normalShops.sort((a, b) => a.randomKey - b.randomKey);

    // Combine: LIVE first, then random normal shops, limit to 30
    const selection = [...liveShops, ...normalShops].slice(0, 30);
    candidates = selection;
  }

  // Final Sort for Display: LIVE first, then Distance
  candidates.sort((a, b) => {
    const aIsLive = a.status === "LIVE" || a.Status === "LIVE";
    const bIsLive = b.status === "LIVE" || b.Status === "LIVE";
    if (aIsLive && !bIsLive) return -1;
    if (!aIsLive && bIsLive) return 1;

    // Stable distance sort with null fallback
    const distA = a.distance ?? 9999;
    const distB = b.distance ?? 9999;
    return distA - distB;
  });

  return candidates;
});

const carouselShops = computed(() => {
  const nearby = localNearbyShops.value || [];
  const activeId = Number(activeShopId.value);

  if (activeId) {
    const activeShop = (shops.value || []).find(
      (s) => Number(s.id) === activeId,
    );
    if (activeShop && !nearby.some((s) => Number(s.id) === activeId)) {
      return [...nearby.slice(0, 29), activeShop];
    }
  }
  return nearby.slice(0, 30);
});

// ✅ Phase 5 Refine: Suggested Venues for empty state
const suggestedShops = computed(() => {
  // Recommend 3 LIVE or popular shops
  return shops.value.filter((s) => s.status === "LIVE").slice(0, 3);
});

// --- Selective Integration Actions ---
const handleSwipe = (direction, shop) => {
  if (direction === "left") {
    handleMarkerClick(shop);
  } else if (direction === "right") {
    openRideModal(shop);
  }
};

const triggerConfetti = () => {
  showConfetti.value = true;
  successFeedback();
  setTimeout(() => {
    showConfetti.value = false;
  }, 3000);
};

// --- Computed Properties ---
/**
 * Bootstraps the application data and state.
 * Handles theme coordination, favorite persistence, and multi-source data sync.
 */
onMounted(async () => {
  isDataLoading.value = true;
  errorMessage.value = null;

  try {
    checkMobileView();
    window.addEventListener("resize", checkMobileView);

    // Sync persistent user settings
    locale.value = userStore.preferences.language;

    // ✅ Load favorites with TTL (10 days)
    favorites.value = loadFavoritesWithTTL();

    // Initial measurement
    nextTick(measureBottomUi);
    window.addEventListener("resize", measureBottomUi);

    // ✅ Start Intervals (Unified)
    // ✅ Start Intervals (Unified) - Robust 30m Refresh
    let lastRefreshSlot = -1;
    timeInterval = setInterval(() => {
      currentTime.value = new Date();

      // Calculate 30-minute slot ID (e.g., 20260125-10-0, 20260125-10-1)
      const currentSlot = Math.floor(currentTime.value.getMinutes() / 30);

      if (
        currentTime.value.getMinutes() % 30 === 0 &&
        currentSlot !== lastRefreshSlot
      ) {
        lastRefreshSlot = currentSlot; // Mark this slot as handled
        updateEventsData();
        fetchShopData(SHEET_CSV_URL)
          .then((d) => {
            rawShops.value = d;
          })
          .catch(() => {});
      }
    }, 60000);

    rotationInterval = setInterval(() => {
      shopStore.refreshRotation();
    }, 60000);

    // ✅ Load user stats
    const savedCoins = localStorage.getItem("vibecity_total_coins");
    if (savedCoins) {
      currentUserStats.value.coinsCollected = parseInt(savedCoins) || 0;
      currentUserStats.value.coins = parseInt(savedCoins) || 0;
    }

    // Concurrent Data Fetching
    const [shopsData] = await Promise.all([
      fetchShopData(SHEET_CSV_URL),
      updateEventsData(),
      fetch("/data/buildings.json")
        .then((r) => r.json())
        .then((d) => {
          buildingsData.value = d;
        })
        .catch(() => {}),
      fetch("/data/events.json")
        .then((r) => r.json())
        .then((d) => {
          timedEvents.value = d;
        })
        .catch(() => {}),
    ]);

    rawShops.value = shopsData;
    requestGeolocation();

    // ✅ Deep Link Support: Check for ?shop=ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shopIdParam = urlParams.get("shop");
    if (shopIdParam) {
      // Small delay to ensure everything is rendered
      setTimeout(() => {
        applyShopSelection(Number(shopIdParam));
      }, 1500);
    }
  } catch (err) {
    console.error("Critical app initialization failure:", err);
    errorMessage.value =
      "Unable to connect to VibeCity services. Please check your internet connection.";
  } finally {
    setTimeout(() => {
      isDataLoading.value = false;
    }, 800);
  }
});

const checkMobileView = () => {
  isMobileView.value = window.innerWidth < 768;
};

const handleLocateMe = () => {
  selectFeedback();
  if (mapRef.value && userLocation.value) {
    mapRef.value.focusLocation(userLocation.value, 17);
  }
};

// --- Favorites System ---
const toggleFavorite = (shopId) => {
  const id = Number(shopId);
  const index = favorites.value.indexOf(id);
  if (index === -1) {
    favorites.value.push(id);
    saveFavoriteItem(id);
    successFeedback();
  } else {
    favorites.value.splice(index, 1);
    removeFavoriteItem(id);
    selectFeedback();
  }
};

const isFavorited = (shopId) => {
  return favorites.value.includes(Number(shopId));
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
  if (!shop) {
    activeShopId.value = null;
    return;
  }

  selectFeedback();

  // Toggle: clicking same marker closes it
  if (activeShopId.value == shop.id) {
    activeShopId.value = null;
    return;
  }

  // Trigger unified selection logic (map fly + carousel sync + building detect)
  applyShopSelection(shop.id);
};

// Close floor selector - exit indoor view but keep selected shop (DEPRECATED but keeping simplified)
/**
 * Logic to close floor selectors or building-specific drawers.
 * Refocuses the map on the currently active shop if it exists.
 */
const handleCloseFloorSelector = () => {
  isIndoorView.value = false;
  showFloorSelector.value = false;
  activeBuilding.value = null;

  // ✅ Focus back on the currently active shop if exists
  const currentShop = shops.value.find((s) => s.id == activeShopId.value);
  if (currentShop && mapRef.value) {
    mapRef.value.focusLocation([currentShop.lat, currentShop.lng], 17);
  }
};

const handleFloorSelect = (_floor) => {
  console.log("Floor selection deprecated");
};

// ... existing code ...

/**
 * Detects if a shop belongs to a building and triggers the building-specific UI (Mall Drawer).
 * Standardizes centering, map focus, and state updates for a unified selected shop experience.
 */
const applyShopSelection = (shopId) => {
  if (!shopId) return;

  activeShopId.value = shopId;
  const shop = shops.value.find((s) => Number(s.id) === Number(shopId));
  if (!shop) return;

  // Update context
  activeProvince.value = shop.Province || "เชียงใหม่";
  activeZone.value = shop.Zone || null;

  // 1. Focus Map with optimized center offset
  if (mapRef.value && shop.lat && shop.lng) {
    smoothFlyTo([shop.lat, shop.lng]);
  }

  // 2. Sync Carousel scroll (เรียกใช้ฟังก์ชันใหม่ scrollToCard)
  if (isMobileView.value) {
    scrollToCard(shopId);
  }

  // 3. Detect Building/Mall context
  const buildingKey = shop.Building;
  const buildingRaw = buildingKey ? buildingsData.value[buildingKey] : null;

  if (buildingRaw) {
    activeBuilding.value = { ...buildingRaw, key: buildingKey };
    showMallDrawer.value = true;
  } else {
    activeBuilding.value = null;
  }
};

const handleCardHover = (shop) => {
  applyShopSelection(shop.id);
};

// ==========================================
// ✅ UNIFIED SCROLL ENGINE (Clean & Fix Duplicates)
// ==========================================

// --- ⚙️ SCROLL & STATE MANAGEMENT (Enterprise Grade) ---

const mobileCardScrollRef = ref(null);
const isUserScrolling = ref(false); // เช็คว่า User กำลังเอานิ้วไถอยู่ไหม
const isProgrammaticScroll = ref(false); // เช็คว่า App กำลังเลื่อนให้เองไหม (เช่น กดจาก Map)

let scrollTimeout = null; // สำหรับจับว่า User หยุดเลื่อนหรือยัง
let ticking = false; // สำหรับ rAF Throttle (Performance)

const handleSearchBlur = () => {
  setTimeout(() => {
    showSearchResults.value = false;
  }, 200);
};

// Debug-only helper (keep in component, but only render the button in DEV)
const triggerError = () => {
  throw new Error("Sentry test error");
};

// Optional: carousel drag start/end hooks referenced in template
const onScrollStart = () => {
  isUserScrolling.value = true;
};
const onScrollEnd = () => {
  // Let debounce in handleHorizontalScroll settle; just mark as not actively dragging
  isUserScrolling.value = false;
};

const handleOpenDetail = (shop) => {
  selectFeedback();
  selectedShop.value = shop;
};

// 1. 🎯 ฟังก์ชันหา ID การ์ดที่อยู่ตรงกลางจอ (Precision Logic)
const getCenteredCardId = () => {
  const container = mobileCardScrollRef.value;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const containerCenter = containerRect.left + containerRect.width / 2;

  // ค้นหาเฉพาะการ์ดที่มี data-shop-id
  const cards = container.querySelectorAll("[data-shop-id]");
  let closestCard = null;
  let minDiff = Infinity;

  // Loop หาการ์ดที่ใกล้เส้นกลางที่สุด
  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const cardCenter = cardRect.left + cardRect.width / 2;
    const diff = Math.abs(containerCenter - cardCenter);

    // Threshold: ต้องใกล้กว่า 100px ถึงจะนับ (ลดความผิดพลาด)
    if (diff < minDiff && diff < 100) {
      minDiff = diff;
      closestCard = card;
    }
  });

  return closestCard ? Number(closestCard.getAttribute("data-shop-id")) : null;
};

// 2. 🤖 ฟังก์ชันสั่งเลื่อนการ์ดไปตรงกลาง (Programmatic Scroll)
const scrollToCard = (shopId) => {
  const container = mobileCardScrollRef.value;
  if (!container || !shopId) return;

  const card = container.querySelector(`[data-shop-id="${shopId}"]`);
  if (!card) return;

  // ✅ Check 1: ถ้าการ์ดอยู่ตรงกลางอยู่แล้ว ไม่ต้องเลื่อน (กันกระตุก)
  const currentCenterId = getCenteredCardId();
  if (currentCenterId === Number(shopId)) return;

  // ✅ Lock System: บอกว่า "ระบบกำลังทำงาน User ห้ามยุ่ง"
  isProgrammaticScroll.value = true;

  // Clear Timeout เก่าทิ้ง
  if (scrollTimeout) clearTimeout(scrollTimeout);

  const containerWidth = container.clientWidth;
  const cardLeft = card.offsetLeft;
  const cardWidth = card.offsetWidth;

  // สูตรคำนวณตำแหน่งกึ่งกลางเป๊ะๆ
  const targetScroll = cardLeft - containerWidth / 2 + cardWidth / 2;

  container.scrollTo({
    left: targetScroll,
    behavior: "smooth",
  });

  // ✅ Unlock: ปลดล็อคเมื่อ Animation น่าจะจบแล้ว (800ms)
  scrollTimeout = setTimeout(() => {
    isProgrammaticScroll.value = false;
  }, 800);
};

// 3. 🖐️ Main Scroll Listener (ทำงานตอน User ไถหน้าจอ)
const handleHorizontalScroll = () => {
  // ⛔️ ถ้าโปรแกรมสั่งเลื่อนอยู่ ห้ามคำนวณแทรก (สำคัญมาก)
  if (isProgrammaticScroll.value) return;

  // บอกว่า User กำลังเลื่อน
  isUserScrolling.value = true;

  // Debounce: จับว่า User หยุดเลื่อนหรือยัง
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isUserScrolling.value = false;
  }, 150); // 150ms หลังหยุดไถ ถือว่าหยุดจริง

  // ⚡️ Performance: ใช้ requestAnimationFrame ลดภาระ CPU
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const centerId = getCenteredCardId();

      // ถ้าเจอ ID ใหม่ และไม่ใช่ ID ปัจจุบัน
      if (centerId && centerId !== Number(activeShopId.value)) {
        // อัปเดตค่า (แต่ Watcher จะไม่สั่ง Scroll กลับ เพราะติดเงื่อนไข isUserScrolling)
        activeShopId.value = centerId;

        // Sync กับ Map (แต่ไม่ต้อง Focus รุนแรง แค่ Pan ไปหา)
        const shop = shops.value.find((s) => Number(s.id) === Number(centerId));
        if (shop && mapRef.value) {
          smoothFlyTo([shop.lat, shop.lng]);
          // selectFeedback(); // (Optional) สั่นเมื่อเลื่อนผ่านการ์ด
        }
      }
      ticking = false;
    });
    ticking = true;
  }
};

// 4. 👀 Watcher: คอยดูการเปลี่ยนแปลง ID (เช่น กดจาก Map / Search / หรือเลื่อนเสร็จแล้ว)
watch(activeShopId, (newId) => {
  // ✅ Update URL (ย้ายมาตรงนี้เพื่อให้ URL เปลี่ยนเสมอไม่ว่าจะเกิดจากอะไร)
  if (newId) {
    const url = new URL(window.location);
    url.searchParams.set("shop", newId);
    window.history.replaceState({}, "", url);
  }

  // ⛔️ ถ้า User กำลังไถมืออยู่ ห้ามสั่ง Scroll สวนทาง
  if (isUserScrolling.value) return;

  // ⛔️ ถ้าโปรแกรมสั่ง Scroll อยู่แล้ว ก็ไม่ต้องสั่งซ้ำ
  if (isProgrammaticScroll.value) return;

  if (newId) {
    nextTick(() => {
      // เช็คอีกรอบว่าต้องเลื่อนไหม (Double Check)
      const currentCenter = getCenteredCardId();
      if (currentCenter !== Number(newId)) {
        scrollToCard(newId);
      }
    });
  }
});

// 5. 👆 Handle Click บนการ์ด
const handleCardClick = (shop) => {
  if (!shop) return;

  // Force Stop User Interaction Flag
  isUserScrolling.value = false;

  // 1. อัปเดต ID
  activeShopId.value = shop.id;

  // 2. สั่งเลื่อนการ์ดทันที (Programmatic)
  scrollToCard(shop.id);

  // 3. Sync Map
  if (mapRef.value && shop.lat && shop.lng) {
    smoothFlyTo([shop.lat, shop.lng]);
  }

  // 3.5 Capture Video Time (Cinematic Sync)
  // Try to find the video element in the active card
  const videoEl = document.querySelector(
    `div[data-shop-id="${shop.id}"] video`,
  );
  if (videoEl) {
    shop.initialTime = videoEl.currentTime;
  }

  // 4. เปิด Modal รายละเอียด
  selectedShop.value = shop;
};

// Live count
const liveCount = computed(() => {
  return shops.value.filter((s) => s.status === "LIVE").length;
});

const isDev = import.meta.env.DEV;
</script>

<template>
  <main
    :class="[
      'relative w-full h-[100dvh] overflow-hidden font-sans transition-colors duration-500',
      isDarkMode ? 'bg-[#0b0d11]' : 'bg-gray-100',
      { 'low-power': isLowPowerMode },
    ]"
  >
    <!-- ✅ Global Error State -->
    <VibeError
      v-if="errorMessage"
      :message="errorMessage"
      @retry="() => window.location.reload()"
    />

    <!-- ✅ Loading State (Initial) -->
    <div
      v-if="isDataLoading && !realTimeEvents.length"
      class="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl"
    >
      <div class="flex flex-col items-center gap-4">
        <VibeSkeleton variant="circle" height="60px" width="60px" />
        <VibeSkeleton variant="text" height="20px" width="150px" />
      </div>
    </div>
    <!-- ✅ Sidebar Drawer Overlay -->
    <div v-testid="'drawer-shell'">
      <SidebarDrawer
        :is-open="showSidebar"
        :user-stats="{
          name: 'Vibe Explorer',
          level: userLevel,
          coins: totalCoins,
          avatar: null,
        }"
        @close="showSidebar = false"
        @navigate="
          (id) => {
            if (['nightlife', 'cafe', 'fashion', 'events'].includes(id)) {
              activeCategories = [id.charAt(0).toUpperCase() + id.slice(1)];
              if (id === 'events') activeTab = 'events';
            }
          }
        "
      />
    </div>

    <!-- ✅ Smart Header (Glassmorphic) -->
    <div
      data-testid="header"
      class="fixed top-0 left-0 right-0 z-[5000] flex flex-col pointer-events-none transition-transform duration-300"
      :class="isVibeNowCollapsed ? '-translate-y-full' : 'translate-y-0'"
    >
      <!-- Top Row: Hamburger + Search + Profile -->
      <div class="flex items-center gap-3 px-4 pt-4 pb-2">
        <!-- Hamburger -->
        <button
          data-testid="btn-menu"
          @click="
            showSidebar = true;
            tapFeedback();
          "
          class="h-10 w-10 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white shadow-lg pointer-events-auto active:scale-90 transition-all flex-shrink-0"
        >
          ≡
          <Menu class="w-5 h-5" />
        </button>

        <!-- Search Bar (Unobtrusive) -->
        <div class="flex-1 pointer-events-auto">
          <div
            class="flex items-center h-10 px-3 rounded-full backdrop-blur-xl border shadow-lg transition-all duration-300 group focus-within:ring-2 focus-within:ring-blue-500/50 bg-black/30 border-white/10"
          >
            <Search
              class="w-4 h-4 text-white/50 group-focus-within:text-blue-400 mr-2"
            />
            <input
              data-testid="search-input"
              v-model="globalSearchQuery"
              @focus="showSearchResults = true"
              @blur="handleSearchBlur"
              type="text"
              :placeholder="t('nav.search')"
              class="w-full bg-transparent outline-none text-xs font-bold text-white placeholder-white/40"
            />
            <button
              v-if="globalSearchQuery"
              @click="globalSearchQuery = ''"
              class="text-white/40 hover:text-white"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Profile / Stats Mini -->
        <div
          @click="
            showSidebar = true;
            tapFeedback();
          "
          class="h-10 px-3 flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg pointer-events-auto cursor-pointer active:scale-95 transition-all"
        >
          <div
            class="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[8px] font-black text-white shadow shadow-blue-500/50"
          >
            {{ userLevel }}
          </div>
          <div class="flex flex-col items-end">
            <span class="text-[8px] font-black text-yellow-400">
              {{ totalCoins }} 🪙
            </span>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Category Pills (Smart Rail) -->
      <div
        class="w-full overflow-x-auto no-scrollbar pointer-events-auto px-4 pb-4"
      >
        <div class="flex items-center gap-2 min-w-max">
          <button
            v-for="cat in ['ALL', 'Nightlife', 'Cafe', 'Fashion', 'Events']"
            :key="cat"
            @click="
              activeCategories = cat === 'ALL' ? [] : [cat];
              selectFeedback();
            "
            :class="[
              'h-8 px-4 rounded-full backdrop-blur-md border text-[10px] font-black uppercase tracking-widest transition-all active:scale-90 flex items-center gap-1.5 shadow-lg',
              (cat === 'ALL' && activeCategories.length === 0) ||
              activeCategories.includes(cat)
                ? 'bg-blue-600/90 border-blue-400 text-white shadow-blue-600/30'
                : 'bg-black/30 border-white/10 text-white/70 hover:bg-white/10',
            ]"
          >
            <span
              v-if="
                (cat === 'ALL' && activeCategories.length === 0) ||
                activeCategories.includes(cat)
              "
              class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"
            ></span>
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Search Results Dropdown -->
      <transition name="dropdown-fade">
        <div
          v-if="showSearchResults && globalSearchResults.length > 0"
          class="mx-4 mt-1 rounded-2xl shadow-2xl border overflow-hidden max-h-[50vh] overflow-y-auto backdrop-blur-3xl animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto bg-black/80 border-white/10"
        >
          <div
            v-for="shop in globalSearchResults"
            :key="shop.id"
            @click="handleGlobalSearchSelect(shop)"
            class="flex items-center gap-3 p-3 cursor-pointer border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
          >
            <div
              class="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0"
            >
              <img
                v-if="shop.Image_URL1"
                :src="shop.Image_URL1"
                class="w-full h-full object-cover"
              />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="text-xs font-bold text-white truncate">
                {{ shop.name }}
              </h4>
              <span class="text-[10px] text-white/50">{{ shop.category }}</span>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- ✅ Landscape Wrapper -->
    <div
      class="relative w-full h-full transition-all duration-500"
      :class="isLandscape ? 'grid grid-cols-[60%_40%]' : ''"
    >
      <!-- Desktop Layout: Map (65%) + Panel (35%) -->
      <div
        v-if="!isMobileView && !isLandscape"
        class="grid grid-cols-[65%_35%] h-full"
      >
        <!-- Map Container -->
        <div v-testid="'map-shell'" class="relative">
          <MapContainer
            ref="mapRef"
            :uiTopOffset="mapUiTopOffset"
            :uiBottomOffset="mapUiBottomOffset"
            :shops="filteredShops"
            :userLocation="userLocation"
            :currentTime="currentTime"
            :highlightedShopId="activeShopId"
            :is-low-power-mode="isLowPowerMode"
            :isDarkMode="isDarkMode"
            :activeZone="activeZone"
            :activeProvince="activeProvince"
            :buildings="activeEvents"
            :is-sidebar-open="isPanelOpen"
            :selectedShopCoords="selectedShopCoords"
            @select-shop="handleMarkerClick"
            @open-detail="handleOpenDetail"
            @open-ride-modal="openRideModal"
            @exit-indoor="handleCloseFloorSelector"
            @open-building="handleBuildingOpen"
          />

          <!-- Navigation Legend (Desktop) -->
          <div
            v-if="!isMobileView"
            class="absolute top-4 right-4 z-[2000] flex flex-col gap-2"
          >
            <div
              class="bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-2xl"
            >
              <h4
                class="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2"
              >
                {{ t("legend.title") }}
              </h4>
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                  ></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.live_now")
                  }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.coin_reward")
                  }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.selected")
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Floor Selector Popup - Moved outside for better z-index control -->
          <transition name="fade">
            <div
              v-if="showFloorSelector"
              class="absolute bottom-6 inset-x-0 mx-auto w-fit z-[3000]"
            >
              <div
                class="bg-zinc-900/90 backdrop-blur-2xl border border-white/20 rounded-2xl p-1.5 flex items-center gap-1.5 shadow-2xl ring-1 ring-black/50"
              >
                <button
                  v-for="fl in ['4F', '3F', '2F', '1F', 'GF', 'B1']"
                  :key="fl"
                  @click="activeFloor = fl"
                  :class="[
                    'px-4 py-2 rounded-xl text-xs font-black transition-all active:scale-90',
                    activeFloor === fl
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-white/40 hover:text-white hover:bg-white/5',
                  ]"
                >
                  {{ fl }}
                </button>
                <div class="w-px h-6 bg-white/10 mx-1"></div>
                <button
                  @click="handleCloseFloorSelector"
                  class="w-10 h-10 rounded-xl bg-white/5 text-white/60 hover:text-white flex items-center justify-center transition-all"
                >
                  ✕
                </button>
              </div>
            </div>
          </transition>
        </div>

        <!-- Video Panel -->
        <VideoPanel
          ref="panelRef"
          :shops="filteredShops"
          :activeShopId="activeShopId"
          :isDarkMode="isDarkMode"
          :favorites="favorites"
          @scroll-to-shop="handlePanelScroll"
          @select-shop="handleCardClick"
          @open-detail="handleOpenDetail"
          @hover-shop="handleCardHover"
          @toggle-favorite="toggleFavorite"
        />
      </div>

      <!-- Mobile Layout: Full Map + Small Floating Button -->
      <!-- ✅ Landscape Mobile Layout (YouTube Style) -->
      <div
        v-if="isMobileView && isLandscape"
        data-testid="video-layout-landscape"
        class="contents"
      >
        <!-- Left: Map (60%) -->
        <div
          v-testid="'map-shell'"
          class="relative h-full border-r border-white/10 overflow-hidden"
        >
          <MapContainer
            ref="mapRef"
            :shops="shops"
            :active-shop-id="activeShopId"
            :is-dark-mode="isDarkMode"
            :ui-bottom-offset="0"
            @select-shop="handleMarkerClick"
          />
        </div>

        <!-- Right: Feed (40%) -->
        <div class="h-full bg-black overflow-y-auto no-scrollbar relative">
          <div class="p-4 pt-16 grid grid-cols-1 gap-4">
            <SwipeCard
              v-for="shop in shops.slice(0, 10)"
              :key="`land-${shop.id}`"
              :show-expand="false"
              class="w-full aspect-[9/16] rounded-xl overflow-hidden shadow-lg border border-white/10"
              @click="handleOpenDetail(shop)"
            >
              <img :src="shop.Image_URL1" class="w-full h-full object-cover" />
              <div
                class="absolute bottom-4 left-4 font-bold text-white uppercase shadow-black drop-shadow-md"
              >
                {{ shop.name }}
              </div>
            </SwipeCard>
          </div>
        </div>
      </div>

      <!-- Portrait Mobile Layout -->
      <template v-else-if="!isLandscape">
        <!-- Full Map -->
        <div v-testid="'map-shell'" class="absolute inset-0">
          <MapContainer
            ref="mapRef"
            :uiTopOffset="mapUiTopOffset"
            :uiBottomOffset="mapUiBottomOffset"
            :shops="filteredShops"
            :userLocation="userLocation"
            :currentTime="currentTime"
            :highlightedShopId="activeShopId"
            :is-low-power-mode="isLowPowerMode"
            :isDarkMode="isDarkMode"
            :activeZone="activeZone"
            :activeProvince="activeProvince"
            :buildings="activeEvents"
            :isSidebarOpen="!isVibeNowCollapsed"
            :selectedShopCoords="selectedShopCoords"
            :legendHeight="legendHeight"
            @select-shop="handleMarkerClick"
            @open-detail="handleOpenDetail"
            @open-ride-modal="openRideModal"
            @exit-indoor="handleCloseFloorSelector"
            @open-building="handleBuildingOpen"
            class="w-full h-full"
          />
        </div>

        <!-- Navigation Legend & Floor Selector REMOVED -->

        <!-- ✅ VIBE NOW / INDOOR POI - Horizontal Carousel (Bottom) -->
        <div
          ref="bottomUiRef"
          class="absolute bottom-0 left-0 right-0 z-[1200] pb-10 pointer-events-none"
        >
          <!-- Header Bar - Centered (closer to cards) -->
          <div class="flex items-center justify-center gap-2 py-2 mb-1">
            <span
              data-testid="vibe-now-header"
              :class="[
                'text-xs font-bold tracking-widest uppercase',
                isDarkMode ? 'text-white/80' : 'text-gray-700',
              ]"
            >
              🔥 VIBE NOW
            </span>
            <span
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/20"
            >
              <span
                class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"
              ></span>
              <span class="text-[10px] font-bold text-red-500">{{
                liveCount
              }}</span>
            </span>
          </div>

          <!-- Horizontal Cards Carousel -->
          <div class="relative min-h-[100px]">
            <!-- ✅ Case 1: Loading State -->
            <div
              v-if="isDataLoading"
              class="flex items-end px-[calc(50vw-90px)] py-4 gap-4 no-scrollbar mb-0 h-[300px] overflow-x-hidden"
            >
              <SkeletonCard
                v-for="i in 5"
                :key="`skel-${i}`"
                variant="carousel"
                :isDarkMode="isDarkMode"
                class="pointer-events-auto"
                style="width: 180px; height: 260px"
              />
            </div>

            <!-- ✅ Case 2: Empty Result / Search Not Found -->
            <div
              v-else-if="carouselShops.length === 0"
              class="flex flex-col items-center justify-center py-10 text-center px-10 animate-fade-in"
            >
              <div
                class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10"
              >
                <span class="text-3xl">🔍</span>
              </div>
              <p
                :class="[
                  'text-sm font-black uppercase tracking-[0.2em]',
                  isDarkMode ? 'text-white' : 'text-gray-900',
                ]"
              >
                ไม่พบสถานที่ในพื้นที่นี้
              </p>
              <p
                class="text-[10px] font-bold text-white/40 mt-1 mb-6 uppercase tracking-widest"
              >
                เราได้คัดมาให้คุณแล้ว
              </p>

              <div class="flex gap-3 mb-8">
                <div
                  v-for="s in suggestedShops"
                  :key="s.id"
                  @click="handleCardClick(s)"
                  class="w-14 h-14 rounded-2xl overflow-hidden border border-white/20 active:scale-90 transition-all cursor-pointer shadow-xl"
                >
                  <img
                    v-if="s.Image_URL1"
                    :src="s.Image_URL1"
                    class="w-full h-full object-cover"
                  />
                  <div
                    class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent"
                  ></div>
                </div>
              </div>

              <button
                @click="
                  activeCategories = [];
                  activeStatus = 'ALL';
                "
                class="px-6 py-3 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.4)]"
              >
                ดูสถานที่อื่นๆ ทั้งหมด
              </button>
            </div>

            <div
              v-else
              ref="mobileCardScrollRef"
              data-testid="vibe-carousel"
              class="flex overflow-x-auto overflow-y-visible px-0 py-4 gap-4 no-scrollbar items-end mb-0 snap-x snap-mandatory h-[300px] pointer-events-auto touch-pan-x"
              style="-webkit-overflow-scrolling: touch; scroll-behavior: smooth"
              @scroll="handleHorizontalScroll"
              @touchstart="onScrollStart"
              @touchend="onScrollEnd"
              @mousedown="onScrollStart"
              @mouseup="onScrollEnd"
            >
              <div class="flex-shrink-0 w-[calc(50vw-90px)]"></div>

              <template v-if="isIndoorView">
                <div
                  v-for="shop in mallShops.filter(
                    (s) => s.Floor === activeFloor,
                  )"
                  :key="`indoor-${shop.id}`"
                  :data-shop-id="shop.id"
                  v-memo="[
                    shop.id,
                    shop.status,
                    activeShopId === shop.id,
                    isDarkMode,
                    favorites.includes(Number(shop.id)),
                  ]"
                  class="flex-shrink-0 w-[320px] h-[380px] cursor-pointer transition-all duration-300 rounded-xl overflow-hidden shadow-lg border relative flex flex-col snap-center"
                  :class="[
                    activeShopId === shop.id
                      ? 'scale-105 ring-4 ring-blue-500 z-20 shadow-2xl shadow-blue-500/60'
                      : 'scale-100',
                    isDarkMode
                      ? 'bg-zinc-900 border-white/30'
                      : 'bg-white border-gray-400',
                  ]"
                  @click="handleCardClick(shop)"
                >
                  <div
                    class="h-[110px] w-full flex-shrink-0 relative bg-gradient-to-br from-purple-700 via-pink-600 to-red-600 overflow-hidden"
                  >
                    <video
                      v-if="shop.Video_URL && activeShopId === shop.id"
                      :src="shop.Video_URL"
                      autoplay
                      muted
                      loop
                      playsinline
                      class="absolute inset-0 w-full h-full object-cover"
                    />
                    <img
                      v-else-if="shop.Image_URL1"
                      :src="shop.Image_URL1"
                      class="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div
                      v-if="shop.status === 'LIVE'"
                      class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-bold animate-pulse"
                    >
                      LIVE
                    </div>
                    <div
                      v-if="shop.isPromoted || shop.IsPromoted === 'TRUE'"
                      class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[8px] font-black shadow-lg z-10"
                    >
                      PROMOTED
                    </div>
                  </div>
                  <div class="flex-1 p-2 flex flex-col justify-between min-w-0">
                    <div>
                      <h3
                        :class="[
                          'text-[11px] font-black leading-tight truncate uppercase',
                          isDarkMode ? 'text-white' : 'text-black',
                        ]"
                      >
                        {{ shop.name }}
                      </h3>
                      <p
                        :class="[
                          'text-[10px] mt-0.5 truncate font-black',
                          isDarkMode ? 'text-white' : 'text-black',
                        ]"
                      >
                        {{ shop.category || "Shop" }}
                      </p>
                    </div>
                    <button
                      @click.stop="openRideModal(shop)"
                      class="mt-1 w-full py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-[9px] font-bold active:scale-95 transition-all"
                    >
                      เรียกรถ
                    </button>
                  </div>
                </div>
              </template>

              <template v-else>
                <SwipeCard
                  v-for="shop in carouselShops"
                  :key="shop.id"
                  :is-selected="activeShopId === shop.id"
                  v-memo="[
                    shop.id,
                    shop.status,
                    activeShopId === shop.id,
                    isDarkMode,
                    favorites.includes(Number(shop.id)),
                  ]"
                  @swipe-left="handleSwipe('left', shop)"
                  @swipe-right="handleSwipe('right', shop)"
                  @expand="handleOpenDetail(shop)"
                  @toggle-favorite="toggleFavorite(shop.id)"
                  class="snap-center transition-all duration-500 ease-out py-4"
                  :class="[
                    activeShopId === shop.id
                      ? 'scale-105 z-20'
                      : 'scale-95 opacity-90 blur-[0.5px] grayscale-[0.2]',
                  ]"
                >
                  <!-- Optimized Premium Card Content -->
                  <div
                    data-testid="shop-card"
                    :data-shop-id="shop.id"
                    class="flex-shrink-0 w-[200px] h-[240px] cursor-pointer rounded-2xl overflow-hidden border relative flex flex-col group/card transition-shadow duration-300"
                    :class="[
                      activeShopId === shop.id
                        ? 'ring-2 ring-blue-500 ' +
                          (isDarkMode
                            ? 'shadow-[0_0_30px_rgba(59,130,246,0.4)] border-blue-400/50'
                            : 'shadow-2xl shadow-blue-500/40 border-blue-500/50')
                        : 'shadow-md ' +
                          (isDarkMode
                            ? 'bg-zinc-950 border-white/10'
                            : 'bg-white border-gray-200'),
                    ]"
                    @click="handleOpenDetail(shop)"
                  >
                    <div class="absolute inset-0 z-0 bg-gray-800/20">
                      <video
                        v-if="shop.Video_URL && activeShopId === shop.id"
                        :src="shop.Video_URL"
                        autoplay
                        muted
                        loop
                        playsinline
                        class="w-full h-full object-cover brightness-[0.9] transition-all duration-700"
                      />
                      <img
                        v-else-if="shop.Image_URL1"
                        :src="shop.Image_URL1"
                        class="w-full h-full object-cover brightness-[0.85] transition-all duration-700"
                        loading="lazy"
                      />
                      <div
                        class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"
                      ></div>
                    </div>

                    <!-- ✅ Badge Overlay -->
                    <div class="absolute top-2 left-2 flex gap-1 z-10">
                      <div
                        v-if="shop.status === 'LIVE' || shop.Status === 'LIVE'"
                        class="px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[8px] font-black animate-pulse shadow-lg backdrop-blur-sm"
                      >
                        LIVE
                      </div>
                      <div
                        v-if="shop.isPromoted || shop.IsPromoted === 'TRUE'"
                        class="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[8px] font-black shadow-lg"
                      >
                        PROMOTED
                      </div>
                    </div>

                    <div class="mt-auto relative z-10 p-3 pb-3">
                      <h3
                        class="text-xs font-black text-white leading-tight drop-shadow-md truncate"
                      >
                        {{ shop.name }}
                      </h3>
                      <div class="flex items-center justify-between mt-1">
                        <span
                          class="text-[9px] font-bold text-white/70 uppercase tracking-wider"
                        >
                          {{ shop.category || "Bar" }}
                        </span>
                        <span
                          v-if="shop.distance !== undefined"
                          class="text-[9px] font-black text-blue-400 drop-shadow-sm"
                        >
                          {{ shop.distance.toFixed(1) }}km
                        </span>
                      </div>

                      <div class="mt-2 scale-[0.85] origin-left opacity-90">
                        <VisitorCount :shopId="shop.id" :isDarkMode="true" />
                      </div>

                      <button
                        @click.stop="openRideModal(shop)"
                        class="mt-2 w-full py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-black active:scale-95 transition-all hover:bg-white/20 shadow-lg flex items-center justify-center gap-1"
                      >
                        <span>🚗</span> เรียกรถ
                      </button>
                    </div>
                  </div>
                </SwipeCard>
              </template>

              <!-- Spacer to center last item -->
              <div class="flex-shrink-0 w-[calc(50vw-100px)]"></div>
            </div>
          </div>
        </div>
      </template>
    </div>
    <!-- End Landscape Wrapper -->

    <!-- ✅ Common Modals & Overlays (Visible in all views) -->

    <!-- ✅ PORTAL: ย้ายทุก Modal/Drawer/Overlay มาอยู่บนสุดของ DOM -->
    <PortalLayer>
      <!-- ✅ VIBE MODAL (รายละเอียดร้าน) -->
      <transition name="modal-fade">
        <div v-testid="'vibe-modal'" v-if="selectedShop">
          <VibeModal
            :shop="selectedShop"
            @close="selectedShop = null"
            @toggle-favorite="toggleFavorite"
          />
        </div>
      </transition>

      <!-- ✅ Ride Service Modal Popup (ของเดิมคุณ) -->
      <transition name="fade">
        <div
          v-if="rideModalShop"
          class="fixed inset-0 z-[9000] flex items-center justify-center p-4"
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
              <!-- ✅ === เอาของเดิมทั้งหมดใน Ride Modal (Header + 3 ปุ่ม Grab/Bolt/Lineman) มาวางตรงนี้แบบเดิมเป๊ะ === -->
              <!-- ⚠️ ห้ามแก้อะไรข้างใน แค่ย้ายที่ render -->
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

              <div class="p-3 space-y-2">
                <a
                  :href="`https://grab.onelink.me/2695613898?af_dp=grab://open?screenType=BOOKING&dropOffLatitude=${rideModalShop.lat}&dropOffLongitude=${rideModalShop.lng}&dropOffName=${encodeURIComponent(rideModalShop.name)}`"
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
                </a>

                <a
                  :href="`bolt://google/navigate?q=${rideModalShop.lat},${rideModalShop.lng}`"
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
                    B
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
                </a>

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
                </a>
              </div>
            </div>
          </transition>
        </div>
      </transition>

      <!-- ✅ MALL DRAWER -->
      <MallDrawer
        :is-open="showMallDrawer"
        :building="activeMall"
        :shops="mallShops"
        :is-dark-mode="isDarkMode"
        :selected-shop-id="activeShopId"
        @close="showMallDrawer = false"
        @select-shop="
          (shop) => {
            handleMarkerClick(shop);
            handleOpenDetail(shop);
          }
        "
        @open-ride-modal="openRideModal"
        @toggle-favorite="toggleFavorite"
        :favorites="favorites"
      />

      <!-- ✅ PROFILE DRAWER -->
      <ProfileDrawer
        :is-open="showProfileDrawer"
        :is-dark-mode="isDarkMode"
        @close="showProfileDrawer = false"
        @toggle-language="toggleLanguage"
      />

      <!-- ✅ Global Loading State -->
      <Transition
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-300 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-105"
      >
        <div
          v-if="isDataLoading"
          class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#09090b]"
        >
          <div class="relative w-24 h-24">
            <div
              class="absolute inset-0 rounded-full border-4 border-white/5"
            ></div>
            <div
              class="absolute inset-0 rounded-full border-4 border-pink-500 border-t-transparent animate-spin"
            ></div>
            <div
              class="absolute inset-4 rounded-full border-4 border-blue-500 border-b-transparent animate-spin-slow"
            ></div>
          </div>
          <h2
            class="mt-8 text-xl font-black text-white tracking-[0.2em] animate-pulse"
          >
            VIBECITY
          </h2>
          <p
            class="mt-2 text-zinc-500 text-xs uppercase tracking-widest font-bold"
          >
            Synchronizing Vibe Engine...
          </p>
        </div>
      </Transition>

      <!-- ✅ Global Error Feedback -->
      <Transition
        enter-active-class="transition duration-500 ease-out"
        enter-from-class="opacity-0 translate-y-10"
        enter-to-class="opacity-100 translate-y-0"
      >
        <div
          v-if="errorMessage"
          class="fixed top-20 left-1/2 -translate-x-1/2 z-[8000] w-[90%] max-w-md"
        >
          <div
            class="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 backdrop-blur-xl flex items-center gap-4 shadow-2xl"
          >
            <div
              class="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-xl shrink-0"
            >
              ⚠️
            </div>
            <div class="flex-1">
              <h4 class="text-white font-bold text-sm">System Alert</h4>
              <p class="text-white/60 text-xs">{{ errorMessage }}</p>
            </div>
            <button
              @click="errorMessage = null"
              class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40"
            >
              ✕
            </button>
          </div>
        </div>
      </Transition>

      <!-- ✅ Confetti -->
      <ConfettiEffect v-if="showConfetti" />
    </PortalLayer>
  </main>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 3s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

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

/* Dropdown slide animation */

@keyframes coin-float {
  0% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(-100px) scale(1.5);
    opacity: 0;
  }
}
.animate-coin-pop {
  animation: coin-float 1s ease-out forwards;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.dropdown-slide-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-slide-leave-active {
  transition: all 0.15s ease-in;
}
.dropdown-slide-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
.dropdown-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
