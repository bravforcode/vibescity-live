<!-- src/views/HomeView.vue -->
<script setup>
import { defineAsyncComponent, ref } from "vue";
// ✅ Import New Modular Components
import BottomFeed from "../components/feed/BottomFeed.vue";
import SmartHeader from "../components/layout/SmartHeader.vue";
import AppModals from "../components/system/AppModals.vue";
import SidebarDrawer from "../components/ui/SidebarDrawer.vue"; // ✅ Sync Import to fix loading
import { useAppLogic } from "../composables/useAppLogic";

// ✅ Async Components (Preserved)
const MapContainer = defineAsyncComponent(
  () => import("../components/map/MapboxContainer.vue"),
);
const VideoPanel = defineAsyncComponent(
  () => import("../components/panel/VideoPanel.vue"),
);
// SidebarDrawer moved to sync above
const VibeError = defineAsyncComponent(
  () => import("../components/ui/VibeError.vue"),
);
const VibeSkeleton = defineAsyncComponent(
  () => import("../components/ui/VibeSkeleton.vue"),
);
const SwipeCard = defineAsyncComponent(
  () => import("../components/ui/SwipeCard.vue"),
);
const ImmersiveFeed = defineAsyncComponent(
  () => import("../components/feed/ImmersiveFeed.vue"),
);
const MerchantRegister = defineAsyncComponent(
  () => import("../components/panel/MerchantRegister.vue"),
);
/* const OwnerDashboard = defineAsyncComponent(
  () => import("../components/dashboard/OwnerDashboard.vue"),
); */
const AddShopModal = defineAsyncComponent(
  () => import("../components/ugc/AddShopModal.vue"),
);

const showMerchantModal = ref(false);
const showAddShopModal = ref(false);
// const showOwnerDashboard = ref(false); // Removed: Handled by Router

const FilterMenu = defineAsyncComponent(
  () => import("../components/ui/FilterMenu.vue"),
);
const RelatedShopsDrawer = defineAsyncComponent(
  () => import("../components/ui/RelatedShopsDrawer.vue"),
);
const showFilterMenu = ref(false);
const showRelatedDrawer = ref(false); // Stack View Logic

import { useHead } from "@unhead/vue";

// ✅ Global SEO
useHead({
  titleTemplate: (title) =>
    title ? `${title} | VibeCity` : "VibeCity - Chiang Mai Entertainment",
  meta: [
    {
      name: "description",
      content:
        "Discover the best nightlife, cafes, and events in Chiang Mai. Real-time vibes, exclusive deals, and local secrets.",
    },
    { property: "og:image", content: "https://vibecity.live/og-image.jpg" },
  ],
});

// ✅ Initialize Logic
const {
  // Refs
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
  activePopup,
  userLocation,
  userLevel,
  totalCoins,
  favorites,
  selectedShop,
  rideModalShop,
  realTimeEvents,
  globalSearchQuery,
  globalSearchResults,
  legendHeight,
  isLowPowerMode,
  currentTime,
  activeStatus,
  isRefreshing,
  isImmersive,
  toggleImmersive,
  handleRefresh,
  handleFilterApply,
  activeFilters,

  // Computed
  shops,
  filteredShops,
  carouselShops,
  carouselShopIds,
  suggestedShops,
  mallShops,
  activeEvents,
  selectedShopCoords,
  mapUiTopOffset,
  mapUiBottomOffset,
  liveCount,

  // Methods
  t,
  toggleLanguage,
  handleMarkerClick,
  handleCardClick,
  handleCardHover,
  handleOpenDetail,
  handlePanelScroll,
  handleSwipe,
  handleGlobalSearchSelect,
  handleEnterIndoor,
  handleCloseFloorSelector,
  handleBuildingOpen,
  openRideModal,
  closeRideModal,
  openRideApp,
  toggleFavorite,
  requestGeolocation,
  handleLocateMe,
  retryLoad,

  // Scroll Engine
  handleHorizontalScroll,
  onScrollStart,
  onScrollEnd,

  // Haptics
  tapFeedback,
  selectFeedback,
  isUiVisible, // ✅ Auto-hide UI
  wakeUi, // ✅ Manual wake
  isMuted, // ✅ Audio
  toggleMute, // ✅ Audio
  loadMoreVibes, // ✅ Infinite Scroll

  // Safety Features
  handleTakeMeHome,
  handleOpenSOS,

  // Giant Pin View
  handleEnterGiantView,
  handleExitGiantView,
} = useAppLogic();

// ✅ Ref Forwarding Helpers
const setBottomUiRef = (el) => {
  bottomUiRef.value = el;
};
const setMobileCardScrollRef = (el) => {
  mobileCardScrollRef.value = el;
};

// ✅ Giant Pin State Sync
const isGiantPinView = ref(false);
const onEnterGiantView = (shop) => {
  isGiantPinView.value = true;
  handleEnterGiantView(shop);
};
const onExitGiantView = () => {
  isGiantPinView.value = false;
  handleExitGiantView();
};

// 🔍 DEBUG: Trace UI State
import { onMounted, watch } from "vue";
onMounted(() => {
  console.log("🔍 [HomeView] Mounted");
  console.log("🔍 [HomeView] isMobileView:", isMobileView.value);
  console.log("🔍 [HomeView] isLandscape:", isLandscape.value);
  console.log("🔍 [HomeView] isUiVisible:", isUiVisible.value);
  console.log("🔍 [HomeView] carouselShops:", carouselShops.value?.length);
});

watch([isMobileView, isLandscape, isUiVisible], ([m, l, v]) => {
  console.log(
    `🔍 [HomeView] State Change -> Mobile: ${m}, Landscape: ${l}, UiVisible: ${v}`,
  );
});
</script>

<template>
  <main
    :class="[
      'relative w-full h-[100dvh] overflow-hidden font-sans transition-colors duration-500',
      isDarkMode ? 'bg-void' : 'bg-gray-100',
      { 'low-power': isLowPowerMode },
    ]"
  >
    <!-- Note: isLowPowerMode is exported from useAppLogic -->

    <!-- ✅ Global Error State -->
    <VibeError v-if="errorMessage" :message="errorMessage" @retry="retryLoad" />

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

    <!-- ✅ Sidebar Drawer -->
    <div data-testid="drawer-shell">
      <SidebarDrawer
        v-if="showSidebar"
        :is-open="showSidebar"
        :user-stats="{
          name: 'Vibe Explorer',
          level: Math.floor(totalCoins / 100) + 1,
          coins: totalCoins,
          avatar: null,
        }"
        :is-muted="isMuted"
        :current-language="$i18n?.locale || 'en'"
        @close="showSidebar = false"
        @navigate="
          (id) => {
            /* Navigation Logic */
          }
        "
        @open-merchant="
          showSidebar = false;
          showMerchantModal = true;
        "
        @toggle-mute="toggleMute"
        @toggle-language="toggleLanguage"
        @take-me-home="handleTakeMeHome"
        @open-sos="handleOpenSOS"
        @open-dashboard="
          showSidebar = false;
          $router.push('/merchant');
        "
      />

      <MerchantRegister
        v-if="showMerchantModal"
        :is-open="showMerchantModal"
        @close="showMerchantModal = false"
      />

      <FilterMenu
        v-if="showFilterMenu"
        :is-open="showFilterMenu"
        :selected-categories="activeFilters"
        @close="showFilterMenu = false"
        @apply="handleFilterApply"
      />

      <!-- Filter button moved to be hidden during video expansion -->

      <!-- Stack View (Related Vibes) -->
      <RelatedShopsDrawer
        v-if="showRelatedDrawer"
        :is-open="showRelatedDrawer"
        :shops="suggestedShops"
        @close="showRelatedDrawer = false"
        @select-shop="handleCardClick"
      />
    </div>

    <!-- ✅ Smart Header (Auto-hide) -->
    <Transition name="ui-slide-down">
      <SmartHeader
        v-show="isUiVisible"
        :isVibeNowCollapsed="isVibeNowCollapsed"
        :isDarkMode="isDarkMode"
        :globalSearchQuery="globalSearchQuery"
        :showSearchResults="showSearchResults"
        :globalSearchResults="globalSearchResults"
        :t="t"
        @open-sidebar="showSidebar = true"
        @open-filter="showFilterMenu = true"
        @open-add-shop="showAddShopModal = true"
        @update:globalSearchQuery="(val) => (globalSearchQuery = val)"
        @update:showSearchResults="(val) => (showSearchResults = val)"
        @select-search-result="handleGlobalSearchSelect"
        @haptic-tap="tapFeedback"
        :is-immersive="isImmersive"
      />
    </Transition>

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
        <div data-testid="map-shell" class="relative">
          <MapContainer
            ref="mapRef"
            :uiTopOffset="mapUiTopOffset"
            :uiBottomOffset="mapUiBottomOffset"
            :shops="filteredShops"
            :userLocation="userLocation"
            :currentTime="currentTime"
            :highlightedShopId="activeShopId"
            :is-low-power-mode="isLowPowerMode"
            :priority-shop-ids="carouselShopIds"
            :isDarkMode="isDarkMode"
            :activeZone="activeZone"
            :activeProvince="activeProvince"
            :buildings="activeEvents"
            :is-sidebar-open="isPanelOpen"
            :selectedShopCoords="selectedShopCoords"
            :isImmersive="isImmersive"
            :isGiantPinView="isGiantPinView"
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
              <!-- Logo / Header -->
              <div
                class="absolute top-4 left-4 z-50 pointer-events-auto cursor-pointer"
                @click="handleLogoClick"
              >
                <h1
                  class="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] filter"
                >
                  VIBES<span class="text-white">CITY</span>
                </h1>
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                  ></div>
                  <span class="text-[11px] font-bold text-white">{{
                    t("legend.live_now")
                  }}</span>
                </div>
                <!-- More legend items implied, simplified in refactor as pure markup -->
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
          data-testid="map-shell"
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
            >
              <img
                :src="shop.Image_URL1"
                :alt="shop.name || 'Shop preview'"
                class="w-full h-full object-cover"
              />
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
        <!-- Full Map (Hidden in Immersive Mode) -->
        <div
          data-testid="map-shell"
          class="absolute inset-0"
          v-show="!isImmersive"
        >
          <MapContainer
            ref="mapRef"
            :uiTopOffset="mapUiTopOffset"
            :uiBottomOffset="mapUiBottomOffset"
            :shops="filteredShops"
            :userLocation="userLocation"
            :currentTime="null"
            :highlightedShopId="activeShopId"
            :is-low-power-mode="false"
            :isDarkMode="isDarkMode"
            :activeZone="activeZone"
            :activeProvince="activeProvince"
            :buildings="activeEvents"
            :isSidebarOpen="!isVibeNowCollapsed"
            :selectedShopCoords="selectedShopCoords"
            :legendHeight="legendHeight"
            :isImmersive="isImmersive"
            :isGiantPinView="isGiantPinView"
            @select-shop="handleMarkerClick"
            @open-detail="handleOpenDetail"
            @open-ride-modal="openRideModal"
            @exit-indoor="handleCloseFloorSelector"
            @open-building="handleBuildingOpen"
            class="w-full h-full"
          />
        </div>

        <!-- ✅ Immersive Feed (Replaces Map & Bottom UI) -->
        <transition name="fade">
          <ImmersiveFeed
            v-if="isImmersive"
            :initial-shop-id="activeShopId"
            @close="isImmersive = false"
            @update-shop="activeShopId = $event"
          />
        </transition>

        <!-- REMOVED Transition for Debugging -->
        <div
          v-show="isUiVisible && !isImmersive"
          class="absolute bottom-0 left-0 right-0 z-10 border-4 border-red-500 pointer-events-auto"
        >
          <BottomFeed
            ref="bottomUiRef"
            :is-data-loading="isDataLoading"
            :is-refreshing="isRefreshing"
            :is-immersive="isImmersive"
            :is-dark-mode="isDarkMode"
            :is-indoor-view="isIndoorView"
            :active-floor="activeFloor"
            :live-count="liveCount"
            :carousel-shops="carouselShops"
            :suggested-shops="suggestedShops"
            :favorites="favorites"
            :active-shop-id="activeShopId"
            :mall-shops="mallShops"
            :set-bottom-ui-ref="(el) => (bottomUiRef = el)"
            :set-mobile-card-scroll-ref="(el) => (mobileCardScrollRef = el)"
            @click-shop="handleCardClick"
            @open-detail="handleOpenDetail"
            @open-ride="openRideModal"
            @swipe-left="(shop) => handleSwipe('left', shop)"
            @swipe-right="(shop) => handleSwipe('right', shop)"
            @toggle-favorite="toggleFavorite"
            @share-shop="
              (shop) => {
                /* ✅ Handle Share safely */
                if (
                  typeof window !== 'undefined' &&
                  window.navigator &&
                  window.navigator.share
                ) {
                  window.navigator
                    .share({
                      title: shop?.name || 'VibeCity Shop',
                      text: `Check out ${shop?.name || 'this shop'} on VibeCity!`,
                      url: window.location.href,
                    })
                    .catch((err) => console.warn('Share failed:', err));
                } else {
                  console.log('Share API not supported on this browser');
                  // Optional: Fallback to clipboard copy
                }
              }
            "
            @toggle-immersive="toggleImmersive"
            @set-active-floor="(f) => (activeFloor = f)"
            @reset-filters="
              () => {
                activeCategories = [];
                activeStatus = 'ALL';
              }
            "
            @scroll="handleHorizontalScroll"
            @scroll-start="onScrollStart"
            @scroll-end="onScrollEnd"
            @load-more="loadMoreVibes"
            @refresh="handleRefresh"
            @enter-giant-view="onEnterGiantView"
            @exit-giant-view="onExitGiantView"
          />
        </div>
        <!-- /Transition -->
      </template>
    </div>

    <!-- Owner Dashboard moved to /merchant route -->

    <!-- ✅ UGC Add Shop Modal -->
    <AddShopModal
      :is-open="showAddShopModal"
      @close="showAddShopModal = false"
      @success="showAddShopModal = false"
    />

    <!-- ✅ Common Modals & Overlays -->
    <AppModals
      :selectedShop="selectedShop"
      :rideModalShop="rideModalShop"
      :showMallDrawer="showMallDrawer"
      :activeMall="activeMall"
      :mallShops="mallShops"
      :activeShopId="activeShopId"
      :favorites="favorites"
      :showProfileDrawer="showProfileDrawer"
      :isDarkMode="isDarkMode"
      :isDataLoading="isDataLoading"
      :errorMessage="errorMessage"
      :showConfetti="showConfetti"
      :userLocation="userLocation"
      @close-vibe-modal="selectedShop = null"
      @toggle-favorite="toggleFavorite"
      @close-ride-modal="closeRideModal"
      @open-ride-app="openRideApp"
      @close-mall-drawer="showMallDrawer = false"
      @select-mall-shop="handleMarkerClick"
      @open-ride-modal="openRideModal"
      @close-profile-drawer="showProfileDrawer = false"
      @toggle-language="toggleLanguage"
      @clear-error="errorMessage = null"
      @retry="retryLoad"
    />
  </main>
</template>

<style scoped>
/* Transferred Layout Styles */
.low-power {
  /* Optimize for low power mode */
  filter: contrast(0.9);
}
</style>
