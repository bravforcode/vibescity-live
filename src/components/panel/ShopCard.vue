<script setup>
import { BarChart, Clock, Heart, MapPin, Share2, Star } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "@/composables/useNotifications";
import { useBlurUpImage } from "../../composables/useBlurUpImage";
import { useCardTilt } from "../../composables/useCardTilt";
import { useSmartVideo } from "../../composables/useSmartVideo";
import { resolveVenueMedia } from "../../domain/venue/viewModel";
import { useCoinStore } from "../../store/coinStore";
import { openExternal } from "../../utils/browserUtils";
import {
	getUsableMediaUrl,
	markMediaElementFailed,
} from "../../utils/mediaSourceGuard.js";
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
	isPriority: {
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
const getOptimizedUrl = (url, _width) => {
	if (!url) return "";
	if (url.includes("supabase.co")) {
		// Keep browser-side Supabase media on the canonical object URL.
		// Production Chromium has intermittently blocked the direct query
		// transform lane with ERR_BLOCKED_BY_ORB on custom-domain hosts.
		return url;
	}
	return url;
};

// Handle mouse enter for hover sync
const handleMouseEnter = () => {
	emit("hover", props.shop);
};

const resolvedRealMedia = computed(() => resolveVenueMedia(props.shop || {}));
const mediaCounts = computed(
	() =>
		props.shop?.media_counts ||
		resolvedRealMedia.value.counts || { images: 0, videos: 0, total: 0 },
);
const realImageCount = computed(() => Number(mediaCounts.value?.images || 0));
const realVideoCount = computed(() => Number(mediaCounts.value?.videos || 0));
const primaryRealImageUrl = computed(
	() => resolvedRealMedia.value.primaryImage || props.shop?.Image_URL1 || null,
);

// Blur-up progressive image loading from real venue media only
const shopImageUrl = computed(() => primaryRealImageUrl.value);
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

const videoError = ref(false);
const resolvedVideoUrl = computed(() =>
	getUsableMediaUrl(resolvedRealMedia.value.videoUrl || ""),
);
const shouldRenderVideo = computed(
	() => props.isActive && Boolean(resolvedVideoUrl.value) && !videoError.value,
);
const resolvedImageUrl = computed(
	() =>
		blurUpSrc.value || getOptimizedUrl(primaryRealImageUrl.value, 600) || null,
);

const cardAriaLabel = computed(
	() => `Open venue card for ${props.shop?.name || "this venue"}`,
);

const handleVideoError = (event) => {
	if (Number(event?.target?.error?.code || 0) === 1) return;
	videoError.value = true;
	markMediaElementFailed(event, resolvedVideoUrl.value);
	if (videoRef.value) {
		videoRef.value.pause();
		videoRef.value.removeAttribute("src");
		videoRef.value.load();
	}
};

watch(
	[() => props.shop?.id, resolvedVideoUrl],
	() => {
		videoError.value = false;
		if (videoRef.value) {
			videoRef.value.pause();
		}
	},
	{ immediate: true },
);
</script>

<template>
  <div
    data-testid="shop-card"
    :data-live="shop.status === 'LIVE' || shop.Status === 'LIVE' ? 'true' : 'false'"
    role="button"
    tabindex="0"
    :aria-label="cardAriaLabel"
    :class="[
      'shop-card-panel group relative w-full min-h-[300px] md:min-h-[340px] aspect-[4/5] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1',
      isActive
        ? 'card-active-glow ring-1 ring-white/50 shadow-2xl scale-[1.01]'
        : 'shadow-lg hover:shadow-2xl',
      isDarkMode ? 'bg-zinc-900' : 'bg-white',
    ]"
    :style="tiltStyle"
    @click="emit('click', shop)"
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
    @touchend.passive="handleTouchEnd"
    @touchcancel.passive="handleTouchCancel"
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
        v-if="shouldRenderVideo"
        ref="videoRef"
        :src="resolvedVideoUrl"
        :poster="primaryRealImageUrl || undefined"
        muted
        loop
        playsinline
        class="smart-video absolute inset-0 w-full h-full object-cover"
        preload="none"
        @error="handleVideoError"
      />
      <!-- Fallback Image if no video (or while loading handled by poster) -->
      <img
        v-else-if="primaryRealImageUrl"
        :src="resolvedImageUrl"
        :alt="shop.name || shop.title || 'Shop thumbnail'"
        class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-[transform,filter] duration-700"
        :style="blurStyle"
        :loading="isPriority ? 'eager' : 'lazy'"
        :fetchpriority="isPriority ? 'high' : 'auto'"
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
            class="shop-top-badge shop-top-badge--live"
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
            class="shop-top-badge shop-top-badge--giant animate-pulse"
          >
            <span>🏢</span> GIANT PIN
          </div>

          <!-- Flash/Golden Badges -->
          <div
            v-else-if="isFlashActive(shop)"
            class="shop-top-badge shop-top-badge--flash"
          >
            🔥 FLASH
          </div>
          <div
            v-else-if="shop.isGolden || shop.isPromoted"
            class="shop-top-badge shop-top-badge--gold"
          >
            ✨ GOLDEN
          </div>
        </div>

        <!-- Distance Badge -->
        <div class="shop-distance-pill">
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
          class="shop-fab transition-[transform,background-color,border-color,color] active:scale-90"
          :class="[
            isFavorited
              ? 'shop-fab--active'
              : 'shop-fab--idle',
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
          class="shop-fab shop-fab--idle transition-[transform,background-color,border-color,color] active:scale-90"
          :aria-label="t('common.share')"
        >
          <Share2 class="w-4 h-4" stroke-width="2.5" aria-hidden="true" />
        </button>
      </div>

      <!-- Content Section — Glassmorphism Info Panel -->
      <div
        class="absolute bottom-0 left-0 right-0 p-4 pb-2 z-10 flex flex-col justify-end h-full pointer-events-none"
      >
        <div class="pointer-events-auto shop-info-panel rounded-xl p-4">
          <!-- Stats Mode Toggle (Merchant Only) -->
          <div v-if="showStats" class="mb-2">
            <MerchantStats :shopId="shop.id" :isDarkMode="isDarkMode" />
            <button
              @click.stop="showStats = false"
              class="shop-ghost-button mt-2 w-full"
            >
              {{ t("shop.back_to_details") }}
            </button>
          </div>

          <div v-else>
            <!-- Header -->
            <div class="shop-header">
              <h3
                class="text-3xl font-black text-black leading-tight tracking-tight font-sans line-clamp-1"
              >
                {{ shop.name }}
              </h3>
              <!-- Chart Toggle Button -->
              <button
                @click.stop="showStats = true"
                class="shop-fab shop-fab--idle"
                :aria-label="t('shop.view_stats')"
              >
                <BarChart class="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <!-- Sub-info -->
            <div class="shop-meta-row">
              <span class="shop-chip shop-chip--category"
                >{{ shop.category || "Shop" }}</span
              >
              <span
                v-if="shop.rating"
                class="shop-chip shop-chip--rating"
              >
                <Star
                  class="w-2.5 h-2.5 fill-yellow-400 text-yellow-400"
                  aria-hidden="true"
                />
                {{ shop.rating.toFixed(1) }}
              </span>
              <span
                v-else
                class="shop-chip shop-chip--new"
              >
                {{ t("shop.new") }}
              </span>
              <span
                v-if="realImageCount > 0"
                class="shop-chip shop-chip--media"
              >
                IMG {{ realImageCount }}
              </span>
              <span
                v-if="realVideoCount > 0"
                class="shop-chip shop-chip--media"
              >
                VID {{ realVideoCount }}
              </span>
              <span class="shop-time-pill"
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
              class="shop-promo-banner"
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
                class="shop-cta shop-cta--primary col-span-2 active:scale-95 transition-[transform,filter,box-shadow]"
              >
                {{ t("shop.call_ride") }}
              </button>

              <template v-else>
                <button
                  @click.stop="emit('open-detail', shop)"
                  class="shop-cta shop-cta--secondary transition-colors"
                >
                  {{ t("shop.details") }}
                </button>
                <button
                  @click.stop="openGoogleMaps"
                  class="shop-cta shop-cta--nav transition-colors"
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

/* Solid map-card surface for reliable readability over busy tiles */
.shop-info-panel {
  background: #090c12;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  box-shadow:
    0 20px 42px rgba(0, 0, 0, 0.42),
    0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

.shop-top-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 24px;
  padding: 0.35rem 0.65rem;
  border-radius: 0.9rem;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 20px rgba(2, 6, 23, 0.28);
}

.shop-top-badge--live {
  background: #b91c1c;
  color: white;
  border: 1px solid rgba(248, 113, 113, 0.4);
}

.shop-top-badge--giant {
  background: linear-gradient(135deg, #f59e0b, #ea580c);
  color: white;
  border: 1px solid rgba(251, 191, 36, 0.45);
}

.shop-top-badge--flash {
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: white;
  border: 1px solid rgba(251, 146, 60, 0.5);
}

.shop-top-badge--gold {
  background: linear-gradient(135deg, #fde047, #f59e0b);
  color: #111827;
  border: 1px solid rgba(253, 224, 71, 0.55);
}

.shop-distance-pill {
  align-self: flex-start;
  padding: 0.42rem 0.68rem;
  border-radius: 0.95rem;
  background: #101722;
  border: 1px solid rgba(56, 189, 248, 0.18);
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.28);
}

.shop-chip--media {
  background: rgba(15, 23, 42, 0.88);
  color: #dbeafe;
  border: 1px solid rgba(59, 130, 246, 0.22);
}

.shop-fab {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 26px rgba(2, 6, 23, 0.34);
}

.shop-fab--idle {
  background: #10151d;
  color: rgba(255, 255, 255, 0.78);
}

.shop-fab--idle:hover {
  background: #171d27;
}

.shop-fab--active {
  background: #8f174b;
  border-color: rgba(244, 114, 182, 0.45);
  color: white;
}

.shop-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.shop-meta-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.7rem;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.9);
}

.shop-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 24px;
  padding: 0.28rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.shop-chip--category {
  background: #161b24;
}

.shop-chip--rating {
  background: #2a2110;
  border-color: rgba(250, 204, 21, 0.25);
}

.shop-chip--new {
  background: #1f1631;
  border-color: rgba(192, 132, 252, 0.3);
}

.shop-time-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 24px;
  padding: 0.28rem 0.5rem;
  border-radius: 9999px;
  background: #121821;
  border: 1px solid rgba(148, 163, 184, 0.14);
  color: rgba(226, 232, 240, 0.82);
}

.shop-promo-banner {
  margin-bottom: 0.6rem;
  padding: 0.45rem 0.65rem;
  border-radius: 0.9rem;
  background: linear-gradient(135deg, rgba(194, 65, 12, 0.24), rgba(153, 27, 27, 0.2));
  border: 1px solid rgba(251, 146, 60, 0.24);
}

.shop-cta {
  min-height: 44px;
  border-radius: 14px;
  font-size: 10px;
  font-weight: 800;
  border: 1px solid transparent;
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.22);
}

.shop-cta--primary {
  background: linear-gradient(100deg, #0f4c81 0%, #0891b2 100%);
  color: white;
  border-color: rgba(103, 232, 249, 0.22);
}

.shop-cta--secondary {
  background: #151b24;
  color: white;
  border-color: rgba(148, 163, 184, 0.18);
}

.shop-cta--secondary:hover {
  background: #1b2330;
}

.shop-cta--nav {
  background: #102018;
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.24);
}

.shop-cta--nav:hover {
  background: #163222;
}

.shop-ghost-button {
  min-height: 44px;
  border-radius: 0.8rem;
  background: #151b24;
  color: white;
  font-size: 10px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.shop-ghost-button:hover {
  background: #1b2330;
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
  border: 1px solid rgba(139, 92, 246, 0.3);
  box-shadow:
    0 0 6px rgba(139, 92, 246, 0.22),
    0 0 16px rgba(139, 92, 246, 0.1);
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;
}

.shop-card-panel:hover {
  border-color: rgba(139, 92, 246, 0.55);
  box-shadow:
    0 0 10px rgba(139, 92, 246, 0.38),
    0 0 28px rgba(139, 92, 246, 0.18);
}

/* LIVE venues: red/pink neon glow */
.shop-card-panel[data-live="true"] {
  border-color: rgba(239, 68, 68, 0.45);
  box-shadow:
    0 0 8px rgba(239, 68, 68, 0.35),
    0 0 20px rgba(236, 72, 153, 0.18);
}

.shop-card-panel[data-live="true"]:hover {
  border-color: rgba(239, 68, 68, 0.65);
  box-shadow:
    0 0 12px rgba(239, 68, 68, 0.5),
    0 0 30px rgba(236, 72, 153, 0.28);
}
</style>
