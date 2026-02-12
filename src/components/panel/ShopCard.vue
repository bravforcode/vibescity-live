<script setup>
import { BarChart, Clock, Heart, MapPin, Share2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "@/composables/useNotifications";
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
</script>

<template>
  <div
    data-testid="shop-card"
    :class="[
      'shop-card-panel group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300',
      isActive
        ? 'ring-1 ring-white/50 shadow-2xl'
        : 'shadow-lg hover:shadow-xl',
      isDarkMode ? 'bg-zinc-900' : 'bg-white',
    ]"
    @click="emit('click', shop)"
    @touchend="handleCardTap"
    @mouseenter="handleMouseEnter"
  >
    <!-- Image/Video Section - FULL CARD COVERAGE -->
    <div class="absolute inset-0 w-full h-full z-0">
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
        :src="getOptimizedUrl(shop.Image_URL1, 600)"
        :alt="shop.name || shop.title || 'Shop thumbnail'"
        class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        loading="lazy"
      />
      <div
        v-else
        class="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600"
      ></div>

      <!-- Gradient Overlay for Readability -->
      <div
        class="absolute inset-0 pointer-events-none"
        style="
          background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.2) 40%,
            rgba(0, 0, 0, 0.9) 100%
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
            <template v-if="shop.distance != null && typeof shop.distance === 'number'">
              {{ shop.distance.toFixed(1) }}km
            </template>
            <template v-else>
              {{ t('shop.nearby') }}
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
          class="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md border transition-all active:scale-90 shadow-xl"
          :class="[
            isFavorited
              ? 'bg-pink-500/80 border-pink-400 text-white'
              : 'bg-black/30 border-white/20 text-white/70 hover:bg-black/50',
          ]"
        >
          <Heart
            class="w-4 h-4"
            :fill="isFavorited ? 'currentColor' : 'none'"
            stroke-width="2.5"
          />
        </button>

        <!-- Share Button -->
        <button
          @click.stop="handleShare"
          class="w-9 h-9 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white/70 hover:bg-black/50 transition-all active:scale-90 shadow-xl"
        >
          <Share2 class="w-4 h-4" stroke-width="2.5" />
        </button>
      </div>

      <!-- Content Section (Overlaid at Bottom) -->
      <div
        class="absolute bottom-0 left-0 right-0 p-4 pb-2 z-10 flex flex-col justify-end h-full pointer-events-none"
      >
        <div class="pointer-events-auto">
          <!-- Stats Mode Toggle (Merchant Only) -->
          <div v-if="showStats" class="mb-2">
            <MerchantStats :shopId="shop.id" :isDarkMode="isDarkMode" />
            <button
              @click.stop="showStats = false"
              class="mt-2 w-full py-2 bg-black/40 text-white text-[10px] rounded-lg border border-white/10 hover:bg-black/60"
            >
              Back to Details
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
                class="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 border border-white/10 backdrop-blur-md"
                title="View Stats"
              >
                <BarChart class="w-4 h-4" />
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
                ⭐ {{ shop.rating.toFixed(1) }}
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded-md bg-purple-500/30 backdrop-blur-sm border border-purple-400/30"
              >
                {{ t('shop.new') }}
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
              <span class="text-[9px] font-black text-orange-300 uppercase tracking-wide">
                🔥 {{ shop.promotionInfo }}
              </span>
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-2 mt-1">
              <button
                v-if="useRideButton"
                @click.stop="emit('open-ride', shop)"
                class="col-span-2 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[10px] font-black shadow-lg border border-blue-400/30 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                🚗 เรียกรถ
              </button>

              <template v-else>
                <button
                  @click.stop="emit('open-detail', shop)"
                  class="py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold hover:bg-white/20 transition-all"
                >
                  รายละเอียด
                </button>
                <button
                  @click.stop="openGoogleMaps"
                  class="py-2.5 rounded-xl bg-green-500/20 backdrop-blur-md border border-green-500/30 text-green-300 text-[10px] font-bold hover:bg-green-500/30 transition-all"
                >
                  นำทาง
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
</style>
