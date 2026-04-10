<script setup>
import { Heart, MapPin, Navigation, Share2, Sparkles } from "lucide-vue-next";
import { computed, defineAsyncComponent, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useBottomFeedLogic } from "../../composables/useBottomFeedLogic";
import { useDragScroll } from "../../composables/useDragScroll";
import ShopCard from "../panel/ShopCard.vue";
import PullToRefresh from "../ui/PullToRefresh.vue";
import SwipeCard from "../ui/SwipeCard.vue";

const { t } = useI18n();

const SkeletonCard = defineAsyncComponent(
	() => import("../ui/SkeletonCard.vue"),
);

const VideoExpandedView = defineAsyncComponent(
	() => import("./VideoExpandedView.vue"),
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
	enableCinemaExplorer: {
		type: Boolean,
		default: false,
	},
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

// Cap DOM nodes for performance — slice in computed keeps v-memo cache stable
const CAROUSEL_CAP = 30;
const CARD_WIDTH = 198;
const CARD_HEIGHT = 272;
const cappedShops = computed(() => props.carouselShops.slice(0, CAROUSEL_CAP));
const edgeSpacerWidth = computed(() =>
	props.isImmersive ? "0px" : `calc(50vw - ${CARD_WIDTH / 2}px)`,
);

// ✅ Bottom Feed Logic (extracted to composable)
const {
	isVideoExpanded,
	expandedShop,
	videoRef,
	normalizeId,
	closeExpandedVideo,
	selectShop,
	handleScroll,
} = useBottomFeedLogic(props, emit);

// ✅ Drag-to-Scroll for Desktop Users
const carouselRef = ref(null);
const { isDragging } = useDragScroll(carouselRef, {
	momentum: true,
	snapSelector: ".vibe-card-item",
	sensitivity: 1.2,
});

const isFavorited = (shopId) => {
	const id = normalizeId(shopId);
	if (!id) return false;
	return (props.favorites || []).some((fav) => normalizeId(fav) === id);
};

const isGridView = ref(false);
const isCarouselInteracting = ref(false);
const hasManualCarouselIntent = ref(false);
let carouselInteractionTimer = null;

const clearCarouselInteractionTimer = () => {
	if (carouselInteractionTimer) {
		clearTimeout(carouselInteractionTimer);
		carouselInteractionTimer = null;
	}
};

const settleCarouselInteraction = () => {
	if (!isCarouselInteracting.value) return;
	isCarouselInteracting.value = false;
	emit("scroll-end");
};

const markCarouselInteraction = () => {
	if (!isCarouselInteracting.value) {
		isCarouselInteracting.value = true;
		emit("scroll-start");
	}
	clearCarouselInteractionTimer();
	carouselInteractionTimer = setTimeout(() => {
		carouselInteractionTimer = null;
		settleCarouselInteraction();
	}, 180);
};

const markManualCarouselIntent = () => {
	hasManualCarouselIntent.value = true;
};

const handleCarouselScroll = (event) => {
	if (!hasManualCarouselIntent.value) return;
	markCarouselInteraction();
	handleScroll(event);
};

onUnmounted(() => {
	clearCarouselInteractionTimer();
});

const getCardItemStyle = (_shopId) => {
	if (props.isImmersive) return null;
	return {
		width: `${CARD_WIDTH}px`,
		height: `${CARD_HEIGHT}px`,
	};
};
</script>

<template>
  <div
    :ref="setBottomUiRef"
    data-testid="bottom-feed"
    :class="[
      'transition-[transform,opacity,box-shadow,border-color,background-color] duration-500 ease-in-out',
      isImmersive
        ? 'fixed inset-0 z-[2000] bg-black pointer-events-auto'
        : 'absolute bottom-0 left-0 right-0 z-[1200] pb-safe pointer-events-none',
    ]"
  >
    <!-- ✅ Lazy Loaded Video Expansion -->
    <transition
      enter-active-class="video-expand-enter"
      leave-active-class="video-expand-leave"
    >
      <VideoExpandedView
        v-if="isVideoExpanded && expandedShop"
        :shop="expandedShop"
        :carousel-shops="carouselShops"
        :video-ref="videoRef"
        :is-favorited="isFavorited"
        @close="closeExpandedVideo"
        @toggle-favorite="(id) => emit('toggle-favorite', id)"
        @open-ride="(shop) => emit('open-ride', shop)"
        @share-shop="(shop) => emit('share-shop', shop)"
        @select-shop="selectShop"
      />
    </transition>

    <!-- ✅ Minimal Handle Bar for Visual Feedback -->
    <div
      v-if="!isImmersive"
      class="flex items-center justify-center py-1 pointer-events-auto"
    >
      <div class="w-10 h-1 rounded-full bg-white/30"></div>
    </div>

    <!-- Grid View -->
    <div
      v-if="isGridView"
      @scroll="handleScroll"
      class="px-4 py-2 pb-24 h-[55vh] overflow-y-auto no-scrollbar grid grid-cols-2 md:grid-cols-3 gap-3 animate-fade-in pointer-events-auto"
    >
      <button
        v-for="shop in cappedShops"
        :key="shop.id"
        v-memo="[shop.id, shop.status, shop.isPromoted]"
        @click="emit('open-detail', shop)"
        :aria-label="`Open details for ${shop.name}`"
        type="button"
        class="relative aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shadow-xl active:scale-95 transition-[transform,opacity,box-shadow,border-color,background-color] hover:shadow-2xl hover:shadow-purple-500/20 text-left"
        style="contain: layout style"
      >
        <img
          v-if="shop.Image_URL1"
          :src="shop.Image_URL1"
          :alt="shop.name"
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
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
      </button>

      <div
        v-if="carouselShops.length === 0"
        class="col-span-2 text-center text-white/40 text-xs py-10"
      >
        {{ t("feed.no_items") }}
      </div>
    </div>

    <!-- Horizontal Carousel / Immersive Feed -->
    <div v-else class="relative min-h-[100px] pointer-events-auto">
      <!-- Loading State -->
      <div
        v-if="isDataLoading"
        class="flex items-end px-[calc(50vw-99px)] py-3 gap-3 no-scrollbar mb-0 h-[198px] overflow-x-hidden"
      >
        <SkeletonCard
          v-for="i in 5"
          :key="`skel-${i}`"
          variant="carousel"
          :isDarkMode="isDarkMode"
          class="pointer-events-auto"
          style="width: 198px; height: 180px"
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
          {{ t("feed.no_venues") }}
        </h3>
        <p class="text-sm text-white/60 mb-8 max-w-xs text-center">
          {{ t("feed.handpicked") }}
        </p>

        <!-- ✅ Bigger, scrollable suggestions -->
        <div
          class="flex gap-4 mb-8 overflow-x-auto pb-2 max-w-full no-scrollbar"
        >
          <button
            v-for="s in suggestedShops.slice(0, 4)"
            :key="s.id"
            @click="emit('click-shop', s)"
            :aria-label="`Open suggested venue ${s.name}`"
            type="button"
            class="suggested-chip relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-white/30 cursor-pointer transition-[transform,opacity,box-shadow,border-color,background-color] duration-300 hover:scale-110 hover:border-white/50 shadow-lg"
          >
            <img
              v-if="s.Image_URL1"
              :src="s.Image_URL1"
              :alt="s.name"
              class="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"
            ></div>
            <span
              class="absolute bottom-1 left-1 right-1 text-[10px] font-bold text-white truncate text-center"
            >
              {{ s.name }}
            </span>
          </button>
        </div>

        <!-- ✅ Premium button with icon -->
        <button
          @click="emit('reset-filters')"
          class="premium-button-large px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-base font-black flex items-center gap-3 shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 active:scale-95 transition-[transform,opacity,box-shadow,border-color,background-color]"
        >
          <Sparkles class="w-5 h-5" />
          <span>{{ t("feed.explore_all") }}</span>
        </button>
      </div>

      <!-- Cards Carousel / Vertical Feed -->
      <div v-else class="relative pt-1 pb-0 z-[100] pointer-events-auto">
        <PullToRefresh
          :is-refreshing="isRefreshing"
          @refresh="emit('refresh')"
          class="relative"
        >
          <div
            :ref="
              (el) => {
                carouselRef = el;
                setMobileCardScrollRef?.(el);
              }
            "
            data-testid="vibe-carousel"
            :data-scrolling="isCarouselInteracting ? 'true' : 'false'"
            :class="[
              'flex gap-2 no-scrollbar snap-x snap-proximity',
              isImmersive
                ? 'flex-col h-full overflow-y-auto overflow-x-hidden pt-0 pb-0 gap-0'
                : 'flex-row overflow-x-auto overflow-y-visible px-3 pt-1 pb-2 h-[286px] items-end',
              'opacity-100',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
            ]"
            style="
              -webkit-overflow-scrolling: touch;
              scroll-snap-type: x proximity;
              overscroll-behavior-x: contain;
              touch-action: pan-x pinch-zoom;
            "
            @pointerdown="markManualCarouselIntent"
            @touchstart.passive="markManualCarouselIntent"
            @wheel.passive="markManualCarouselIntent"
            @scroll="handleCarouselScroll"
          >
            <div
              v-if="!isImmersive"
              class="flex-shrink-0"
              :style="{ width: edgeSpacerWidth }"
            ></div>

            <template v-if="isIndoorView">
              <ShopCard
                v-for="shop in mallShops.filter((s) => s.Floor === activeFloor)"
                :key="`indoor-${shop.id}`"
                :shop="shop"
                class="flex-shrink-0 w-[260px] h-[300px] snap-center"
              />
            </template>

            <template v-else>
              <SwipeCard
                v-for="(shop, index) in cappedShops"
                :key="shop.id"
                :shop="shop"
                :is-active="activeShopId === shop.id"
                :is-selected="activeShopId === shop.id"
                :fetchpriority="index === 0 ? 'high' : 'auto'"
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
                class="vibe-card-item flex-shrink-0 rounded-2xl overflow-visible snap-center"
                :class="[
                  isImmersive
                    ? 'w-full h-[100dvh] rounded-none opacity-100'
                    : '',
                  !isImmersive &&
                  !isCarouselInteracting &&
                  activeShopId === shop.id
                    ? 'z-20 shadow-[0_0_24px_4px_rgba(139,92,246,0.55),0_0_8px_2px_rgba(236,72,153,0.35)]'
                    : '',
                  !isImmersive &&
                  !isCarouselInteracting &&
                  activeShopId !== shop.id
                    ? 'opacity-75'
                    : '',
                ]"
                :style="getCardItemStyle(shop.id)"
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
                    aria-label="Like this venue"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-[transform,opacity,box-shadow,border-color,background-color]"
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
                    aria-label="Exit immersive mode"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-[transform,opacity,box-shadow,border-color,background-color]"
                  >
                    <MapPin class="w-7 h-7" />
                  </button>
                  <button
                    @click="emit('open-ride', shop)"
                    aria-label="Open ride options"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-[transform,opacity,box-shadow,border-color,background-color]"
                  >
                    <Navigation class="w-7 h-7" />
                  </button>
                  <button
                    @click="emit('open-detail', shop)"
                    aria-label="Share venue details"
                    class="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-xl hover:scale-110 active:scale-95 transition-[transform,opacity,box-shadow,border-color,background-color]"
                  >
                    <Share2 class="w-7 h-7" />
                  </button>
                </div>

                <!-- PlaceCard removed to fix double rendering/overlap issues -->
              </SwipeCard>
            </template>

            <div
              v-if="!isImmersive"
              class="flex-shrink-0"
              :style="{ width: edgeSpacerWidth }"
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
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.vibe-card-item {
  scroll-snap-align: center;
  scroll-snap-stop: normal;
  touch-action: manipulation;
}

[data-testid="vibe-carousel"][data-scrolling="true"] {
  scroll-behavior: auto;
}

[data-testid="vibe-carousel"][data-scrolling="true"] .vibe-card-item {
  opacity: 1 !important;
  transform: none !important;
  transition: none !important;
  box-shadow: none !important;
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
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease,
    box-shadow 0.3s ease,
    background-color 0.3s ease,
    border-color 0.3s ease;
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

.ken-burns-slow {
  animation: kenBurns 14s ease-in-out infinite alternate;
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
   🎯 BOUNCE ANIMATION (Button Press Feedback)
   ═══════════════════════════════════════════════════════════════ */

@keyframes bounce {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(0.92);
  }
  75% {
    transform: scale(1.04);
  }
}

.animate-bounce-press {
  animation: bounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Active state bounce for buttons */
.btn-bounce:active {
  animation: bounce 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
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
  .ken-burns-slow,
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
}

@media (prefers-reduced-motion: reduce) {
  .video-ken-burns,
  .ken-burns-slow,
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
