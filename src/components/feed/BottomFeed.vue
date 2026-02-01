<script setup>
import { useHead } from "@unhead/vue";
import {
  Heart,
  MapPin,
  Navigation,
  Phone,
  Send,
  Share2,
  Sparkles,
  X,
} from "lucide-vue-next";
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import PlaceCard from "../design-system/compositions/PlaceCard.vue";
import ShopCard from "../panel/ShopCard.vue";
import PullToRefresh from "../ui/PullToRefresh.vue";
import SwipeCard from "../ui/SwipeCard.vue";

const VisitorCount = defineAsyncComponent(
  () => import("../ui/VisitorCount.vue"),
);

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

// ✅ Dynamic SEO: Update Title/Meta based on Active Shop
const activeShopData = computed(() => {
  if (!props.carouselShops.length) return null;
  return props.carouselShops.find((s) => s.id === props.activeShopId);
});

useHead({
  title: computed(() =>
    activeShopData.value
      ? `${activeShopData.value.name} - VibeCity`
      : "VibeCity - Chiang Mai",
  ),
  meta: [
    {
      name: "description",
      content: computed(() =>
        activeShopData.value
          ? `Check out ${activeShopData.value.name} (${activeShopData.value.category}). ${activeShopData.value.description || "Best vibes in Chiang Mai."}`
          : "Discover top spots in Chiang Mai.",
      ),
    },
  ],
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
  "share-shop", // ✅ Added share event
]);

const isFavorited = (shopId) => {
  return props.favorites.includes(Number(shopId));
};

const isGridView = ref(false);
const toggleView = () => {
  isGridView.value = !isGridView.value;
  // ✅ Haptic feedback on mobile
  if (window.navigator.vibrate) {
    window.navigator.vibrate(10);
  }
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
  const shop = props.carouselShops.find((s) => s.id == props.activeShopId);
  return shop?.is_giant_active || shop?.isGiantPin || false;
});

// ✅ Watch for Giant Pin activation
watch(
  () => props.activeShopId,
  (newId) => {
    if (!newId) {
      isGiantPinView.value = false;
      activeGiantPin.value = null;
      return;
    }

    const shop = props.carouselShops.find((s) => s.id == newId);
    if (shop?.is_giant_active || shop?.isGiantPin) {
      // Activate Giant Pin View
      activeGiantPin.value = shop;
      isGiantPinView.value = true;
      // Get shops inside this building
      giantPinShops.value = props.carouselShops.filter(
        (s) => s.Building === shop.name || s.Building === shop.Building,
      );
      selectedGiantShop.value = giantPinShops.value[0] || shop;
      emit("enter-giant-view", shop);
    } else {
      isGiantPinView.value = false;
      activeGiantPin.value = null;
    }
  },
);

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
const canAutoExpand = ref(true); // ✅ Control flag

const expandVideo = (shop) => {
  if (!shop || !canAutoExpand.value) return; // ✅ Check permission
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

  // ✅ Cooldown period
  canAutoExpand.value = false;
  setTimeout(() => {
    canAutoExpand.value = true;
  }, 2000);
};

// ✅ Performance: Throttled Scroll Handler
let scrollFrame = null;
let lastScrollTime = 0;
const SCROLL_THROTTLE = 100; // Only run every 100ms

const handleScroll = (e) => {
  // Throttle: Skip if called too soon
  const now = Date.now();
  if (now - lastScrollTime < SCROLL_THROTTLE) return;
  lastScrollTime = now;

  emit("scroll", e);

  const container = e.target;
  const { scrollLeft, clientWidth, scrollWidth } = container;

  // 1. Infinite Scroll Trigger
  if (scrollLeft + clientWidth >= scrollWidth - 200) {
    emit("load-more");
  }

  // 2. Optimized Active Detection (using rAF)
  if (scrollFrame) cancelAnimationFrame(scrollFrame);

  scrollFrame = requestAnimationFrame(() => {
    detectActiveCard(container);
    scrollFrame = null;
  });
};

// Center Detection Logic
// Optimized Center Detection
const detectActiveCard = (container) => {
  if (!props.carouselShops.length) return;

  // 1. Immersive Mode (Vertical Snap)
  if (props.isImmersive) {
    const itemHeight = window.innerHeight; // 100dvh
    const triggerPoint = container.scrollTop + itemHeight / 2;
    const index = Math.floor(triggerPoint / itemHeight);

    const shop = props.carouselShops[index];
    if (shop && Number(shop.id) !== Number(props.activeShopId)) {
      emit("click-shop", shop);
    }
    return;
  }

  // 2. Normal Carousel (Horizontal)
  // ✅ Dynamic calculation with center offset
  const cardWidth = 220; // Original width
  // Note: Original code used 232 stride (220 + 12 gap).
  // User suggested 280 width? Let's stick to existing width logic but use center offset as requested.
  // Wait, the user's example used 280, but the CSS says w-[220px]. Let's keep 220 but improve algorithm.
  // Actually, if I look at the template: w-[220px] and gap-3 (12px). So 232 is correct stride for current CSS.
  // I will use 232 but with center offset logic.

  const cardStride = 232;
  // ✅ Dynamic calculations
  // const index = Math.round(
  //   (container.scrollLeft + container.clientWidth / 2 - cardStride / 2) /
  //     cardStride,
  // );
  // Simplified for reliability:
  const index = Math.round(container.scrollLeft / cardStride);

  const shop = props.carouselShops[index];
  if (shop && Number(shop.id) !== Number(props.activeShopId)) {
    // ✅ DEBOUNCE: Only select if user stops scrolling for 150ms
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      emit("click-shop", shop);

      // Debounced Expansion
      if (expandTimeout) clearTimeout(expandTimeout);
      expandTimeout = setTimeout(() => {
        // ✅ Loki Mode: Universal Auto-Expand (No restrictions)
        if (shop) {
          expandVideo(shop);
        }
      }, 400); // ⚡ Faster response (was 800ms)
    }, 150);
  }
};
let expandTimeout = null;
let debounceTimer = null;

// Merged onUpdated logic above if needed, removing duplicate block
onUnmounted(() => {
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  if (debounceTimer) clearTimeout(debounceTimer);
  if (expandTimeout) clearTimeout(expandTimeout);
});

// No longer need Observer
onMounted(() => {
  console.log("🔍 [BottomFeed] MOUNTED");
  console.log(
    "🔍 [BottomFeed] Props - carouselShops:",
    props.carouselShops?.length,
  );

  // initial check
  setTimeout(() => {
    const el = document.querySelector('[data-testid="vibe-carousel"]');
    if (el) detectActiveCard(el);
  }, 500);
});
</script>

<template>
  <div
    :ref="setBottomUiRef"
    data-testid="bottom-feed"
    :class="[
      'transition-all duration-500 ease-in-out',
      isImmersive
        ? 'fixed inset-0 z-[2000] bg-black pointer-events-auto'
        : 'absolute bottom-0 left-0 right-0 z-[1200] pb-safe pointer-events-auto',
    ]"
  >
    <!-- ✅ Premium TikTok-Style Video Expansion -->
    <transition
      enter-active-class="video-expand-enter"
      leave-active-class="video-expand-leave"
    >
      <div
        v-if="isVideoExpanded && expandedShop"
        class="fixed inset-0 z-[3500] pointer-events-auto overflow-hidden bg-black"
      >
        <!-- Video/Image Container with Ken Burns effect -->
        <div class="absolute inset-0 video-ken-burns">
          <video
            v-if="expandedShop.Video_URL"
            ref="videoRef"
            :src="expandedShop.Video_URL"
            :poster="expandedShop.Image_URL1"
            muted
            loop
            playsinline
            autoplay
            class="w-full h-full object-cover opacity-80"
          >
            <track kind="captions" />
          </video>
          <img
            v-else-if="expandedShop.Image_URL1"
            :src="expandedShop.Image_URL1"
            :alt="expandedShop.name"
            class="w-full h-full object-cover opacity-80"
          />
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600"
          ></div>
        </div>

        <!-- Premium gradient overlays for text readability -->
        <div
          class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/30"
        ></div>

        <!-- Close button (Map Return) - Repositioned to avoid Header Overlap -->
        <button
          @click="closeExpandedVideo"
          class="premium-button absolute top-28 right-4 px-4 py-2 rounded-full glass-button flex items-center gap-2 text-white z-[100] hover:scale-105 active:scale-95 transition-all duration-300 ease-out shadow-xl font-bold text-xs uppercase tracking-widest border border-white/20 bg-black/40 backdrop-blur-md"
          aria-label="Return to map"
        >
          <MapPin class="w-4 h-4" />
          <span>Map</span>
        </button>

        <!-- Shop Info Overlay - RESTORED & VISIBLE -->
        <div
          class="absolute bottom-[240px] left-5 right-20 z-10 animate-slide-up"
        >
          <h2
            class="text-3xl font-black text-white mb-2 drop-shadow-2xl tracking-tight"
          >
            {{ expandedShop.name }}
          </h2>
          <p
            class="text-sm text-white/80 mb-4 line-clamp-2 font-medium max-w-md"
          >
            {{ expandedShop.description || expandedShop.category }}
          </p>
          <div class="flex items-center gap-3 flex-wrap">
            <span
              class="px-3 py-1.5 rounded-full glass-pill text-xs font-bold text-white inline-flex items-center gap-1.5"
            >
              <span
                class="w-2 h-2 rounded-full bg-green-400 animate-pulse"
              ></span>
              {{ expandedShop.category || "Venue" }}
            </span>
            <span
              v-if="expandedShop.distance"
              class="text-sm text-white/70 flex items-center gap-1.5 font-medium"
            >
              <MapPin class="w-4 h-4" />
              {{ expandedShop.distance.toFixed(1) }}km away
            </span>
          </div>
        </div>

        <!-- Right Side Actions - RESTORED -->
        <div
          class="absolute right-4 bottom-[240px] flex flex-col gap-4 z-10 animate-slide-left"
        >
          <button
            @click.stop="emit('toggle-favorite', expandedShop.id)"
            class="action-button group"
            :class="
              isFavorited(expandedShop.id)
                ? 'text-pink-500 bg-pink-500/20'
                : 'text-white'
            "
          >
            <Heart
              class="w-6 h-6"
              :fill="isFavorited(expandedShop.id) ? 'currentColor' : 'none'"
            />
            <span class="action-label">Like</span>
          </button>
          <button
            @click.stop="emit('open-ride', expandedShop)"
            class="action-button text-white group"
          >
            <Send class="w-6 h-6" />
            <span class="action-label">Go</span>
          </button>
          <button
            @click.stop="emit('share-shop', expandedShop)"
            class="action-button text-white group"
          >
            <Share2 class="w-6 h-6" />
            <span class="action-label">Share</span>
          </button>
        </div>
      </div>
    </transition>

    <!-- ✅ Giant Pin Responsive View -->
    <div
      v-if="isGiantPinView && activeGiantPin"
      class="fixed inset-0 z-[2500] flex flex-col md:flex-row bg-black pointer-events-auto"
      role="dialog"
      aria-modal="true"
      :aria-label="activeGiantPin.name"
    >
      <!-- Left/Top Side (Details) -->
      <div
        class="flex-1 md:w-[70%] flex flex-col overflow-hidden border-b md:border-b-0 md:border-r border-white/10"
      >
        <!-- Header -->
        <div class="p-4 glass-header flex items-center justify-between">
          <div>
            <h2 class="text-lg font-black text-white">
              {{ activeGiantPin.name }}
            </h2>
            <p class="text-xs text-white/60">
              {{ giantPinShops.length }} shops inside
            </p>
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
            >
              <track kind="captions" />
            </video>
            <img
              v-else-if="selectedGiantShop.Image_URL1"
              :src="selectedGiantShop.Image_URL1"
              :alt="selectedGiantShop.name"
              class="w-full h-full object-cover"
            />
          </div>

          <!-- Shop Info -->
          <div class="p-4 space-y-4">
            <div>
              <h3 class="text-xl font-black text-white mb-1">
                {{ selectedGiantShop.name }}
              </h3>
              <p class="text-sm text-white/60">
                {{ selectedGiantShop.category }}
              </p>
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
              <h4
                class="text-xs font-black text-white/40 uppercase tracking-widest mb-2"
              >
                About
              </h4>
              <p class="text-sm text-white/80 leading-relaxed">
                {{
                  selectedGiantShop.description ||
                  "Discover this amazing venue inside " + activeGiantPin.name
                }}
              </p>
            </div>

            <!-- Visitor Count -->
            <div class="p-4 rounded-xl bg-white/5 border border-white/10">
              <h4
                class="text-xs font-black text-white/40 uppercase tracking-widest mb-2"
              >
                Current Vibe
              </h4>
              <VisitorCount :shopId="selectedGiantShop.id" :isDarkMode="true" />
            </div>
          </div>
        </div>
      </div>

      <!-- Right/Bottom Side (Shop List) -->
      <div class="h-1/3 md:h-full md:w-[30%] flex flex-col bg-zinc-900/95">
        <div class="p-3 border-b border-white/10">
          <h3
            class="text-xs font-black text-white/40 uppercase tracking-widest"
          >
            Shops in Building
          </h3>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div
            v-for="shop in giantPinShops"
            :key="shop.id"
            @click="selectGiantShop(shop)"
            class="shop-list-item relative rounded-xl overflow-hidden cursor-pointer transition-all active:scale-95"
            :class="
              selectedGiantShop?.id === shop.id
                ? 'ring-2 ring-blue-500'
                : 'opacity-70 hover:opacity-100'
            "
          >
            <div class="aspect-[4/3] relative">
              <img
                v-if="shop.Image_URL1"
                :src="shop.Image_URL1"
                :alt="shop.name"
                class="w-full h-full object-cover"
              />
              <div
                class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"
              ></div>
              <div class="absolute bottom-2 left-2 right-2">
                <h4 class="text-xs font-bold text-white truncate">
                  {{ shop.name }}
                </h4>
                <p class="text-[10px] text-white/60">{{ shop.category }}</p>
              </div>
            </div>
          </div>

          <div
            v-if="giantPinShops.length === 0"
            class="p-4 text-center text-white/40 text-xs"
          >
            No shops found in this building
          </div>
        </div>
      </div>
    </div>

    <!-- ✅ Minimal Handle Bar for Visual Feedback -->
    <div
      v-if="!isGiantPinView && !isImmersive"
      class="flex items-center justify-center py-2 pointer-events-auto"
    >
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
          :alt="shop.name"
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
        <div
          class="absolute bottom-0 left-0 right-0 p-3 z-10 transition-transform duration-300 group-hover:translate-y-[-4px]"
        >
          <h4
            class="text-sm font-black text-white leading-tight truncate mb-1 drop-shadow-md"
          >
            {{ shop.name }}
          </h4>
          <div class="flex items-center gap-2 mb-2">
            <span
              class="text-[10px] font-bold text-white/80 uppercase tracking-wide bg-black/30 px-1.5 py-0.5 rounded backdrop-blur-sm"
            >
              {{ shop.category || "Venue" }}
            </span>
            <span
              v-if="shop.distance !== undefined"
              class="text-[10px] font-black text-blue-400 flex items-center gap-0.5 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm"
            >
              <MapPin class="w-3 h-3" />
              {{ shop.distance.toFixed(1) }}km
            </span>
          </div>
          <div class="scale-90 origin-left">
            <!-- Analytics removed for public view -->
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

    <!-- Horizontal Carousel / Immersive Feed -->
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
        class="flex flex-col items-center py-16 px-6 animate-fade-in pointer-events-auto"
      >
        <!-- ✅ Larger, more prominent icon -->
        <div
          class="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-6 border border-white/10"
        >
          <span class="text-5xl">🎭</span>
        </div>

        <!-- ✅ Better typography -->
        <h3 class="text-lg font-black text-white mb-2">
          No venues in this area
        </h3>
        <p class="text-sm text-white/60 mb-8 max-w-xs text-center">
          But we've handpicked some great spots for you
        </p>

        <!-- ✅ Bigger, scrollable suggestions -->
        <div
          class="flex gap-4 mb-8 overflow-x-auto pb-2 max-w-full no-scrollbar"
        >
          <div
            v-for="s in suggestedShops.slice(0, 4)"
            :key="s.id"
            @click="emit('click-shop', s)"
            class="suggested-chip relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-white/30 cursor-pointer transition-all duration-300 hover:scale-110 hover:border-white/50 shadow-lg"
          >
            <img
              v-if="s.Image_URL1"
              :src="s.Image_URL1"
              :alt="s.name"
              class="w-full h-full object-cover"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"
            ></div>
            <span
              class="absolute bottom-1 left-1 right-1 text-[10px] font-bold text-white truncate text-center"
            >
              {{ s.name }}
            </span>
          </div>
        </div>

        <!-- ✅ Premium button with icon -->
        <button
          @click="emit('reset-filters')"
          class="premium-button-large px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-base font-black flex items-center gap-3 shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 active:scale-95 transition-all"
        >
          <Sparkles class="w-5 h-5" />
          <span>Explore All Venues</span>
        </button>
      </div>

      <!-- Cards Carousel / Vertical Feed -->
      <div v-else class="relative pt-6 pb-10 z-[100]">
        <!-- Ambient glow behind cards -->
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 via-black/25 to-transparent blur-3xl"
        ></div>

        <PullToRefresh
          :is-refreshing="isRefreshing"
          @refresh="emit('refresh')"
          class="relative"
        >
          <div
            :ref="setMobileCardScrollRef"
            data-testid="vibe-carousel"
            :class="[
              'flex gap-3 no-scrollbar items-end transition-all duration-300 snap-x snap-proximity',
              isImmersive
                ? 'flex-col h-full overflow-y-auto overflow-x-hidden pt-0 pb-0 gap-0'
                : 'flex-row overflow-x-auto overflow-y-visible px-2 py-8 mb-2 h-[420px] items-end',
              'opacity-100',
            ]"
            style="-webkit-overflow-scrolling: touch; scroll-behavior: smooth"
            @scroll="handleScroll"
            @touchstart="emit('scroll-start')"
            @touchend="emit('scroll-end')"
            @mousedown="emit('scroll-start')"
            @mouseup="emit('scroll-end')"
          >
            <div
              v-if="!isImmersive"
              class="flex-shrink-0 w-[calc(50vw-110px)]"
            ></div>

            <template v-if="isIndoorView">
              <ShopCard
                v-for="shop in mallShops.filter((s) => s.Floor === activeFloor)"
                :key="`indoor-${shop.id}`"
                :shop="shop"
                class="flex-shrink-0 w-[340px] h-[400px] snap-center"
                @click="emit('click-shop', shop)"
              />
            </template>

            <template v-else>
              <SwipeCard
                v-for="shop in carouselShops"
                :key="shop.id"
                :shop="shop"
                :is-active="activeShopId === shop.id"
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
                @share="emit('share-shop', shop)"
                @open-ride="emit('open-ride', shop)"
                :data-shop-id="shop.id"
                data-testid="shop-card"
                :is-immersive="isImmersive"
                class="vibe-card-item flex-shrink-0 transition-all duration-500 ease-out snap-center"
                :class="[
                  isImmersive
                    ? 'w-full h-[100dvh] rounded-none scale-100 opacity-100'
                    : 'w-[220px] h-[200px]',
                  !isImmersive && activeShopId === shop.id
                    ? 'scale-100 z-20'
                    : '',
                  !isImmersive && activeShopId !== shop.id
                    ? 'scale-90 opacity-70'
                    : '',
                ]"
              >
                <!-- ✅ IMMERSIVE MODE: Shop Info Overlay - MOVED UP & MORE VISIBLE -->
                <div
                  v-if="isImmersive"
                  class="absolute left-5 right-5 bottom-[280px] z-50 pointer-events-none animate-slide-up"
                >
                  <h2
                    class="text-4xl font-black text-white mb-3 drop-shadow-2xl tracking-tight leading-tight"
                  >
                    {{ shop.name }}
                  </h2>
                  <p
                    class="text-base text-white/90 mb-4 line-clamp-3 font-medium max-w-lg leading-relaxed drop-shadow-lg"
                  >
                    {{ shop.description || shop.category }}
                  </p>
                  <div class="flex items-center gap-3 flex-wrap">
                    <span
                      class="px-4 py-2 rounded-full glass-pill-solid text-sm font-bold text-white inline-flex items-center gap-2 shadow-xl"
                    >
                      <span
                        class="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse"
                      ></span>
                      {{ shop.category || shop.type || "General" }}
                    </span>
                    <span
                      v-if="shop.distance !== undefined"
                      class="text-base text-white/80 flex items-center gap-2 font-bold drop-shadow-lg"
                    >
                      <MapPin class="w-5 h-5" />
                      {{ shop.distance.toFixed(1) }}km away
                    </span>
                  </div>
                </div>

                <!-- Right Side Actions for Immersive -->
                <div
                  v-if="isImmersive"
                  class="absolute right-4 bottom-32 flex flex-col gap-4 z-40"
                >
                  <button
                    @click="emit('toggle-favorite', shop.id)"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-all"
                    :class="
                      isFavorited(shop.id)
                        ? 'text-pink-500 bg-pink-500/20'
                        : 'text-white'
                    "
                  >
                    <Heart
                      class="w-7 h-7"
                      :fill="isFavorited(shop.id) ? 'currentColor' : 'none'"
                    />
                  </button>
                  <button
                    @click="emit('toggle-immersive')"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-all"
                  >
                    <MapPin class="w-7 h-7" />
                  </button>
                  <button
                    @click="emit('open-ride', shop)"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-all"
                  >
                    <Navigation class="w-7 h-7" />
                  </button>
                  <button
                    @click="emit('open-detail', shop)"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-all"
                  >
                    <Share2 class="w-7 h-7" />
                  </button>
                </div>

                <PlaceCard
                  :shop="shop"
                  :isActive="activeShopId === shop.id || isImmersive"
                  :isSelected="false"
                  :isFavorited="isFavorited(shop.id)"
                  @click="emit('click-shop', shop)"
                  @expand="emit('open-detail', shop)"
                  @collapse="emit('open-detail', null)"
                  @navigate="emit('open-ride', shop)"
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
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   🎨 PREMIUM UI STYLES - Figma-quality animations
   ═══════════════════════════════════════════════════════════════ */

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ═══════════════════════════════════════════════════════════════
   📜 SMOOTH CAROUSEL SCROLLING
   ═══════════════════════════════════════════════════════════════ */

[data-testid="vibe-carousel"] {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  will-change: scroll-position;
  transform: translateZ(0);
  backface-visibility: hidden;
  touch-action: pan-x;
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.vibe-card-item {
  scroll-snap-align: center;
  scroll-snap-stop: normal;
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
  touch-action: manipulation;
  transition:
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease-out,
    box-shadow 0.3s ease-out;
}

.vibe-card-item:hover {
  transform: translateZ(0) scale(1.02);
}

.vibe-card-item:active {
  transform: translateZ(0) scale(0.98);
}

/* ═══════════════════════════════════════════════════════════════
   🎬 VIDEO EXPANSION ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

.video-expand-enter {
  animation: videoExpandIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.video-expand-leave {
  animation: videoExpandOut 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

@keyframes videoExpandIn {
  0% {
    opacity: 0;
    transform: scale(0.96) translateY(20px);
    /* No filter for better performance */
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes videoExpandOut {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
    filter: blur(5px);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ✨ GLASSMORPHISM EFFECTS
   ═══════════════════════════════════════════════════════════════ */

.glass-button {
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.glass-header {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* ✅ Focus Visible for Accessibility */
*:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
  border-radius: 0.5rem;
}

/* ✅ Safe area utilities */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.pb-safe-offset-8 {
  padding-bottom: calc(2rem + env(safe-area-inset-bottom));
}

.top-safe-offset-20 {
  top: calc(5rem + env(safe-area-inset-top));
}

/* ✅ Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
}

.shop-list-item:hover {
  transform: scale(1.02);
}

.shop-list-item.active {
  /* Ring effect using box-shadow */
  box-shadow:
    0 0 0 2px rgb(59 130 246),
    0 10px 15px -3px rgba(0, 0, 0, 0.1),
    0 4px 6px -4px rgba(0, 0, 0, 0.1);
}

.glass-header {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

/* ✅ Focus Visible for Accessibility */
*:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
  border-radius: 0.5rem;
}

/* ✅ Safe area utilities */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.pb-safe-offset-8 {
  padding-bottom: calc(2rem + env(safe-area-inset-bottom));
}

.top-safe-offset-20 {
  top: calc(5rem + env(safe-area-inset-top));
}

/* ✅ Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
}

.shop-list-item:hover {
  transform: scale(1.02);
}

.shop-list-item.active {
  /* Use box-shadow to simulate ring instead of invalid ring-width property */
  box-shadow:
    0 0 0 2px rgb(59 130 246),
    /* Ring color */ 0 10px 15px -3px rgb(0 0 0 / 0.1),
    0 4px 6px -4px rgb(0 0 0 / 0.1);
  --tw-shadow-color: #3b82f6;
  --tw-shadow: var(--tw-shadow-colored);
}

.glass-button:hover {
  background: rgba(0, 0, 0, 0.8);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

/* ✅ NEW: Solid glass button for Exit to Map */
.glass-button-solid {
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.glass-button-solid:hover {
  background: rgba(0, 0, 0, 0.95);
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow:
    0 16px 56px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.glass-pill {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* ✅ NEW: Solid pill for immersive mode info */
.glass-pill-solid {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* ═══════════════════════════════════════════════════════════════
   🎯 ACTION BUTTONS
   ═══════════════════════════════════════════════════════════════ */

.action-button {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: auto;
}

.action-button:hover {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

.action-button:active {
  transform: scale(0.95);
}

.action-label {
  font-size: 9px;
  font-weight: 600;
  opacity: 0.8;
  letter-spacing: 0.5px;
}

/* ═══════════════════════════════════════════════════════════════
   💫 SLIDE ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

.animate-slide-up {
  animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
}

.animate-slide-left {
  animation: slideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideLeft {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ═══════════════════════════════════════════════════════════════
   🖼️ KEN BURNS & ZOOM EFFECTS
   ═══════════════════════════════════════════════════════════════ */

.video-ken-burns {
  animation: kenBurns 20s ease-in-out infinite alternate;
}

@keyframes kenBurns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  100% {
    transform: scale(1.1) translate(-2%, -1%);
  }
}

.animate-slow-zoom {
  animation: slowZoom 15s ease-in-out infinite alternate;
}

@keyframes slowZoom {
  0% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1.15);
  }
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradientShift 8s ease infinite;
}

@keyframes gradientShift {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

/* ═══════════════════════════════════════════════════════════════
   ✨ SPARKLE PARTICLES
   ═══════════════════════════════════════════════════════════════ */

.sparkle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: white;
  opacity: 0;
  animation: sparkle 3s ease-in-out infinite;
}

.sparkle-1 {
  top: 20%;
  left: 30%;
  animation-delay: 0s;
}

.sparkle-2 {
  top: 40%;
  right: 25%;
  animation-delay: 1s;
}

.sparkle-3 {
  bottom: 30%;
  left: 45%;
  animation-delay: 2s;
}

@keyframes sparkle {
  0%,
  100% {
    opacity: 0;
    transform: scale(0);
  }
  50% {
    opacity: 0.8;
    transform: scale(1);
  }
}

/* ═══════════════════════════════════════════════════════════════
   💗 HEARTBEAT ANIMATION
   ═══════════════════════════════════════════════════════════════ */

.animate-heartbeat {
  animation: heartbeat 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes heartbeat {
  0% {
    transform: scale(1);
  }
  25% {
    transform: scale(1.3);
  }
  50% {
    transform: scale(0.9);
  }
  75% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

/* ═══════════════════════════════════════════════════════════════
   📱 MOBILE OPTIMIZATIONS
   ═══════════════════════════════════════════════════════════════ */

@media (hover: none) and (pointer: coarse) {
  [data-testid="vibe-carousel"] {
    scroll-snap-type: x proximity;
    touch-action: pan-x;
  }

  .vibe-card-item {
    touch-action: manipulation;
  }

  .vibe-card-item:hover {
    transform: none;
  }

  .action-button:hover {
    transform: none;
    background: rgba(0, 0, 0, 0.5);
  }
}

/* ═══════════════════════════════════════════════════════════════
   🎭 FADE IN/OUT ANIMATIONS
   ═══════════════════════════════════════════════════════════════ */

@keyframes fadeIn {
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
  animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-10px);
  }
}

.animate-fade-out {
  animation: fadeOut 0.3s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

/* ═══════════════════════════════════════════════════════════════
   🔲 CONTAIN FOR PERFORMANCE
   ═══════════════════════════════════════════════════════════════ */

.snap-center {
  contain: layout style paint;
}

/* ═══════════════════════════════════════════════════════════════
   📱 MOBILE & REDUCED MOTION SAFETY
   ═══════════════════════════════════════════════════════════════ */

@media (max-width: 768px) {
  .video-ken-burns,
  .animate-slow-zoom,
  .animate-gradient {
    animation: none !important;
  }
  .custom-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .custom-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .sparkle {
    display: none !important;
  }
  .glass-button {
    backdrop-filter: blur(12px);
  }
  [data-testid="vibe-carousel"] {
    scroll-behavior: smooth;
  }
}

@media (prefers-reduced-motion: reduce) {
  .video-ken-burns,
  .animate-slow-zoom,
  .animate-gradient,
  .video-expand-enter,
  .video-expand-leave {
    animation: none !important;
  }
  .sparkle {
    display: none !important;
  }
  .action-button,
  .vibe-card-item,
  [data-testid="vibe-carousel"] {
    transition-duration: 120ms !important;
    scroll-behavior: auto;
  }
}
</style>
