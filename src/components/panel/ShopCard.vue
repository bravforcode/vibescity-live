<script setup>
import { BarChart, Clock, Heart, MapPin, Share2, Star } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "@/composables/useNotifications";
import { useBlurUpImage } from "../../composables/useBlurUpImage";
import { useCardTilt } from "../../composables/useCardTilt";
import { useSmartVideo } from "../../composables/useSmartVideo";
import { useCoinStore } from "../../store/coinStore";
import { openExternal } from "../../utils/browserUtils";
import { isFlashActive } from "../../utils/shopUtils";
import VisitorCount from "../ui/VisitorCount.vue";
import MerchantStats from "./MerchantStats.vue";

const coinStore = useCoinStore();
const { videoRef } = useSmartVideo();
const { notifySuccess } = useNotifications();

const { t } = useI18n();

const props = defineProps({
	shop: {
		type: Object,
		required: true,
	},
	isActive: {
		type: Boolean,
		default: false,
	},
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	favorites: {
		type: Array,
		default: () => [],
	},
	useRideButton: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits([
	"click",
	"open-detail",
	"hover",
	"toggle-favorite",
	"open-ride",
	"share",
]);

const showStats = ref(false);
let lastTapTime = 0;
const touchStartY = ref(0);
const touchStartX = ref(0);
const pullUpDistance = ref(0);
const PULL_UP_THRESHOLD = 90;

// ✅ Double-click to favorite
const handleCardTap = (e) => {
	const now = Date.now();
	const timeSinceLastTap = now - lastTapTime;

	if (timeSinceLastTap < 300) {
		// Double tap detected - toggle favorite
		e.stopPropagation();
		emit("toggle-favorite", props.shop.id);
		coinStore.awardCoins(1); // Gamification
	}
	lastTapTime = now;
};

const handleTouchStart = (e) => {
	const touch = e?.touches?.[0];
	if (!touch) return;
	touchStartY.value = touch.clientY;
	touchStartX.value = touch.clientX;
	pullUpDistance.value = 0;
};

const handleTouchMove = (e) => {
	const touch = e?.touches?.[0];
	if (!touch) return;
	const deltaY = touchStartY.value - touch.clientY;
	const deltaX = Math.abs(touch.clientX - touchStartX.value);
	if (deltaY > 0 && deltaY > deltaX) {
		pullUpDistance.value = deltaY;
	}
};

const handleTouchEnd = (e) => {
	if (pullUpDistance.value >= PULL_UP_THRESHOLD) {
		emit("open-detail", props.shop);
		pullUpDistance.value = 0;
		return;
	}
	pullUpDistance.value = 0;
	handleCardTap(e);
};

const handleTouchCancel = () => {
	pullUpDistance.value = 0;
};

// ✅ Share functionality with deep link
const handleShare = async (e) => {
	e.stopPropagation();

	const shopUrl = `${globalThis.location.origin}?shop=${props.shop.id}`;
	const shareData = {
		title: props.shop.name,
		text: `Check out ${props.shop.name} on VibeCity! 🎉`,
		url: shopUrl,
	};

	try {
		if (navigator.share) {
			await navigator.share(shareData);
		} else {
			// Fallback: copy to clipboard
			await navigator.clipboard.writeText(shopUrl);
			notifySuccess("Link copied to clipboard!");
		}
		emit("share", props.shop);
		coinStore.awardCoins(5); // Higher reward for sharing
	} catch (err) {
		// User cancelled or error
	}
};

// Open Google Maps for directions
const openGoogleMaps = (e) => {
	e.stopPropagation();
	const url = `https://www.google.com/maps/dir/?api=1&destination=${props.shop.lat},${props.shop.lng}`;
	openExternal(url);
};

// Check if favorited - normalize types for comparison
const isFavorited = computed(() => {
	const shopId =
		props.shop?.id === null || props.shop?.id === undefined
			? ""
			: String(props.shop.id).trim();
	if (!shopId) return false;
	return props.favorites.some((fav) => String(fav).trim() === shopId);
});

// Helper to optimize Supabase/remote images
const getOptimizedUrl = (url, width) => {
	if (!url) return "";
	if (url.includes("supabase.co")) {
		const separator = url.includes("?") ? "&" : "?";
		return `${url}${separator}width=${width}&format=webp&quality=80`;
	}
	return url;
};

// Handle mouse enter for hover sync
const handleMouseEnter = () => {
	emit("hover", props.shop);
};

// Blur-up progressive image loading
const shopImageUrl = computed(() => props.shop?.Image_URL1 || null);
const {
	imgSrc: blurUpSrc,
	isLoaded: imageLoaded,
	blurStyle,
} = useBlurUpImage(shopImageUrl);

// 3D perspective tilt on pointer hover
const { tiltStyle, glareStyle, onPointerMove, onPointerLeave } = useCardTilt({
	maxTilt: 5,
	scale: 1.015,
});

const cardAriaLabel = computed(
	() => `Open venue card for ${props.shop?.name || "this venue"}`,
);
</script>

<template>
  <div
    data-testid="shop-card"
    role="button"
    tabindex="0"
    :aria-label="cardAriaLabel"
    :class="[
      'shop-card-panel group relative w-full min-h-[300px] md:min-h-[340px] aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer transition-transform transition-shadow duration-300 hover:scale-[1.02] hover:-translate-y-1',
      isActive
        ? 'card-active-glow ring-1 ring-white/50 shadow-2xl scale-[1.01]'
        : 'shadow-lg hover:shadow-2xl',
      isDarkMode ? 'bg-zinc-900' : 'bg-white',
    ]"
    :style="tiltStyle"
    @click="emit('click', shop)"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchCancel"
    @mouseenter="handleMouseEnter"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @keydown.enter.prevent="emit('click', shop)"
    @keydown.space.prevent="emit('click', shop)"
  >
    <!-- Tilt glare overlay -->
    <div
      class="absolute inset-0 z-30 pointer-events-none rounded-2xl"
      :style="glareStyle"
    ></div>
    <!-- Image/Video Section - FULL CARD COVERAGE -->
    <div class="absolute inset-0 w-full h-full z-0 overflow-hidden">
      <!-- Background Image/Video -->
      <video
        v-if="shop.Video_URL"
        ref="videoRef"
        :src="shop.Video_URL"
        :poster="shop.Image_URL1"
        muted
        loop
        playsinline
        class="smart-video absolute inset-0 w-full h-full object-cover"
      />
      <!-- Fallback Image if no video (or while loading handled by poster) -->
      <img
        v-else-if="shop.Image_URL1"
        :src="blurUpSrc || getOptimizedUrl(shop.Image_URL1, 600)"
        :alt="shop.name || shop.title || 'Shop thumbnail'"
        class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-[transform,filter] duration-700"
        :style="blurStyle"
        loading="lazy"
        decoding="async"
      />
      <div
        v-else
        class="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600"
      ></div>

      <!-- Layered Gradient Overlay for Premium Depth -->
      <div
        class="absolute inset-0 pointer-events-none"
        style="
          background:
            linear-gradient(
              to bottom,
              transparent 0%,
              transparent 30%,
              rgba(0, 0, 0, 0.15) 50%,
              rgba(0, 0, 0, 0.6) 75%,
              rgba(0, 0, 0, 0.92) 100%
            ),
            linear-gradient(
              135deg,
              rgba(139, 92, 246, 0.08) 0%,
              transparent 50%
            );
        "
      ></div>

      <!-- Content Overlay -->
      <div class="absolute inset-0 p-3 flex flex-col justify-between z-10">
        <!-- Top Left: Badges -->
        <div class="flex flex-col gap-1.5">
          <!-- LIVE Badge -->
          <div
            v-if="shop.status === 'LIVE' || shop.Status === 'LIVE'"
            class="relative px-2.5 py-1.5 rounded-xl bg-red-600/90 backdrop-blur-md text-white text-[10px] font-black border border-red-500/50 shadow-lg"
          >
            <span class="flex items-center gap-1.5">
              <span
                class="relative flex w-1.5 h-1.5 rounded-full bg-white shadow-sm"
              >
                <span
                  class="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping"
                ></span>
              </span>
              LIVE
            </span>
          </div>

          <!-- Giant Pin Badge (Building) -->
          <div
            v-if="shop.is_giant_active || shop.isGiantPin"
            class="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white text-[10px] font-black border border-amber-400/50 shadow-lg flex items-center gap-1.5 animate-pulse"
          >
            <span>🏢</span> GIANT PIN
          </div>

          <!-- Flash/Golden Badges -->
          <div
            v-else-if="isFlashActive(shop)"
            class="px-2.5 py-1.5 rounded-xl text-white text-[10px] font-black shadow-lg border border-orange-400/60 bg-gradient-to-r from-red-500 to-orange-500"
          >
            🔥 FLASH
          </div>
          <div
            v-else-if="shop.isGolden || shop.isPromoted"
            class="px-2.5 py-1.5 rounded-xl text-black text-[10px] font-black shadow-lg border border-yellow-300/60 bg-gradient-to-br from-yellow-300 to-yellow-500"
          >
            ✨ GOLDEN
          </div>
        </div>

        <!-- Distance Badge -->
        <div
          class="px-2.5 py-1.5 rounded-xl bg-black/40 backdrop-blur-xl border border-white/20 shadow-lg self-start"
        >
          <span
            class="text-[10px] font-black text-blue-300 flex items-center gap-1"
          >
            <MapPin class="w-3 h-3" stroke-width="2.5" />
            <template
              v-if="shop.distance != null && typeof shop.distance === 'number'"
            >
              {{ shop.distance.toFixed(1) }}km
            </template>
            <template v-else>
              {{ t("shop.nearby") }}
            </template>
          </span>
        </div>
      </div>

      <!-- Right Top: Action Buttons (Absolute) -->
      <div class="absolute top-12 right-3 flex flex-col gap-2 z-20">
        <!-- Favorite Button -->
        <button
          @click.stop="
            () => {
              emit('toggle-favorite', shop.id);
              coinStore.awardCoins(1);
            }
          "
          class="w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-md border transition-[transform,background-color,border-color,color] active:scale-90 shadow-xl"
          :class="[
            isFavorited
              ? 'bg-pink-500/80 border-pink-400 text-white'
              : 'bg-black/30 border-white/20 text-white/70 hover:bg-black/50',
          ]"
          :aria-label="
            isFavorited ? t('a11y.remove_favorite') : t('a11y.add_favorite')
          "
          :aria-pressed="isFavorited"
        >
          <Heart
            class="w-4 h-4"
            :fill="isFavorited ? 'currentColor' : 'none'"
            stroke-width="2.5"
            aria-hidden="true"
          />
        </button>

        <!-- Share Button -->
        <button
          @click.stop="handleShare"
          class="w-11 h-11 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white/70 hover:bg-black/50 transition-[transform,background-color,border-color,color] active:scale-90 shadow-xl"
          :aria-label="t('common.share')"
        >
          <Share2 class="w-4 h-4" stroke-width="2.5" aria-hidden="true" />
        </button>
      </div>

      <!-- Content Section — Glassmorphism Info Panel -->
      <div
        class="absolute bottom-0 left-0 right-0 p-4 pb-2 z-10 flex flex-col justify-end h-full pointer-events-none"
      >
        <div class="pointer-events-auto glass-info-panel rounded-xl p-2.5">
          <!-- Stats Mode Toggle (Merchant Only) -->
          <div v-if="showStats" class="mb-2">
            <MerchantStats :shopId="shop.id" :isDarkMode="isDarkMode" />
            <button
              @click.stop="showStats = false"
              class="mt-2 w-full py-2 min-h-[44px] bg-black/40 text-white text-[10px] rounded-lg border border-white/10 hover:bg-black/60"
            >
              {{ t("shop.back_to_details") }}
            </button>
          </div>

          <div v-else>
            <!-- Header -->
            <div class="flex items-start justify-between">
              <h3
                class="text-xl font-black text-white leading-none mb-1 drop-shadow-xl tracking-tighter font-sans line-clamp-1"
              >
                {{ shop.name }}
              </h3>
              <!-- Chart Toggle Button -->
              <button
                @click.stop="showStats = true"
                class="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 border border-white/10 backdrop-blur-md"
                :aria-label="t('shop.view_stats')"
              >
                <BarChart class="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <!-- Sub-info -->
            <div
              class="flex items-center gap-3 mb-2 text-white/90 text-[10px] font-bold uppercase tracking-wider"
            >
              <span
                class="px-1.5 py-0.5 rounded-md bg-white/20 backdrop-blur-sm border border-white/10"
                >{{ shop.category || "Shop" }}</span
              >
              <span
                v-if="shop.rating"
                class="px-1.5 py-0.5 rounded-md bg-yellow-500/30 backdrop-blur-sm border border-yellow-400/30 flex items-center gap-0.5"
              >
                <Star
                  class="w-2.5 h-2.5 fill-yellow-400 text-yellow-400"
                  aria-hidden="true"
                />
                {{ shop.rating.toFixed(1) }}
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded-md bg-purple-500/30 backdrop-blur-sm border border-purple-400/30"
              >
                {{ t("shop.new") }}
              </span>
              <span class="flex items-center gap-1"
                ><Clock class="w-2.5 h-2.5" /> {{ shop.openTime || "--" }} -
                {{ shop.closeTime || "--" }}</span
              >
            </div>

            <!-- Visitor Count -->
            <div class="mb-2 origin-left scale-90">
              <VisitorCount :shopId="shop.id" :isDarkMode="true" />
            </div>

            <!-- Promotion Info -->
            <div
              v-if="shop.promotionInfo"
              class="mb-2 px-2 py-1 rounded-lg bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-400/30"
            >
              <span
                class="text-[9px] font-black text-orange-300 uppercase tracking-wide"
              >
                🔥 {{ shop.promotionInfo }}
              </span>
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-2 mt-1">
              <button
                v-if="useRideButton"
                @click.stop="emit('open-ride', shop)"
                class="col-span-2 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[10px] font-black shadow-lg border border-blue-400/30 flex items-center justify-center gap-2 active:scale-95 transition-[transform,filter,box-shadow]"
              >
                {{ t("shop.call_ride") }}
              </button>

              <template v-else>
                <button
                  @click.stop="emit('open-detail', shop)"
                  class="py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold hover:bg-white/20 transition-colors"
                >
                  {{ t("shop.details") }}
                </button>
                <button
                  @click.stop="openGoogleMaps"
                  class="py-2.5 rounded-xl bg-green-500/20 backdrop-blur-md border border-green-500/30 text-green-300 text-[10px] font-bold hover:bg-green-500/30 transition-colors"
                >
                  {{ t("shop.navigate") }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes wave-gradient {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 200% 50%;
  }
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Glassmorphism info panel at card bottom */
.glass-info-panel {
  background: rgba(10, 10, 20, 0.45);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
}

/* Animated gradient border for active cards */
.card-active-glow {
  position: relative;
}
.card-active-glow::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1.5px;
  background: linear-gradient(
    135deg,
    rgba(139, 92, 246, 0.7),
    rgba(236, 72, 153, 0.5),
    rgba(59, 130, 246, 0.5),
    rgba(139, 92, 246, 0.7)
  );
  background-size: 300% 300%;
  animation: border-shimmer 3s ease-in-out infinite;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  -webkit-mask-composite: xor;
  z-index: 1;
  pointer-events: none;
}

@keyframes border-shimmer {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

/* Smooth hover lift */
.shop-card-panel {
  will-change: transform;
  transform: translateZ(0);
}
</style>
