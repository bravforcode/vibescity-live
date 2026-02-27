<!-- src/App.vue -->
<script setup>
import { defineAsyncComponent, ref } from "vue";
import { useAppLogic } from "./composables/useAppLogic";

// ✅ Import New Modular Components
import SmartHeader from "./components/layout/SmartHeader.vue";
import BottomFeed from "./components/feed/BottomFeed.vue";
import AppModals from "./components/system/AppModals.vue";

// ✅ Async Components (Preserved)
const MapContainer = defineAsyncComponent(
  () => import("./components/map/MapboxContainer.vue"),
);
const VideoPanel = defineAsyncComponent(
  () => import("./components/panel/VideoPanel.vue"),
);
const SidebarDrawer = defineAsyncComponent(
  () => import("./components/ui/SidebarDrawer.vue"),
);
const VibeError = defineAsyncComponent(
  () => import("./components/ui/VibeError.vue"),
);
const VibeSkeleton = defineAsyncComponent(
  () => import("./components/ui/VibeSkeleton.vue"),
);
const SwipeCard = defineAsyncComponent(
  () => import("./components/ui/SwipeCard.vue"),
);
const MerchantRegister = defineAsyncComponent(
  () => import("./components/panel/MerchantRegister.vue"),
);

const showMerchantModal = ref(false);

const FilterMenu = defineAsyncComponent(
  () => import("./components/ui/FilterMenu.vue"),
);
const RelatedShopsDrawer = defineAsyncComponent(
  () => import("./components/ui/RelatedShopsDrawer.vue"),
);
const showFilterMenu = ref(false);
const showRelatedDrawer = ref(false); // Stack View Logic

import { Menu } from "lucide-vue-next";

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
</script>

<template>
  <main
    :class="[
      'relative w-full h-[100dvh] overflow-hidden font-sans transition-colors duration-500',
      isDarkMode ? 'bg-[#0b0d11]' : 'bg-gray-100',
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

      <button
        @click="showFilterMenu = true"
        class="fixed top-20 right-4 z-[4000] w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl active:scale-95 transition-all"
      >
        <Menu class="w-5 h-5" />
      </button>

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
        @update:globalSearchQuery="(val) => (globalSearchQuery = val)"
        @update:showSearchResults="(val) => (showSearchResults = val)"
        @select-search-result="handleGlobalSearchSelect"
        @haptic-tap="tapFeedback"
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
        <div data-testid="map-shell" class="absolute inset-0">
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
            @select-shop="handleMarkerClick"
            @open-detail="handleOpenDetail"
            @open-ride-modal="openRideModal"
            @exit-indoor="handleCloseFloorSelector"
            @open-building="handleBuildingOpen"
            class="w-full h-full"
          />
        </div>

        <!-- ✅ VIBE NOW / INDOOR POI (Auto-hide) -->
        <Transition name="ui-slide-up">
          <div
            v-show="isUiVisible"
            class="absolute bottom-0 left-0 right-0 z-10"
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
              @toggle-immersive="toggleImmersive"
              @set-active-floor="(f) => (activeFloor = f)"
              @reset-filters="() => {}"
              @scroll="handleHorizontalScroll"
              @scroll-start="onScrollStart"
              @scroll-end="onScrollEnd"
              @load-more="loadMoreVibes"
              @refresh="handleRefresh"
              @enter-giant-view="handleEnterGiantView"
              @exit-giant-view="handleExitGiantView"
            />
          </div>
        </Transition>
      </template>
    </div>

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
/* Scoped styles mainly moved to components, only global overrides if any */
</style>

<style>
/* Restore Global Scrollbar from Original App.vue */
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

/* ✅ UI Transitions */
.ui-slide-down-enter-active,
.ui-slide-down-leave-active,
.ui-slide-up-enter-active,
.ui-slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); /* iOS Ease */
}

.ui-slide-down-enter-from,
.ui-slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.ui-slide-up-enter-from,
.ui-slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
