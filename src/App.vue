<script setup>
import { ref, onMounted, computed, onUnmounted, watch, shallowRef } from "vue";
import MapContainer from "./components/map/MapContainer.vue";
import VideoPanel from "./components/panel/VideoPanel.vue";
import MallDrawer from "./components/modal/MallDrawer.vue";
import { fetchShopData } from "./services/sheetsService";
import { useShopFilters } from "./composables/useShopFilters";
import {
  calculateShopStatus,
  isGoldenTime,
  calculateDistance,
} from "./utils/shopUtils";

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
const showCategoryDropdown = ref(false);
const favorites = ref([]); // ✅ Favorites list (ids)

const carouselShops = computed(() => {
  // ใช้ nearbyShops ที่คุณคำนวณไว้แล้ว (เสถียรกว่า filteredShops ที่อาจเปลี่ยนตาม zone/province)
  return nearbyShops.value.slice(0, 30);
});

// ✅ UI offsets for "visual center" (between top bar & bottom carousel)
const mapUiTopOffset = computed(() => {
  // if (showFloorSelector.value || isIndoorView.value) return 120;
  // มี dropdown/filter ด้านบน
  return 64;
});

const mapUiBottomOffset = computed(() => {
  // mobile มี bottom carousel สูงประมาณ 210-240
  if (isMobileView.value) return 230;
  return 0;
});

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

// ✅ Computed: Active Events
// Returns buildings object but decorated with event data IF event is active
const activeEvents = computed(() => {
  const result = [];
  if (!buildingsData.value) return [];

  Object.keys(mockEvents).forEach((key) => {
    const building = buildingsData.value[key];
    const event = mockEvents[key];
    if (building && event) {
      result.push({
        ...building,
        ...event,
        key: key,
        isEvent: true,
      });
    }
  });
  return result;
});
// const activeFloor = ref(null); // REMOVED: Indoor Map
// const showFloorSelector = ref(false); // REMOVED: Indoor Map
// const isIndoorView = ref(false); // REMOVED: Indoor Map

// ✅ Mall Drawer State
const showMallDrawer = ref(false);
const activeMall = computed(() => activeBuilding.value);
const mallShops = computed(() => {
  if (!activeMall.value) return [];
  // Filter shops that belong to this building
  // Ensure comparsion allows for string/number differences if any
  return shops.value.filter((s) => s.Building == activeMall.value.key);
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
      (s.category || "").toLowerCase().includes(q)
  );

  // Sort by Distance
  if (userLocation.value) {
    const [uLat, uLng] = userLocation.value;
    matches.forEach((s) => {
      if (s.lat && s.lng) {
        s.distance = calculateDistance(uLat, uLng, s.lat, s.lng);
      } else {
        s.distance = Infinity;
      }
    });

    return matches
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

// ✅ calculateDistance moved to utils/shopUtils.js

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

// ✅ Smart Rotation Logic: 30 Random Shops every 30 mins
const nearbyShops = computed(() => {
  if (!filteredShops.value) return [];
  if (!userLocation.value) return filteredShops.value; // Fallback: show all if no location

  const [userLat, userLng] = userLocation.value;
  let candidates = filteredShops.value.map((shop, idx) => ({
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
      (s) => s.status === "LIVE" || s.Status === "LIVE"
    );
    const normalShops = candidates.filter(
      (s) => s.status !== "LIVE" && s.Status !== "LIVE"
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
    return a.distance - b.distance;
  });

  return candidates;
});

// --- Time Loop ---
let timeInterval = null;

// Debug watcher for floor selector

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

    // Load favorites
    const savedFavorites = localStorage.getItem("vibecity-favorites");
    if (savedFavorites) {
      favorites.value = JSON.parse(savedFavorites);
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

    // Listen for window custom event from Leaflet marker (bypasses Vue emit limitation)
    window.addEventListener("vibe-open-detail", handleVibeOpenDetail);
  } catch (err) {
    console.error("Initialization Error:", err.message);
  } finally {
    isDataLoading.value = false;
  }
});

onUnmounted(() => {
  if (timeInterval) clearInterval(timeInterval);
  window.removeEventListener("resize", checkMobileView);
  window.removeEventListener("vibe-open-detail", handleVibeOpenDetail);
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

const handleLocateMe = () => {
  // ถ้าอยู่ indoor แล้วอยาก “ออก indoor” ก่อน locate (REMOVED logic)
  /* if (isIndoorView.value) {
    handleCloseFloorSelector(); 
  } */

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
  } else {
    favorites.value.splice(index, 1);
  }
  localStorage.setItem("vibecity-favorites", JSON.stringify(favorites.value));
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
  // ✅ ปิด popup
  if (!shop) {
    activeShopId.value = null;
    return;
  }

  // ✅ Toggle: กดซ้ำที่ร้านเดิม = ปิด
  if (activeShopId.value === shop.id) {
    activeShopId.value = null;
    return;
  }

  activeShopId.value = shop.id;

  // ✅ Check if shop is in a building -> JUST set activeBuilding for Drawer (No floor selector)
  const buildingKey = shop.Building;
  const buildingRaw = buildingKey ? buildingsData.value[buildingKey] : null;

  if (buildingRaw) {
    // Shop is inside a building -> set activeBuilding so Drawer can open
    activeBuilding.value = { ...buildingRaw, key: buildingKey };
    // No activeFloor or isIndoorView anymore
  } else {
    // No building
    activeBuilding.value = null;
  }

  if (mapRef.value && shop.lat && shop.lng) {
    mapRef.value.focusLocation([shop.lat, shop.lng], 17);
  }

  // ✅ ถ้ากดจากหมุด อยากให้การ์ดเลื่อนมาอยู่กลางด้วย
  if (isMobileView.value) {
    centerCardToMiddle(shop.id);
  }
};

// Close floor selector - exit indoor view but keep selected shop (DEPRECATED but keeping simplified)
const handleCloseFloorSelector = () => {
  // Just clear building usually, but we might want to close drawer?
  // activeBuilding.value = null; // Maybe? Or let drawer handle it.

  // For now, this function is mostly unused if we remove UI calls to it.
  // But let's act as "Clear Selection"

  // ✅ Focus back on the currently active shop if exists
  const currentShop = shops.value.find((s) => s.id === activeShopId.value);
  if (currentShop && mapRef.value) {
    mapRef.value.focusLocation([currentShop.lat, currentShop.lng], 17);
  }
};

// Handle floor selection (REMOVED)
const handleFloorSelect = (floor) => {
  console.log("Floor selection deprecated");
};

// Shop card click - pan to shop first
const openModalOnCardClick = ref(true); // ✅ อยากให้คลิกการ์ดเปิด modal ไหม

const handleCardClick = (shop) => {
  if (!shop) return;

  // ✅ toggle active
  if (activeShopId.value === shop.id) {
    activeShopId.value = null;
    if (openModalOnCardClick.value) selectedShop.value = null;
    return;
  }

  activeShopId.value = shop.id;

  // ✅ เลื่อนการ์ดไปกลางแบบนุ่ม
  if (isMobileView.value) centerCardToMiddle(shop.id);

  // ✅ fly map
  if (mapRef.value && shop.lat && shop.lng) {
    mapRef.value.focusLocation([shop.lat, shop.lng], 17);
  }

  // ✅ เปิด modal เฉพาะตอนคลิก (ไม่ใช่ตอนเลื่อนด้วยนิ้ว)
  if (openModalOnCardClick.value) {
    selectedShop.value = shop;
  }
};

// Hover on card - pan map to location
const handleCardHover = (shop) => {
  activeShopId.value = shop.id;
  activeProvince.value = "เชียงใหม่";
  activeZone.value = shop.Zone || null;

  // hover แล้วถ้าไม่ใช่ตึก ให้ปิด tabs (Simplified)
  const buildingKey = shop.Building;
  const building = buildingKey ? buildingsData.value[buildingKey] : null;
  if (!building) {
    // showFloorSelector.value = false;
    // isIndoorView.value = false;
    activeBuilding.value = null;
    // activeFloor.value = null;
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

// ✅ Horizontal Scroll Handler - iOS picker magnet snap (touchend/mouseup) + auto active + map fly (NO modal)
const mobileCardScrollRef = ref(null);

const isAutoSnapping = ref(false);
let rafMomentum = 0;
let lastScrollLeft = 0;
let stillFrames = 0;

const getActiveListForCarousel = () => {
  return carouselShops.value; // Always use carousel, no indoor list
};

const getClosestCenteredShopId = () => {
  const container = mobileCardScrollRef.value;
  if (!container) return null;

  const cards = container.querySelectorAll("[data-shop-id]");
  if (!cards.length) return null;

  const containerRect = container.getBoundingClientRect();
  const containerCenter = containerRect.left + containerRect.width / 2;

  let closestEl = null;
  let minDiff = Infinity;

  cards.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const cardCenter = rect.left + rect.width / 2;
    const diff = Math.abs(containerCenter - cardCenter);

    if (diff < minDiff) {
      minDiff = diff;
      closestEl = el;
    }
  });

  if (!closestEl) return null;
  return Number(closestEl.getAttribute("data-shop-id")) || null;
};

// ✅ smooth snap by scrollTo target (ใช้ offsetLeft ไม่พึ่ง getBoundingClientRect -> ลดสะดุ้ง)
const snapShopIdToCenter = (shopId) => {
  const container = mobileCardScrollRef.value;
  if (!container) return;

  const card = container.querySelector(`[data-shop-id="${shopId}"]`);
  if (!card) return;

  isAutoSnapping.value = true;

  const containerWidth = container.clientWidth;
  const target = card.offsetLeft - containerWidth / 2 + card.offsetWidth / 2;

  // clamp กัน overscroll/elastic บางเครื่อง
  const maxLeft = container.scrollWidth - containerWidth;
  const clamped = Math.max(0, Math.min(target, maxLeft));

  // ✅ Fix Stutter: Cancel any pending momentum snap from mouseup/touchend
  // because we are now snapping programmatically via click.
  if (typeof rafMomentum !== "undefined") {
    cancelAnimationFrame(rafMomentum);
  }

  container.scrollTo({ left: clamped, behavior: "smooth" });

  // กัน loop จาก programmatic scroll
  window.clearTimeout(snapShopIdToCenter._t);
  snapShopIdToCenter._t = window.setTimeout(() => {
    isAutoSnapping.value = false;
  }, 260);
};

const centerCardToMiddle = (shopId) => {
  if (!shopId) return;
  snapShopIdToCenter(shopId);
};

// ✅ apply effects: active + fly map + floor selector (NO modal)
const applyShopFocus = (shopId) => {
  if (!shopId) return;

  // Reverting check to allow re-centering if user panned away.
  // Stutter is fixed by cancelling rafMomentum in snapShopIdToCenter.
  activeShopId.value = shopId;
  selectedShop.value = null; // 🔥 Prevent duplicate modal opening

  const list = getActiveListForCarousel();
  const shop = list.find((s) => Number(s.id) === Number(shopId));

  if (shop && mapRef.value && shop.lat && shop.lng) {
    // Pass manual Y offset = 0 for exact visual center (Screen Center)
    // using '0' explicitly overrides the automatic UI balancing
    mapRef.value.focusLocation([shop.lat, shop.lng], 16, 0);
  }

  const buildingKey = shop?.Building;
  const buildingRaw = buildingKey ? buildingsData.value[buildingKey] : null;

  if (buildingRaw) {
    activeBuilding.value = { ...buildingRaw, key: buildingKey };
    // activeFloor.value = shop.Floor || buildingRaw.floors?.[0] || null;
    // showFloorSelector.value = true;
  } else {
    // showFloorSelector.value = false;
    activeBuilding.value = null;
    // activeFloor.value = null;
    // isIndoorView.value = false;
  }
};

// ✅ รอ momentum หยุดจริง ๆ แล้วค่อย snap (เฟรมคงที่หลายเฟรม)
const waitMomentumThenSnap = () => {
  const container = mobileCardScrollRef.value;
  if (!container) return;

  cancelAnimationFrame(rafMomentum);

  const tick = () => {
    const now = container.scrollLeft;

    if (Math.abs(now - lastScrollLeft) < 0.5) {
      stillFrames += 1;
    } else {
      stillFrames = 0;
    }

    lastScrollLeft = now;

    // ✅ หยุดนิ่งติดกัน ~6 เฟรม (ประมาณ 100ms) -> ถือว่าหยุดจริง
    if (stillFrames >= 4) {
      const shopId = getClosestCenteredShopId();
      if (shopId) {
        snapShopIdToCenter(shopId);
        applyShopFocus(shopId);
      }
      return;
    }

    rafMomentum = requestAnimationFrame(tick);
  };

  rafMomentum = requestAnimationFrame(tick);
};

// ✅ ใช้แค่ update active แบบเบา ๆ ระหว่างเลื่อน (optional)
// ถ้าอยาก “ไม่ fly ระหว่างลาก” ให้ไม่ทำอะไรใน onScroll เลยก็ได้
const handleHorizontalScroll = () => {
  if (isAutoSnapping.value) return;
  // ปล่อยให้ snap ตอนปล่อยนิ้วจริง ๆ แทน (กันสะดุ้ง)
};

// ✅ hook: ปล่อยนิ้ว = snap
const onCarouselRelease = () => {
  if (isAutoSnapping.value) return;
  stillFrames = 0;
  lastScrollLeft = mobileCardScrollRef.value?.scrollLeft || 0;
  waitMomentumThenSnap();
};

// ✅ Use watch to attach event listeners when element becomes available
watch(
  mobileCardScrollRef,
  (newEl, oldEl) => {
    // Remove from old element
    if (oldEl) {
      oldEl.removeEventListener("touchend", onCarouselRelease);
      oldEl.removeEventListener("touchcancel", onCarouselRelease);
      oldEl.removeEventListener("mouseup", onCarouselRelease);
      oldEl.removeEventListener("mouseleave", onCarouselRelease);
    }

    // Add to new element
    if (newEl) {
      console.log("✅ Carousel element attached, adding event listeners");
      newEl.addEventListener("touchend", onCarouselRelease, { passive: true });
      newEl.addEventListener("touchcancel", onCarouselRelease, {
        passive: true,
      });
      newEl.addEventListener("mouseup", onCarouselRelease);
      newEl.addEventListener("mouseleave", onCarouselRelease);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  const el = mobileCardScrollRef.value;
  if (el) {
    el.removeEventListener("touchend", onCarouselRelease);
    el.removeEventListener("touchcancel", onCarouselRelease);
    el.removeEventListener("mouseup", onCarouselRelease);
    el.removeEventListener("mouseleave", onCarouselRelease);
  }
  cancelAnimationFrame(rafMomentum);
});

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
    <!-- ✅ TOP NAVIGATION BAR (Unified Desktop/Mobile) -->
    <div
      class="fixed top-4 left-4 right-4 z-[6000] flex items-start gap-3 pointer-events-none"
    >
      <!-- Theme Toggle (Pill style) -->
      <button
        @click="toggleTheme"
        class="pointer-events-auto h-12 w-12 flex items-center justify-center rounded-2xl backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-500 active:scale-90"
        :class="
          isDarkMode
            ? 'bg-zinc-900/40 text-yellow-400'
            : 'bg-white/60 text-gray-700 border-gray-200'
        "
      >
        <transition name="fade" mode="out-in">
          <svg
            v-if="isDarkMode"
            key="sun"
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6"
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
          <svg
            v-else
            key="moon"
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6"
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
        </transition>
      </button>

      <!-- Search Bar (Expanded Flex) -->
      <div class="relative flex-1 max-w-xl pointer-events-auto group">
        <div
          class="flex items-center backdrop-blur-2xl rounded-2xl shadow-2xl border transition-all duration-500 focus-within:ring-2 focus-within:ring-blue-500/30"
          :class="
            isDarkMode
              ? 'bg-zinc-900/40 border-white/10'
              : 'bg-white/60 border-gray-200'
          "
        >
          <div
            class="pl-4 text-gray-400 group-focus-within:text-blue-500 transition-colors"
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            v-model="globalSearchQuery"
            @focus="showSearchResults = true"
            @blur="setTimeout(() => (showSearchResults = false), 200)"
            type="text"
            placeholder="Search vibes, events, shops..."
            class="w-full px-3 py-3.5 bg-transparent outline-none text-sm font-medium placeholder-gray-500"
            :class="isDarkMode ? 'text-white' : 'text-gray-900'"
          />
          <button
            v-if="globalSearchQuery"
            @click="globalSearchQuery = ''"
            class="pr-4 text-gray-400 hover:text-red-500 transition-colors"
          >
            ✕
          </button>
        </div>

        <!-- Search Results Dropdown -->
        <transition name="dropdown-fade">
          <div
            v-if="showSearchResults && globalSearchResults.length > 0"
            class="absolute top-full mt-2 w-full rounded-2xl shadow-2xl border overflow-hidden max-h-[60vh] overflow-y-auto backdrop-blur-3xl animate-in fade-in slide-in-from-top-2 duration-300"
            :class="
              isDarkMode
                ? 'bg-zinc-950/80 border-white/10'
                : 'bg-white/90 border-gray-100'
            "
          >
            <div
              v-for="shop in globalSearchResults"
              :key="shop.id"
              @click="handleGlobalSearchSelect(shop)"
              class="flex items-center gap-3 p-4 cursor-pointer border-b last:border-0 hover:bg-blue-500/10 transition-colors"
              :class="isDarkMode ? 'border-white/5' : 'border-gray-50'"
            >
              <div
                class="w-12 h-12 rounded-xl bg-gray-200 overflow-hidden flex-shrink-0 shadow-inner"
              >
                <img
                  v-if="shop.Image_URL1"
                  :src="shop.Image_URL1"
                  class="w-full h-full object-cover"
                />
              </div>
              <div class="flex-1 min-w-0">
                <h4
                  class="text-sm font-bold truncate"
                  :class="isDarkMode ? 'text-white' : 'text-gray-900'"
                >
                  {{ shop.name }}
                </h4>
                <div
                  class="flex items-center gap-2 text-[11px] font-medium opacity-50"
                >
                  <span>{{ shop.category }}</span>
                  <span v-if="shop.distance"
                    >• {{ shop.distance.toFixed(1) }} km</span
                  >
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Locate Me (Right) -->
      <button
        @click="handleLocateMe"
        class="pointer-events-auto h-12 w-12 flex items-center justify-center rounded-2xl backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-500 active:scale-90"
        :class="
          isDarkMode
            ? 'bg-zinc-900/40 text-blue-400'
            : 'bg-white/60 text-blue-600 border-gray-200'
        "
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-6 h-6"
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
    </div>

    <!-- ✅ CATEGORY CHIPS (Below Search Bar) -->
    <div
      class="fixed top-20 left-0 right-0 z-[5900] flex justify-center pointer-events-none p-2"
    >
      <div
        class="flex gap-2 overflow-x-auto scrollbar-hide pointer-events-auto max-w-full px-4 justify-start scroll-smooth"
      >
        <button
          v-for="cat in [
            'ALL',
            'Live Music',
            'Club',
            'Bar',
            'Restaurant',
            'Cafe',
          ]"
          :key="cat"
          @click="
            cat === 'ALL'
              ? ((activeCategories = []), (activeStatus = 'ALL'))
              : ((activeCategories = [cat]), (activeStatus = 'ALL'))
          "
          class="flex-shrink-0 px-5 py-2 rounded-xl text-xs font-bold border backdrop-blur-xl transition-all duration-300 active:scale-95 shadow-lg"
          :class="[
            (cat === 'ALL' && activeCategories.length === 0) ||
            activeCategories.includes(cat)
              ? 'bg-blue-600 text-white border-blue-400 shadow-blue-500/20'
              : isDarkMode
              ? 'bg-zinc-900/40 text-white/70 border-white/10 hover:bg-zinc-800'
              : 'bg-white/60 text-gray-700 border-gray-200 hover:bg-gray-100',
          ]"
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <!-- Desktop Layout: Map (65%) + Panel (35%) -->
    <div v-if="!isMobileView" class="grid grid-cols-[65%_35%] h-full">
      <!-- Map Container -->
      <div class="relative">
        <MapContainer
          ref="mapRef"
          :uiTopOffset="mapUiTopOffset"
          :uiBottomOffset="mapUiBottomOffset"
          :shops="nearbyShops"
          :userLocation="userLocation"
          :currentTime="currentTime"
          :highlightedShopId="activeShopId"
          :isDarkMode="isDarkMode"
          :activeZone="activeZone"
          :activeProvince="activeProvince"
          :buildings="activeEvents"
          :is-sidebar-open="isPanelOpen"
          @select-shop="handleMarkerClick"
          @open-detail="handleOpenDetail"
          @open-ride-modal="openRideModal"
          @exit-indoor="handleCloseFloorSelector"
          @open-building="handleBuildingOpen"
        />

        <!-- Floor Selector Popup - Moved outside for better z-index control -->
      </div>

      <!-- Navigation Legend desktop REMOVED -->

      <!-- Floor Selector Tabs Bar REMOVED -->

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
    <template v-else>
      <!-- Full Map -->
      <MapContainer
        ref="mapRef"
        :uiTopOffset="mapUiTopOffset"
        :uiBottomOffset="mapUiBottomOffset"
        :shops="nearbyShops"
        :userLocation="userLocation"
        :currentTime="currentTime"
        :highlightedShopId="activeShopId"
        :isDarkMode="isDarkMode"
        :activeZone="activeZone"
        :activeProvince="activeProvince"
        :buildings="activeEvents"
        :isSidebarOpen="!isVibeNowCollapsed"
        :legendHeight="legendHeight"
        :is-3d-mode="is3DMode"
        @select-shop="handleMarkerClick"
        @open-detail="handleOpenDetail"
        @open-ride-modal="openRideModal"
        @exit-indoor="handleCloseFloorSelector"
        @open-building="handleBuildingOpen"
        class="absolute inset-0"
      />

      <!-- Navigation Legend & Floor Selector REMOVED -->

      <!-- ✅ VIBE NOW / INDOOR POI - Horizontal Carousel (Bottom) -->
      <div class="absolute bottom-0 left-0 right-0 z-[1200] pb-3">
        <!-- Header Bar - Centered (closer to cards) -->
        <div class="flex items-center justify-center gap-2 py-1 mb-0">
          <span
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
        <div
          ref="mobileCardScrollRef"
          class="flex overflow-x-auto overflow-y-visible px-6 py-4 gap-4 no-scrollbar items-end mb-0 snap-x snap-mandatory"
          style="-webkit-overflow-scrolling: touch; scroll-behavior: smooth"
          @scroll="handleHorizontalScroll"
        >
          <!-- Spacer to center first item -->
          <div class="flex-shrink-0 w-[calc(50vw-90px)]"></div>

          <!-- ✅ INDOOR MODE Removed: All logic stripped -->

          <!-- ✅ NORMAL MODE: Show random 30 shops -->
          <template v-if="true">
            <div
              v-for="shop in carouselShops"
              :key="shop.id"
              class="flex-shrink-0 w-[180px] h-[170px] cursor-pointer transition-all duration-300 rounded-xl overflow-hidden shadow-lg border relative flex flex-col snap-center"
              :data-shop-id="shop.id"
              :class="[
                activeShopId === shop.id
                  ? 'scale-105 ring-2 ring-blue-500 z-20 shadow-2xl shadow-blue-500/40'
                  : 'scale-100 hover:scale-102',
                isDarkMode
                  ? 'bg-zinc-900/90 border-white/10'
                  : 'bg-white/95 border-gray-200',
              ]"
              @click="handleCardClick(shop)"
            >
              <!-- Top: Image/Video Area -->
              <div
                class="h-[110px] w-full flex-shrink-0 relative bg-gradient-to-br from-purple-700 via-pink-600 to-red-600 overflow-hidden"
              >
                <!-- Video Placeholder (will autoplay when active) -->
                <video
                  v-if="shop.Video_URL && activeShopId === shop.id"
                  :src="shop.Video_URL"
                  autoplay
                  muted
                  loop
                  playsinline
                  class="absolute inset-0 w-full h-full object-cover"
                />
                <!-- Fallback to image when video not available -->
                <img
                  v-else-if="shop.Image_URL1"
                  :src="shop.Image_URL1"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <!-- Gradient background naturally shows if no media -->
                <!-- LIVE Badge -->
                <div
                  v-if="shop.status === 'LIVE'"
                  class="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-red-600 text-white text-[8px] font-bold animate-pulse"
                >
                  LIVE
                </div>
                <!-- Favorite Button (Top Right) -->
                <button
                  @click.stop="toggleFavorite(shop.id)"
                  class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-90"
                  :class="[
                    favorites.includes(Number(shop.id))
                      ? 'bg-pink-500 text-white shadow-lg'
                      : 'bg-black/20 text-white/80 hover:bg-black/40',
                  ]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    :fill="
                      favorites.includes(Number(shop.id))
                        ? 'currentColor'
                        : 'none'
                    "
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </button>
              </div>

              <!-- Bottom: Content -->
              <div class="flex-1 p-2 flex flex-col justify-center min-w-0">
                <h3
                  :class="[
                    'text-[11px] font-bold leading-tight truncate',
                    isDarkMode ? 'text-white' : 'text-gray-900',
                  ]"
                >
                  {{ shop.name }}
                </h3>
                <p
                  :class="[
                    'text-[9px] mt-0.5 truncate',
                    isDarkMode ? 'text-white/50' : 'text-gray-500',
                  ]"
                >
                  {{ shop.category || "Bar" }}
                  <span v-if="shop.distance !== undefined">
                    • {{ shop.distance.toFixed(1) }}km</span
                  >
                </p>
              </div>
            </div>
          </template>

          <!-- Spacer to center last item -->
          <div class="flex-shrink-0 w-[calc(50vw-90px)]"></div>
        </div>
      </div>

      <!-- Ride Service Modal Popup -->
    </template>

    <!-- Detail Modal REMOVED as per request -->

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

    <!-- ✅ GLOBAL RIDE MODAL (Desktop & Mobile) -->
    <transition name="modal-fade">
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
                :href="`https://grab.onelink.me/2695613898?af_dp=grab://open?screenType=BOOKING&dropOffLatitude=${
                  rideModalShop.lat
                }&dropOffLongitude=${
                  rideModalShop.lng
                }&dropOffName=${encodeURIComponent(rideModalShop.name)}`"
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

              <!-- Bolt -->
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
              </a>
            </div>
          </div>
        </transition>
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
    <!-- ✅ MALL DRAWER -->
    <MallDrawer
      :is-open="showMallDrawer"
      :building="activeMall"
      :shops="mallShops"
      :is-dark-mode="isDarkMode"
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
