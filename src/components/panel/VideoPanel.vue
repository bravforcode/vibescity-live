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
	const options = {
		root: panelRef.value,
		rootMargin: "-40% 0px -40% 0px",
		threshold: 0.5,
	};

	observerInstance = new IntersectionObserver((entries) => {
		if (isUserScrolling.value) {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const shopId = parseInt(entry.target.dataset.shopId);
					const shop = props.shops.find((s) => s.id === shopId);
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

// Re-observe when shops change
watch(
	() => props.shops,
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

// Handle scroll events
const handleScroll = () => {
	isUserScrolling.value = true;
	if (scrollTimeout) clearTimeout(scrollTimeout);
	scrollTimeout = setTimeout(() => {
		isUserScrolling.value = false;
	}, 150);
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
    :class="[
      'video-panel h-full overflow-y-auto border-l',
      isDarkMode
        ? 'bg-zinc-950/95 backdrop-blur-xl border-white/10'
        : 'bg-white/95 backdrop-blur-xl border-gray-200',
    ]"
    @scroll="handleScroll"
  >
    <!-- Header -->
    <div
      :class="[
        'sticky top-0 z-20 backdrop-blur-xl border-b p-4',
        isDarkMode
          ? 'bg-zinc-950/95 border-white/10'
          : 'bg-white/95 border-gray-200',
      ]"
    >
      <div class="flex items-center justify-between">
        <h2
          :class="[
            'text-lg font-semibold',
            isDarkMode ? 'text-white' : 'text-gray-900',
          ]"
        >
          {{ t("nav.vibes_now") || "Vibes Now" }}
        </h2>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span class="text-xs text-red-500 font-medium">
            {{ liveCount }} {{ t("status.live") }}
          </span>
        </div>
      </div>
    </div>

    <!-- Shop Cards List -->
    <div class="p-3 space-y-3">
      <div
        v-for="shop in shops"
        :key="shop.id"
        :ref="(el) => setCardRef(el, shop.id)"
        :data-shop-id="shop.id"
        :class="[
          'transition-all duration-300',
          activeShopId === shop.id ? 'scale-[1.02]' : '',
        ]"
      >
        <ShopCard
          :shop="shop"
          :isActive="activeShopId === shop.id"
          :isDarkMode="isDarkMode"
          :favorites="favorites"
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
        <p class="text-sm">{{ t("status.no_shops") || "ไม่พบร้านค้า" }}</p>
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
</style>
