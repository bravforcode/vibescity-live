<script setup>
import { defineAsyncComponent, ref, computed, watch as vueWatch } from "vue";
import {
  LayoutGrid,
  List,
  Users,
  MapPin,
  Clock,
  Heart,
  Share2,
  X,
  Navigation,
  Phone,
} from "lucide-vue-next";
import SwipeCard from "../ui/SwipeCard.vue";
import ShopCard from "../panel/ShopCard.vue";
import VisitorCount from "../ui/VisitorCount.vue";
import PullToRefresh from "../ui/PullToRefresh.vue";

const SkeletonCard = defineAsyncComponent(
  () => import("../ui/SkeletonCard.vue"),
);

const props = defineProps({
  isDataLoading: Boolean,
  isRefreshing: Boolean,
  isImmersive: Boolean, // Feature: Immersive Mode
  isDarkMode: Boolean,
  isIndoorView: Boolean,
  activeFloor: String,
  liveCount: Number,
  carouselShops: {
    type: Array,
    default: () => [],
  },
  suggestedShops: {
    type: Array,
    default: () => [],
  },
  favorites: {
    type: Array,
    default: () => [],
  },
  activeShopId: [Number, String],
  mallShops: {
    type: Array,
    default: () => [],
  },
  setBottomUiRef: Function,
  setMobileCardScrollRef: Function,
});

const emit = defineEmits([
  "click-shop",
  "open-detail",
  "open-ride",
  "swipe-left",
  "swipe-right",
  "toggle-favorite",
  "toggle-immersive",
  "refresh",
  "set-active-floor",
  "reset-filters",
  "scroll",
  "scroll-start",
  "scroll-end",
  "load-more",
  "enter-giant-view",
  "exit-giant-view",
]);

const isFavorited = (shopId) => {
  return props.favorites.includes(Number(shopId));
};

const isGridView = ref(false);
const toggleView = () => {
  isGridView.value = !isGridView.value;
};

// ✅ TikTok-style Video Expansion State
const isVideoExpanded = ref(false);
const expandedShop = ref(null);
const videoRef = ref(null);

// ✅ Giant Pin View State (70/30 Split)
const isGiantPinView = ref(false);
const activeGiantPin = ref(null);
const giantPinShops = ref([]);
const selectedGiantShop = ref(null);

// ✅ Detect if current shop is a Giant Pin (building)
const currentShopIsGiant = computed(() => {
  if (!props.activeShopId) return false;
  const shop = props.carouselShops.find(s => s.id == props.activeShopId);
  return shop?.is_giant_active || shop?.isGiantPin || false;
});

// ✅ Watch for Giant Pin activation
vueWatch(() => props.activeShopId, (newId) => {
  if (!newId) {
    isGiantPinView.value = false;
    activeGiantPin.value = null;
    return;
  }

  const shop = props.carouselShops.find(s => s.id == newId);
  if (shop?.is_giant_active || shop?.isGiantPin) {
    // Activate Giant Pin View
    activeGiantPin.value = shop;
    isGiantPinView.value = true;
    // Get shops inside this building
    giantPinShops.value = props.carouselShops.filter(s =>
      s.Building === shop.name || s.Building === shop.Building
    );
    selectedGiantShop.value = giantPinShops.value[0] || shop;
    emit("enter-giant-view", shop);
  } else {
    isGiantPinView.value = false;
    activeGiantPin.value = null;
  }
});

// ✅ Exit Giant Pin View
const exitGiantView = () => {
  isGiantPinView.value = false;
  activeGiantPin.value = null;
  emit("exit-giant-view");
};

// ✅ Select shop within Giant Pin
const selectGiantShop = (shop) => {
  selectedGiantShop.value = shop;
  emit("click-shop", shop);
};

// ✅ Expand video when card is centered
const expandVideo = (shop) => {
  if (!shop) return;
  expandedShop.value = shop;
  isVideoExpanded.value = true;

  // Try to play video
  nextTick(() => {
    if (videoRef.value) {
      videoRef.value.muted = true;
      videoRef.value.play().catch(() => {});
    }
  });
};

// ✅ Close expanded video
const closeExpandedVideo = () => {
  isVideoExpanded.value = false;
  if (videoRef.value) {
    videoRef.value.pause();
  }
  expandedShop.value = null;
};

const handleScroll = (e) => {
  emit("scroll", e);
  // Simple load-more logic
  const { scrollLeft, scrollWidth, clientWidth } = e.target;
  if (scrollLeft + clientWidth >= scrollWidth - 200) {
    emit("load-more");
  }
};

// ⚡️ S-Tier Scroll Observation (IntersectionObserver)
// Tracks which card is most visible in the viewport
import { onMounted, onUnmounted, nextTick, watch } from "vue";

const observerOptions = {
  root: null, // Use viewport (mobile) or container? Container is better.
  rootMargin: "-10% 0px -10% 0px", // Shrink hit area to center
  threshold: 0.6, // Trigger when 60% of card is visible
};

let observer = null;

const setupObserver = () => {
  if (observer) observer.disconnect();

  // Target the specific scroll container
  const rootEl = document.querySelector('[data-testid="vibe-carousel"]');

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Get ID from data attribute
          const id = entry.target.getAttribute("data-shop-id");
          if (id && Number(id) !== props.activeShopId) {
            const shop = props.carouselShops.find((s) => s.id == id);
            // Emit new active ID
            emit("click-shop", shop);

            // ✅ Auto-expand video when card is centered (TikTok style)
            // Only expand if it's a regular card (not Giant Pin)
            if (shop && !shop.is_giant_active && !shop.isGiantPin) {
              // Delay slightly for smooth UX
              setTimeout(() => {
                if (Number(props.activeShopId) === Number(id)) {
                  expandVideo(shop);
                }
              }, 500);
            }
          }
        }
      });
    },
    {
      root: rootEl,
      threshold: 0.7, // High threshold for "snap" feel
    },
  );

  // Observe all cards
  nextTick(() => {
    const cards = document.querySelectorAll(".vibe-card-item");
    cards.forEach((el) => {
      observer.observe(el);
    });
  });
};

onMounted(() => {
  // delay slightly to ensure DOM is ready
  setTimeout(setupObserver, 500);
});

// Re-observe when data changes
watch(
  () => props.carouselShops,
  () => {
    setTimeout(setupObserver, 300);
  },
);

onUnmounted(() => {
  if (observer) observer.disconnect();
});
</script>

<template>
  <div
    :ref="setBottomUiRef"
    data-testid="bottom-feed"
    :class="[
      'transition-all duration-500 ease-in-out',
      isImmersive
        ? 'fixed inset-0 z-[2000] bg-black/90 pointer-events-auto'
        : 'absolute bottom-0 left-0 right-0 z-[1200] pb-10 pointer-events-none',
    ]"
  >
    <!-- ✅ TikTok-Style Video Expansion Overlay -->
    <transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isVideoExpanded && expandedShop"
        class="fixed inset-0 z-[3000] bg-black flex flex-col"
      >
        <!-- Video/Image Container -->
        <div class="flex-1 relative">
          <video
            v-if="expandedShop.Video_URL"
            ref="videoRef"
            :src="expandedShop.Video_URL"
            :poster="expandedShop.Image_URL1"
            muted
            loop
            playsinline
            autoplay
            class="absolute inset-0 w-full h-full object-cover"
          />
          <img
            v-else-if="expandedShop.Image_URL1"
            :src="expandedShop.Image_URL1"
            class="absolute inset-0 w-full h-full object-cover"
          />
          <div v-else class="absolute inset-0 bg-gradient-to-br from-purple-600 to-pink-600"></div>

          <!-- Gradient overlay -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40"></div>

          <!-- Close button -->
          <button
            @click="closeExpandedVideo"
            class="absolute top-12 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white z-10"
          >
            <X class="w-5 h-5" />
          </button>

          <!-- Shop Info Overlay -->
          <div class="absolute bottom-20 left-4 right-16 z-10">
            <h2 class="text-2xl font-black text-white mb-2 drop-shadow-lg">
              {{ expandedShop.name }}
            </h2>
            <p class="text-sm text-white/80 mb-3 line-clamp-2">
              {{ expandedShop.description || expandedShop.category }}
            </p>
            <div class="flex items-center gap-3">
              <span class="px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-bold text-white">
                {{ expandedShop.category || 'Venue' }}
              </span>
              <span v-if="expandedShop.distance" class="text-xs text-white/70 flex items-center gap-1">
                <MapPin class="w-3 h-3" />
                {{ expandedShop.distance.toFixed(1) }}km
              </span>
            </div>
          </div>

          <!-- Right Side Actions (TikTok style) -->
          <div class="absolute right-4 bottom-32 flex flex-col gap-4 z-10">
            <button
              @click="emit('toggle-favorite', expandedShop.id)"
              class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20"
              :class="isFavorited(expandedShop.id) ? 'text-pink-500' : 'text-white'"
            >
              <Heart class="w-6 h-6" :fill="isFavorited(expandedShop.id) ? 'currentColor' : 'none'" />
            </button>
            <button
              @click="emit('open-ride', expandedShop)"
              class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
            >
              <Navigation class="w-6 h-6" />
            </button>
            <button
              class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
            >
              <Share2 class="w-6 h-6" />
            </button>
          </div>
        </div>

        <!-- Bottom Action Bar -->
        <div class="p-4 bg-black/90 backdrop-blur-xl border-t border-white/10">
          <div class="flex gap-3">
            <button
              @click="emit('open-detail', expandedShop)"
              class="flex-1 py-3 rounded-xl bg-white text-black font-bold text-sm"
            >
              View Details
            </button>
            <button
              @click="emit('open-ride', expandedShop)"
              class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <Navigation class="w-4 h-4" />
              Get Directions
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ✅ Giant Pin 70/30 Split View -->
    <div
      v-if="isGiantPinView && activeGiantPin"
      class="fixed inset-0 z-[2500] flex bg-black pointer-events-auto"
    >
      <!-- Left Side (70%) - Shop Details -->
      <div class="w-[70%] h-full flex flex-col overflow-hidden border-r border-white/10">
        <!-- Header -->
        <div class="p-4 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-black text-white">{{ activeGiantPin.name }}</h2>
            <p class="text-xs text-white/60">{{ giantPinShops.length }} shops inside</p>
          </div>
          <button
            @click="exitGiantView"
            class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Selected Shop Content -->
        <div v-if="selectedGiantShop" class="flex-1 overflow-y-auto">
          <!-- Video/Image -->
          <div class="relative aspect-video bg-zinc-900">
            <video
              v-if="selectedGiantShop.Video_URL"
              :src="selectedGiantShop.Video_URL"
              :poster="selectedGiantShop.Image_URL1"
              muted
              loop
              playsinline
              autoplay
              class="w-full h-full object-cover"
            />
            <img
              v-else-if="selectedGiantShop.Image_URL1"
              :src="selectedGiantShop.Image_URL1"
              class="w-full h-full object-cover"
            />
          </div>

          <!-- Shop Info -->
          <div class="p-4 space-y-4">
            <div>
              <h3 class="text-xl font-black text-white mb-1">{{ selectedGiantShop.name }}</h3>
              <p class="text-sm text-white/60">{{ selectedGiantShop.category }}</p>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-2">
              <button
                @click="emit('open-ride', selectedGiantShop)"
                class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <Navigation class="w-4 h-4" />
                Directions
              </button>
              <button
                class="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <Phone class="w-4 h-4" />
                Call
              </button>
            </div>

            <!-- Description -->
            <div class="p-4 rounded-xl bg-white/5 border border-white/10">
              <h4 class="text-xs font-black text-white/40 uppercase tracking-widest mb-2">About</h4>
              <p class="text-sm text-white/80 leading-relaxed">
                {{ selectedGiantShop.description || 'Discover this amazing venue inside ' + activeGiantPin.name }}
              </p>
            </div>

            <!-- Visitor Count -->
            <div class="p-4 rounded-xl bg-white/5 border border-white/10">
              <h4 class="text-xs font-black text-white/40 uppercase tracking-widest mb-2">Current Vibe</h4>
              <VisitorCount :shopId="selectedGiantShop.id" :isDarkMode="true" />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Side (30%) - Shop List -->
      <div class="w-[30%] h-full flex flex-col bg-zinc-900/50">
        <div class="p-3 border-b border-white/10">
          <h3 class="text-xs font-black text-white/40 uppercase tracking-widest">Shops in Building</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div
            v-for="shop in giantPinShops"
            :key="shop.id"
            @click="selectGiantShop(shop)"
            class="relative rounded-xl overflow-hidden cursor-pointer transition-all active:scale-95"
            :class="selectedGiantShop?.id === shop.id ? 'ring-2 ring-blue-500' : 'opacity-70 hover:opacity-100'"
          >
            <div class="aspect-[4/3] relative">
              <img
                v-if="shop.Image_URL1"
                :src="shop.Image_URL1"
                class="w-full h-full object-cover"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
              <div class="absolute bottom-2 left-2 right-2">
                <h4 class="text-xs font-bold text-white truncate">{{ shop.name }}</h4>
                <p class="text-[10px] text-white/60">{{ shop.category }}</p>
              </div>
            </div>
          </div>

          <div v-if="giantPinShops.length === 0" class="p-4 text-center text-white/40 text-xs">
            No shops found in this building
          </div>
        </div>
      </div>
    </div>

    <!-- ✅ Minimal Handle Bar for Visual Feedback -->
    <div v-if="!isGiantPinView" class="flex items-center justify-center py-2 pointer-events-auto">
      <div class="w-10 h-1 rounded-full bg-white/30"></div>
    </div>

    <!-- Grid View -->
    <div
      v-if="isGridView"
      @scroll="handleScroll"
      class="px-4 py-2 pb-24 h-[60vh] overflow-y-auto no-scrollbar grid grid-cols-2 md:grid-cols-3 gap-3 animate-fade-in pointer-events-auto"
    >
      <div
        v-for="shop in carouselShops"
        :key="shop.id"
        @click="emit('open-detail', shop)"
        class="relative aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shadow-xl active:scale-95 transition-all hover:shadow-2xl hover:shadow-purple-500/20"
      >
        <img
          v-if="shop.Image_URL1"
          :src="shop.Image_URL1"
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div
          class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"
        ></div>

        <!-- Badges -->
        <div class="absolute top-2 left-2 flex flex-col gap-1.5 z-10">
          <div
            v-if="shop.status === 'LIVE'"
            class="px-2 py-1 rounded-lg bg-red-600 text-white text-[9px] font-black animate-pulse shadow-lg backdrop-blur-sm border border-red-400/50"
          >
            <span class="flex items-center gap-1">
              <span class="w-1.5 h-1.5 bg-white rounded-full"></span>
              LIVE
            </span>
          </div>
          <div
            v-if="shop.isPromoted"
            class="px-2 py-1 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[9px] font-black shadow-lg border border-yellow-300/50"
          >
            ⭐ HOT
          </div>
        </div>

        <!-- Info -->
        <div class="absolute bottom-0 left-0 right-0 p-3 z-10">
          <h4 class="text-sm font-black text-white leading-tight truncate mb-1">
            {{ shop.name }}
          </h4>
          <div class="flex items-center gap-2 mb-2">
            <span
              class="text-[10px] font-bold text-white/70 uppercase tracking-wide"
            >
              {{ shop.category || "Bar" }}
            </span>
            <span
              v-if="shop.distance !== undefined"
              class="text-[10px] font-black text-blue-400 flex items-center gap-0.5"
            >
              <MapPin class="w-3 h-3" />
              {{ shop.distance.toFixed(1) }}km
            </span>
          </div>
          <div class="scale-90 origin-left">
            <VisitorCount :shopId="shop.id" :isDarkMode="true" />
          </div>
        </div>
      </div>

      <div
        v-if="carouselShops.length === 0"
        class="col-span-2 text-center text-white/40 text-xs py-10"
      >
        No items to display
      </div>
    </div>

    <!-- Horizontal Carousel -->
    <div v-else class="relative min-h-[100px]">
      <!-- Loading State -->
      <div
        v-if="isDataLoading"
        class="flex items-end px-[calc(50vw-90px)] py-4 gap-4 no-scrollbar mb-0 h-[320px] overflow-x-hidden"
      >
        <SkeletonCard
          v-for="i in 5"
          :key="`skel-${i}`"
          variant="carousel"
          :isDarkMode="isDarkMode"
          class="pointer-events-auto"
          style="width: 200px; height: 280px"
        />
      </div>

      <!-- Empty State -->
      <div
        v-else-if="carouselShops.length === 0"
        class="flex flex-col items-center justify-center py-10 text-center px-10 animate-fade-in pointer-events-auto"
      >
        <div
          class="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center mb-4 border border-white/10 shadow-xl"
        >
          <span class="text-4xl">🔍</span>
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
          class="text-[10px] font-bold text-white/40 mt-2 mb-8 uppercase tracking-widest"
        >
          เราได้คัดมาให้คุณแล้ว
        </p>

        <div class="flex gap-3 mb-8">
          <div
            v-for="s in suggestedShops"
            :key="s.id"
            @click="emit('click-shop', s)"
            class="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/30 active:scale-90 transition-all cursor-pointer shadow-2xl hover:shadow-purple-500/30"
          >
            <img
              v-if="s.Image_URL1"
              :src="s.Image_URL1"
              class="w-full h-full object-cover"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-purple-600/60 to-transparent"
            ></div>
          </div>
        </div>

        <button
          @click="emit('reset-filters')"
          class="px-8 py-3 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[11px] font-black uppercase tracking-widest active:scale-95 shadow-[0_0_30px_rgba(37,99,235,0.5)] hover:shadow-[0_0_40px_rgba(37,99,235,0.7)] transition-all border border-white/20"
        >
          ดูสถานที่อื่นๆ ทั้งหมด
        </button>
      </div>

      <!-- Cards Carousel / Vertical Feed -->
      <PullToRefresh
        v-else
        :is-refreshing="isRefreshing"
        @refresh="emit('refresh')"
      >
        <div
          :ref="setMobileCardScrollRef"
          data-testid="vibe-carousel"
          :class="[
            'flex gap-5 no-scrollbar items-center snap-mandatory transition-all duration-500',
            isImmersive
              ? 'flex-col h-full overflow-y-auto overflow-x-hidden pt-0 pb-0 gap-0 snap-y'
              : 'flex-row overflow-x-auto overflow-y-visible px-0 py-4 mb-0 snap-x h-[350px] items-end',
          ]"
          style="-webkit-overflow-scrolling: touch; scroll-behavior: smooth"
          @scroll="handleScroll"
          @touchstart="emit('scroll-start')"
          @touchend="emit('scroll-end')"
          @mousedown="emit('scroll-start')"
          @mouseup="emit('scroll-end')"
        >
          <!-- Spacer only for horizontal mode -->
          <div
            v-if="!isImmersive"
            class="flex-shrink-0 w-[calc(50vw-110px)]"
          ></div>

          <template v-if="isIndoorView">
            <!-- Indoor logic preserved (omitted for brevity, assume similar structure or hidden in immersive) -->
            <!-- For MVP, we focus Immersive on the main carousel -->
            <ShopCard
              v-for="shop in mallShops.filter((s) => s.Floor === activeFloor)"
              :key="`indoor-${shop.id}`"
              :shop="shop"
              class="flex-shrink-0 w-[340px] h-[400px] snap-center"
              @click="emit('click-shop', shop)"
            />
          </template>

          <!-- Premium Outdoor Cards -->
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
              ]"
              @swipe-left="emit('swipe-left', shop)"
              @swipe-right="emit('swipe-right', shop)"
              @expand="emit('open-detail', shop)"
              @toggle-favorite="emit('toggle-favorite', shop.id)"
              :data-shop-id="shop.id"
              :is-immersive="isImmersive"
              class="vibe-card-item flex-shrink-0 transition-all duration-500 ease-out snap-center"
              :class="[
                isImmersive
                  ? 'w-full h-[100dvh] rounded-none scale-100 opacity-100'
                  : 'w-[220px] h-[260px]',
                !isImmersive && activeShopId === shop.id
                  ? 'scale-100 z-20'
                  : '',
                !isImmersive && activeShopId !== shop.id
                  ? 'scale-90 opacity-70 blur-[1px]'
                  : '',
              ]"
            >
              <!-- Overlay UI for Immersive Mode -->
              <div
                v-if="isImmersive"
                class="absolute right-4 bottom-24 flex flex-col gap-4 z-40"
              >
                <button
                  class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                >
                  <Heart class="w-6 h-6" />
                </button>
                <button
                  class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                >
                  <MapPin class="w-6 h-6" />
                </button>
                <button
                  class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                >
                  <Share2 class="w-6 h-6" />
                </button>
              </div>

              <ShopCard
                :shop="shop"
                :is-active="activeShopId === shop.id || isImmersive"
                :is-dark-mode="true"
                :favorites="favorites"
                :use-ride-button="true"
                class="absolute inset-0 w-full h-full"
                @click="emit('click-shop', shop)"
                @open-detail="emit('open-detail', shop)"
                @open-ride="emit('open-ride', shop)"
                @toggle-favorite="emit('toggle-favorite', shop.id)"
              />
            </SwipeCard>
          </template>

          <div
            v-if="!isImmersive"
            class="flex-shrink-0 w-[calc(50vw-110px)]"
          ></div>
        </div>
      </PullToRefresh>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ✅ GPU-accelerated smooth scrolling */
[data-testid="vibe-carousel"] {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  will-change: scroll-position;
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* ✅ Card snap behavior */
.vibe-card-item {
  scroll-snap-align: center;
  scroll-snap-stop: always;
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* ✅ Reduce paint on scroll */
.snap-center {
  contain: layout style paint;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out forwards;
}

/* ✅ Mobile touch optimization */
@media (hover: none) and (pointer: coarse) {
  [data-testid="vibe-carousel"] {
    scroll-snap-type: x proximity;
  }
}
</style>
