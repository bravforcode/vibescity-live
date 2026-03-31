<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ShopCard from "./ShopCard.vue";

const { t } = useI18n();

const props = defineProps({
	shops: {
		type: Array,
		required: true,
	},
	activeShopId: {
		type: [Number, String],
		default: null,
	},
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	stickyTop: {
		type: Number,
		default: 0,
	},
	favorites: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits([
	"scroll-to-shop",
	"select-shop",
	"open-detail",
	"hover-shop",
	"toggle-favorite",
]);

// Card refs for scrolling
const cardRefs = ref({});
const panelRef = ref(null);
const isUserScrolling = ref(false);
let scrollTimeout = null;
let observerInstance = null;

// Set up Intersection Observer for scroll sync
onMounted(() => {
	setupIntersectionObserver();
});

onUnmounted(() => {
	if (observerInstance) {
		observerInstance.disconnect();
	}
	if (scrollTimeout) {
		clearTimeout(scrollTimeout);
	}
});

const setupIntersectionObserver = () => {
	const normalizeId = (value) => {
		if (value === null || value === undefined) return "";
		return String(value).trim();
	};

	const options = {
		root: panelRef.value,
		rootMargin: "-40% 0px -40% 0px",
		threshold: 0.5,
	};

	observerInstance = new IntersectionObserver((entries) => {
		if (isUserScrolling.value) {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const shopId = normalizeId(entry.target.dataset.shopId);
					if (!shopId) return;
					const shop = props.shops.find((s) => normalizeId(s.id) === shopId);
					if (shop) {
						emit("scroll-to-shop", shop);
					}
				}
			});
		}
	}, options);

	nextTick(() => {
		Object.values(cardRefs.value).forEach((el) => {
			if (el) observerInstance.observe(el);
		});
	});
};

// Infinite DOM rendering limit
const visibleCount = ref(30);
const visibleShops = computed(() => props.shops.slice(0, visibleCount.value));

// Re-observe when visible shops change
watch(
	() => visibleShops.value,
	() => {
		nextTick(() => {
			if (observerInstance) {
				observerInstance.disconnect();
				Object.values(cardRefs.value).forEach((el) => {
					if (el) observerInstance.observe(el);
				});
			}
		});
	},
);

// Handle scroll events & Infinite Scroll
const handleScroll = (e) => {
	isUserScrolling.value = true;
	if (scrollTimeout) clearTimeout(scrollTimeout);
	scrollTimeout = setTimeout(() => {
		isUserScrolling.value = false;
	}, 150);

	// Infinite scroll logic
	const { scrollTop, scrollHeight, clientHeight } = e.target;
	if (scrollTop + clientHeight >= scrollHeight - 800) {
		if (visibleCount.value < props.shops.length) {
			visibleCount.value += 30;
		}
	}
};

// Exposed method to scroll to a specific shop
const scrollToShop = (shopId) => {
	isUserScrolling.value = false;
	const card = cardRefs.value[shopId];
	if (card) {
		card.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	}
};

// Register card ref
const setCardRef = (el, shopId) => {
	if (el) {
		cardRefs.value[shopId] = el;
	}
};

// Handle hover on shop card - emit to parent for map sync
const handleCardHover = (shop) => {
	emit("hover-shop", shop);
};

// Count live shops
const liveCount = computed(() => {
	return props.shops.filter((s) => s.status === "LIVE").length;
});

defineExpose({ scrollToShop });
</script>

<template>
  <div
    ref="panelRef"
    data-testid="desktop-feed-panel"
    :class="[
      'video-panel h-full overflow-y-auto border-l',
      isDarkMode
        ? 'bg-[linear-gradient(180deg,#060814_0%,#09090b_100%)] border-white/10'
        : 'bg-white border-gray-200',
    ]"
    @scroll="handleScroll"
  >
    <!-- Header -->
    <div
      :class="[
        'sticky z-20 border-b px-4 py-4',
        isDarkMode
          ? 'bg-[linear-gradient(135deg,rgba(6,8,20,0.98)_0%,rgba(9,9,11,0.98)_100%)] border-white/10'
          : 'bg-white border-gray-200',
      ]"
      :style="{ top: `${Math.max(0, stickyTop)}px` }"
    >
      <div class="flex min-h-[44px] items-center justify-between">
        <h2
          :class="[
            'text-lg font-black tracking-tight',
            isDarkMode ? 'text-white' : 'text-gray-900',
          ]"
        >
          {{ t("nav.vibes_now") || "Vibes Now" }}
        </h2>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span class="text-xs text-red-500 font-semibold">
            {{ liveCount }} {{ t("status.live") }}
          </span>
        </div>
      </div>
    </div>

    <!-- Shop Cards List -->
    <div class="space-y-4 p-4 xl:p-5">
      <div
        v-for="(shop, index) in visibleShops"
        :key="shop.id"
        :ref="(el) => setCardRef(el, shop.id)"
        :data-shop-id="shop.id"
        data-testid="desktop-shop-card"
        :class="[
          'shop-card-wrapper transition duration-300',
          activeShopId === shop.id ? 'scale-[1.02]' : '',
        ]"
      >
        <ShopCard
          :shop="shop"
          :isActive="activeShopId === shop.id"
          :isDarkMode="isDarkMode"
          :favorites="favorites"
          :isPriority="index === 0"
          @click="emit('select-shop', shop)"
          @open-detail="emit('open-detail', shop)"
          @hover="handleCardHover"
          @toggle-favorite="(id) => emit('toggle-favorite', id)"
        />
      </div>

      <!-- Empty State -->
      <div
        v-if="shops.length === 0"
        :class="[
          'py-20 text-center space-y-3',
          isDarkMode ? 'text-white/30' : 'text-gray-400',
        ]"
      >
        <p class="text-sm font-semibold">
          {{ t("status.no_shops") || "ไม่พบร้านค้า" }}
        </p>
      </div>
    </div>

    <!-- Footer spacing -->
    <div class="h-20"></div>
  </div>
</template>

<style scoped>
.video-panel {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.video-panel::-webkit-scrollbar {
  width: 6px;
}

.video-panel::-webkit-scrollbar-track {
  background: transparent;
}

.video-panel::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.video-panel::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.25);
}

.shop-card-wrapper {
  content-visibility: auto;
  contain-intrinsic-size: 0 320px;
}
</style>
