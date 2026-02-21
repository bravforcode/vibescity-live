<script setup>
import { ArrowLeft, Heart, Share2, User } from "lucide-vue-next";
import { computed, defineAsyncComponent, ref } from "vue";
import { useHaptics } from "../../composables/useHaptics";
import { useCoinStore } from "../../store/coinStore";
import { useShopStore } from "../../store/shopStore";

const coinStore = useCoinStore();

// Async Components (Lazy Load)
const SmartHeader = defineAsyncComponent(
	() => import("../layout/SmartHeader.vue"),
);
const BottomFeed = defineAsyncComponent(() => import("./BottomFeed.vue"));

const props = defineProps({
	shops: {
		type: Array,
		default: () => [],
	},
	favorites: {
		type: Array,
		default: () => [],
	},
	activeShopId: [Number, String], // Synced ID
});

const emit = defineEmits([
	"open-detail",
	"toggle-immersive",
	"update-active-shop",
]);

const shopStore = useShopStore();
const { selectFeedback } = useHaptics();

// Current Active Shop Logic
const activeShopIndex = ref(0);
const activeShop = computed(() => {
	// If external activeShopId is passed, prioritize it
	if (props.activeShopId) {
		return (
			props.shops.find((s) => s.id == props.activeShopId) || props.shops[0]
		);
	}
	return props.shops[activeShopIndex.value] || null;
});

// Watch for swipe changes from BottomFeed
const handleSwipeChange = (shop) => {
	if (shop) {
		emit("update-active-shop", shop.id);
	}
};

const handleBack = () => {
	selectFeedback();
	emit("toggle-immersive");
};

const normalizeId = (value) => {
	if (value === null || value === undefined) return "";
	return String(value).trim();
};

const isFavorited = (shopId) => {
	const id = normalizeId(shopId);
	if (!id) return false;
	return (props.favorites || []).some((fav) => normalizeId(fav) === id);
};

const handleFavorite = (shopId) => {
	selectFeedback();
	shopStore.toggleFavorite(shopId);
	coinStore.awardCoins(1);
};

const handleShare = async (shop) => {
	selectFeedback();
	if (navigator.share) {
		try {
			await navigator.share({
				title: shop.name || "VibeCity",
				text: `Check out ${shop.name} on VibeCity!`,
				url: globalThis.location.href,
			});
			coinStore.awardCoins(5);
		} catch (err) {
			console.error(err);
		}
	} else {
		console.log("Web Share API not supported");
	}
};

const getDistance = (shop) => {
	if (shop?.distance) {
		return shop.distance < 1
			? `${(shop.distance * 1000).toFixed(0)}m`
			: `${shop.distance.toFixed(1)}km`;
	}
	return "";
};
</script>

<template>
  <div
    class="fixed inset-0 z-[6000] bg-black w-full h-full overflow-hidden"
    role="dialog"
    aria-modal="true"
    :aria-label="
      activeShop?.name
        ? `Immersive view: ${activeShop.name}`
        : 'Immersive feed view'
    "
  >
    <!-- 1. Background Media (Full Screen) -->
    <div class="absolute inset-0">
      <!-- Transition for smooth background switching -->
      <transition name="fade-slow" mode="out-in">
        <div :key="activeShop?.id" class="w-full h-full relative">
          <img
            :src="
              activeShop?.Image_URL1 ||
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1000&auto=format&fit=crop'
            "
            class="w-full h-full object-cover"
            alt=""
            aria-hidden="true"
          />
          <div
            class="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90"
          ></div>
        </div>
      </transition>
    </div>

    <!-- 2. Smart Header (Transparent) -->
    <!-- We repurpose the existing SmartHeader but force immersive props -->
    <SmartHeader
      :is-immersive="true"
      :globalSearchQuery="''"
      @open-sidebar="$emit('open-sidebar')"
      @haptic-tap="selectFeedback"
    />

    <!-- 3. Back Button (Custom for Immersive) -->
    <button
      @click="handleBack"
      aria-label="Exit immersive mode"
      class="fixed top-4 left-4 z-[7000] w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-transform shadow-lg"
    >
      <ArrowLeft class="w-5 h-5" />
    </button>

    <!-- 4. Floating Actions (Right Side) -->
    <div
      class="absolute right-4 bottom-48 flex flex-col items-center gap-6 z-20 pointer-events-auto"
    >
      <!-- Like -->
      <div class="flex flex-col items-center gap-1">
        <button
          @click.stop="handleFavorite(activeShop?.id)"
          aria-label="Like this venue"
          class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform transition-colors"
        >
          <Heart
            class="w-6 h-6 transition-[transform,color,fill] duration-300"
            :class="
              isFavorited(activeShop?.id)
                ? 'fill-red-500 text-red-500 scale-110'
                : 'text-white'
            "
          />
        </button>
        <span
          class="text-[10px] font-bold text-white shadow-black drop-shadow-md"
          >Like</span
        >
      </div>

      <!-- Share -->
      <div class="flex flex-col items-center gap-1">
        <button
          @click.stop="handleShare(activeShop)"
          aria-label="Share this venue"
          class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform transition-colors"
        >
          <Share2 class="w-6 h-6 text-white" />
        </button>
        <span
          class="text-[10px] font-bold text-white shadow-black drop-shadow-md"
          >Share</span
        >
      </div>

      <!-- Profile/More -->
      <div class="flex flex-col items-center gap-1">
        <button
          aria-label="Open venue profile"
          class="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform transition-colors"
        >
          <User class="w-6 h-6 text-white" />
        </button>
        <span
          class="text-[10px] font-bold text-white shadow-black drop-shadow-md"
          >Visit</span
        >
      </div>
    </div>

    <!-- 5. Bottom Feed (Reuse existing component for simplified maintenance) -->
    <!-- We hide the 'map' background of BottomFeed via props or CSS if needed, but since it overlays, it's fine -->
    <div class="absolute bottom-0 left-0 right-0 z-30">
      <!-- We pass specific props to ensure it acts as a 'controller' for the background -->
      <BottomFeed
        :is-immersive="true"
        :carousel-shops="shops"
        :active-shop-id="activeShopId"
        :favorites="favorites"
        @swipe-left="(shop) => handleSwipeChange(shop)"
        @swipe-right="(shop) => handleSwipeChange(shop)"
        @click-shop="$emit('open-detail', $event)"
        @scroll="() => {}"
      />
    </div>
  </div>
</template>

<style scoped>
.fade-slow-enter-active,
.fade-slow-leave-active {
  transition: opacity 0.8s ease;
}

.fade-slow-enter-from,
.fade-slow-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fade-slow-enter-active,
  .fade-slow-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
