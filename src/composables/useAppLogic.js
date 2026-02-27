// src/composables/useAppLogic.js
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    shallowRef,
    watch,
  } from "vue";
  import { storeToRefs } from "pinia";
  import { useI18n } from "vue-i18n";
  import { useHaptics } from "./useHaptics";
  import { useShopFilters } from "./useShopFilters";
import { useIdle } from "./useIdle"; // ✅ Auto-hide UI logic
import { useAudioSystem } from "./useAudioSystem"; // ✅ Spatial Audio
  import { getAllEvents as fetchRealTimeEvents } from "../services/eventService";
  import { fetchShopData } from "../services/sheetsService";
  import { usePerformance } from "./usePerformance";
  import { openRideApp as openRideAppService } from "../services/DeepLinkService";
  import { useShopStore } from "../store/shopStore";
  import { useUserStore } from "../store/userStore";
  import {
    calculateDistance,
    calculateShopStatus,
    isGoldenTime,
  } from "../utils/shopUtils";
  import {
    loadFavoritesWithTTL,
    saveFavoriteItem,
    removeFavoriteItem,
  } from "../utils/storageHelper";
  import { useEdgeSwipe } from "./useGestures";
  
  
  export function useAppLogic() {
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

  // ✅ Auto-hide UI Logic
  const { isIdle, kick: wakeUi } = useIdle(4000); // 4s timeout
  
  const isUiVisible = computed(() => {
     // Always show UI if meaningful interaction is happening or overlay is active
     if (
       showSidebar.value ||
       showProfileDrawer.value ||
       showMallDrawer.value ||
       selectedShop.value ||
       rideModalShop.value ||
       showSearchResults.value ||
       activeShopId.value // If a shop is selected/active on map
     ) {
       return true;
     } 
     return !isIdle.value;

  });

  // ✅ Spatial Audio System
  const { isMuted, toggleMute, setZone } = useAudioSystem();



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
  
    const activeTab = ref("map"); // 'map' | 'events' | 'favorites' | 'profile'

  // ✅ Spatial Audio Watchers (Moved here to fix ReferenceError)
  watch(activeCategories, (newCats) => {
    if (newCats.length === 0) {
        setZone("default");
        return;
    }
    const cat = newCats[0].toLowerCase();
    if (['nightlife', 'bar', 'club', 'wine'].some(k => cat.includes(k))) {
        setZone("nightlife");
    } else if (['nature', 'park', 'camp'].some(k => cat.includes(k))) {
        setZone("nature");
    } else if (['temple', 'culture'].some(k => cat.includes(k))) {
        setZone("temple");
    } else {
        setZone("default");
    }
  });
  
    // ✅ URL Sync Cleanup Watcher
    watch(activeShopId, (newId) => {
      const url = new URL(window.location);
      try {
        if (newId) {
          url.searchParams.set("shop", newId);
          window.history.replaceState({}, "", url);
        } else {
          url.searchParams.delete("shop");
          window.history.replaceState({}, "", url);
        }
      } catch (e) {
        // Ignore stats/analytics interception errors
      }
    }); // ✅ Fixed missing closing brace

    const realTimeEvents = ref([]); // ✅ Real-time events from API
    const timedEvents = ref([]); // ✅ Dynamic events from events.json
    
    // ✅ Infinite Scroll State
    const pageLimit = ref(30);
    const loadMoreVibes = () => {
      if (pageLimit.value < (localNearbyShops.value?.length || 0)) {
        pageLimit.value += 10;
        tapFeedback();
      }
    };

    const galleryImages = ref([]);
    const isGalleryOpen = ref(false);
    const dailyCheckinRef = ref(null);
    const luckyWheelRef = ref(null);
    const showSidebar = ref(false); // ✅ Replaces showProfileDrawer
    const showProfileDrawer = ref(false); // Kept for compat if needed, synced
    const errorMessage = ref(null); // ✅ Global error feedback for user
  
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
      const lat = Number(targetCoords[0]);
      const lng = Number(targetCoords[1]);
      
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
          bottom: isMobileView.value ? bottomPanelHeight + 120 : 50, // Revert to panel-aware center
          top: isMobileView.value ? 80 : 50, // Clear header only
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
    // NOTE: Imported directly in function scope or at top? Using top import pattern as per strict rule.
    // import { useEdgeSwipe } from "./composables/useGestures"; -> Moved to top imports if possible, or assumed available via project structure.

  
    useEdgeSwipe(() => {
      showSidebar.value = true;
    });
  
    onMounted(() => {
      window.addEventListener("resize", checkMobileView);
      window.addEventListener("resize", measureBottomUi);
    });
  
    onUnmounted(() => {
      window.removeEventListener("touchstart", onGlobalTouchStart); // Note: onGlobalTouchStart wasn't defined in snippet but onUnmounted removes it? I will keep it to be safe.
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
      openRideAppService(appName, rideModalShop.value);
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
          return [...nearby.slice(0, pageLimit.value - 1), activeShop];
        }
      }
      return nearby.slice(0, pageLimit.value);
    });

    const carouselShopIds = computed(() => carouselShops.value.map((s) => s.id));
  
    // ✅ Phase 5 Refine: Suggested Venues for empty state
    const suggestedShops = computed(() => {
      // Recommend 3 LIVE or popular shops
      return shops.value.filter((s) => s.status === "LIVE").slice(0, 3);
    });
  
    // --- Fresh Feed & Filter Logic ---
    const loadedVenueIds = ref(new Set());
    const isRefreshing = ref(false);
    const activeFilters = ref([]);

    // RPC Call Wrapper
    const fetchFreshBatch = async (reset = false) => {
        if (isRefreshing.value) return;
        isRefreshing.value = true;
        
        try {
            if (reset) {
                loadedVenueIds.value.clear();
                // Optionally maintain active shop if needed, or just clear all
            }
            
            // Get current location
            const [lat, lng] = userLocation.value || [18.788, 98.985];
            const radius = 5000;
            const exclude = Array.from(loadedVenueIds.value);
            
            // Call RPC (or fallback to filter logic if RPC not ready)
            // const { data, error } = await supabase.rpc('get_random_nearby_venues', { ... })
            // For MVP without live RPC running yet, we simulate with client-side filter + shuffle
            
            // Simulation:
            let candidates = rawShops.value.filter(s => !loadedVenueIds.value.has(s.id));
            
            // Apply Category Filters
            if (activeFilters.value.length > 0) {
                candidates = candidates.filter(s => 
                   activeFilters.value.some(f => s.category?.includes(f) || (f === 'Recommended' && s.isPromoted))
                );
            }
            
            // Randomize
            candidates = candidates.sort(() => Math.random() - 0.5).slice(0, 30);
            
            // Append
            if (reset) {
                 // Update store directly? 
                 // We might need a direct setter in store or just update localNearbyShops logic?
                 // Current logic relies on `localNearbyShops` computed from `filteredShops`.
                 // To support "Fresh Batch", we might need to override the sources.
            }
            
            // Add to tracked IDs
            candidates.forEach(s => {
              loadedVenueIds.value.add(s.id);
            });
            
        } catch (e) {
            console.error("Refresh failed", e);
        } finally {
            setTimeout(() => {
                isRefreshing.value = false;
                successFeedback();
            }, 1000);
        }
    };
    
    const handleRefresh = () => fetchFreshBatch(true);
    
    const handleFilterApply = (filters) => {
        activeFilters.value = filters;
        fetchFreshBatch(true);
    };
  
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
    // ✅ Apply Deep Link / Selection Logic
  const applyShopSelection = (shopId, autoImmersive = false) => {
    if (!shopId) return;

    activeShopId.value = Number(shopId);
    shopStore.setActiveShop(shopId);
    
    // Auto-Immersive (Deep Link)
    if (autoImmersive) {
        isImmersive.value = true;
    }

    const shop = shops.value.find((s) => s.id == shopId);
    if (shop) {
      if (shop.lat && shop.lng) {
        // Fly to location
        mapRef.value?.flyTo([shop.lng, shop.lat], 17);
        selectedShopCoords.value = [shop.lat, shop.lng];
      }
      // Sync Carousel
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
    }
  };



  const handleCardHover = (_shop) => {
    // Optional: pre-fetch or highlight
    // applyShopSelection(shop.id); // Maybe too aggressive on hover
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
      // selectedShop.value = shop;
    };
  
    // Live count
    const liveCount = computed(() => {
      return shops.value.filter((s) => s.status === "LIVE").length;
    });

    const isDev = import.meta.env.DEV;

    // ✅ Take Me Home Feature
    // Stores the user's initial location when they first open the app
    const homeLocation = ref(null);
    
    onMounted(() => {
      // Try to load saved home location
      const savedHome = localStorage.getItem('vibecity_home_location');
      if (savedHome) {
        try {
          homeLocation.value = JSON.parse(savedHome);
        } catch (e) {
          // Invalid data, will be set on first location request
        }
      }
    });

    // Watch for first location update to set as "home"
    watch(userLocation, (newLoc) => {
      if (newLoc && !homeLocation.value) {
        homeLocation.value = { lat: newLoc[0], lng: newLoc[1], timestamp: Date.now() };
        localStorage.setItem('vibecity_home_location', JSON.stringify(homeLocation.value));
      }
    }, { once: true });

    const handleTakeMeHome = () => {
      if (!homeLocation.value) {
        // No home location saved yet
        alert('No home location saved. Your first location will be saved as home.');
        return;
      }
      
      successFeedback();
      
      // Open ride app with home as destination
      const { lat, lng } = homeLocation.value;
      
      // Try Grab first, then Bolt, then Google Maps
      const grabUrl = `grab://open?screenType=BOOKING&dropOffLatLng=${lat},${lng}`;
      const boltUrl = `bolt://ride?dest_lat=${lat}&dest_lng=${lng}`;
      const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      
      // Detect platform and use appropriate URL
      const userAgent = navigator.userAgent.toLowerCase();
      
      if (/android/i.test(userAgent)) {
        // Try Grab first on Android
        window.location.href = grabUrl;
        setTimeout(() => {
          // Fallback to Google Maps if Grab doesn't open
          window.open(googleMapsUrl, '_blank');
        }, 2500);
      } else if (/iphone|ipad|ipod/i.test(userAgent)) {
        // iOS - try Grab
        window.location.href = grabUrl;
        setTimeout(() => {
          window.open(googleMapsUrl, '_blank');
        }, 2500);
      } else {
        // Desktop - just open Google Maps
        window.open(googleMapsUrl, '_blank');
      }
    };

    const handleOpenSOS = () => {
      // This is handled by the sidebar component itself
      // But we can log analytics or trigger additional actions here
      tapFeedback();
    };

    // ✅ Giant Pin View Handlers
    const handleEnterGiantView = (building) => {
      selectFeedback();
      // Fly to the building location
      if (building && building.lat && building.lng && mapRef.value) {
        mapRef.value.flyTo({
          center: [building.lng, building.lat],
          zoom: 18,
          pitch: 60,
          bearing: 0,
          essential: true,
        });
      }
    };

    const handleExitGiantView = () => {
      tapFeedback();
      // Reset to normal view
      if (userLocation.value && mapRef.value) {
        mapRef.value.flyTo({
          center: [userLocation.value[1], userLocation.value[0]],
          zoom: 15,
          pitch: 45,
          bearing: 0,
          essential: true,
        });
      }
    };
  
    // Global onGlobalTouchStart/End (defined but empty in original script? Checking if used.)
    // They are referenced in onUnmounted but not onMounted or defined in snippet.
    // I shall define them to avoid reference errors, assuming they might have been intended or missed.
    // If they were missed in snippet, empty functions are safer than crashing.
    const onGlobalTouchStart = () => {};
    const onGlobalTouchEnd = () => {};
  
    // --- Immersive Mode Logic ---
    const isImmersive = ref(false);
    const toggleImmersive = () => {
        isImmersive.value = !isImmersive.value;
        // Optionally trigger map resize or analytics
    };

    return {
      // Refs & State
      mapRef,
      bottomUiRef,
      mobileCardScrollRef,
      isMobileView,
      isLandscape,
      isDarkMode,
      isDataLoading,
      errorMessage,
      showConfetti,
      showSidebar,
      showProfileDrawer,
      showMallDrawer,
      showCategoryDropdown,
      showFloorSelector,
      showSearchResults,
      isVibeNowCollapsed,
      isIndoorView,
      isPanelOpen,
      activeTab,
      activeShopId,
      activeCategories,
      activeZone,
      activeProvince,
      activeBuilding,
      activeFloor,
      activeMall,
      activePopup: ref(null), // Was shallowRef in MapboxContainer, but here in App.vue likely just needed if passed? Keeping minimal.
      userLocation,
      userLevel,
      totalCoins,
      nextLevelXP,
      levelProgress,
      favorites,
      selectedShop,
      rideModalShop,
      realTimeEvents,
      timedEvents,
      galleryImages,
      isGalleryOpen,
      dailyCheckinRef,
      luckyWheelRef,
      currentUserStats,
      globalSearchQuery,
      legendHeight,
  
      // Computed
      shops,
      filteredShops,
      currentTime,
      activeStatus,
      carouselShops,
      carouselShopIds,
      suggestedShops,
      mallShops,
      activeEvents,
      globalSearchResults,
      selectedShopCoords,
      mapUiTopOffset,
      mapUiBottomOffset,
      liveCount,
  
      // Methods
      t, 
      locale,
      toggleLanguage,
      toggleTheme,
      toggleVibeNow,
      smoothFlyTo,
      handleMarkerClick,
      handleCardClick,
      handleCardHover,
      handleOpenDetail,
      handlePanelScroll,
      handleSwipe,
      handleGlobalSearchSelect,
      handleSearchBlur,
      handleEnterIndoor,
      handleCloseFloorSelector,
      handleBuildingOpen,
      handleLegendHeightChange,
      openRideModal,
      closeRideModal,
      openRideApp,
      toggleFavorite,
      isFavorited,
      requestGeolocation,
      handleLocateMe,
      triggerConfetti,
      triggerError,
      retryLoad: () => window.location.reload(),
      
      // Scroll Engine
      handleHorizontalScroll,
      onScrollStart,
      onScrollEnd,
      scrollToCard,
  
      // Haptics
      tapFeedback,
      selectFeedback,
      successFeedback,
      
      isDev,
      isLowPowerMode,
      isUiVisible, // ✅ Auto-hide UI
      wakeUi,      // ✅ Auto-hide UI
      isMuted,     // ✅ Audio Control
      toggleMute,  // ✅ Audio Control
      loadMoreVibes, // ✅ Infinite Scroll
      
      // Feature: Immersive Mode
      isImmersive,
      toggleImmersive,

      // Feature: Fresh Feed
      isRefreshing,
      handleRefresh,
      handleFilterApply,
      activeFilters,

      // Feature: Safety (SOS & Take Me Home)
      handleTakeMeHome,
      handleOpenSOS,
      homeLocation,

      // Feature: Giant Pin View
      handleEnterGiantView,
      handleExitGiantView
    };
  }
