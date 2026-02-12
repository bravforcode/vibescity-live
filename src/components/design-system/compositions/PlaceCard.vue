<template>
  <GlassCard
    :radius="isSelected ? '2xl' : 'xl'"
    :interactive="!isSelected"
    class="w-full h-full flex flex-col overflow-hidden transition-[transform,opacity,border-radius] duration-500 will-change-transform touch-pan-y"
    :class="[
      isActive ? 'opacity-100 scale-100 z-10' : 'opacity-100 scale-95 z-0',
      isSelected ? 'rounded-t-[32px] border-t-white/20' : '',
    ]"
    :style="cardStyle"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    role="article"
  >
    <!-- Map Obscure Backdrop (When not active) -->
    <div
      v-if="!isActive"
      class="absolute inset-0 bg-black/40 z-20 pointer-events-none"
    ></div>

    <!-- 1. Media Area -->
    <div
      class="relative w-full shrink-0 transition-[height,transform,opacity] duration-500 ease-emphasized"
      :class="isSelected ? 'h-[35vh]' : 'h-full absolute inset-0'"
    >
      <img
        v-if="shop.Image_URL1"
        :src="shop.Image_URL1"
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
        alt="Venue thumbnail"
      />
      <div
        v-else
        class="w-full h-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center"
      >
        <span class="text-white/20 font-black text-2xl">VIBE</span>
      </div>

      <div
        class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90"
      ></div>

      <!-- Header (Category & Favorite) -->
      <div
        class="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-30"
      >
        <span
          class="px-3 py-1 rounded-full bg-black/80 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/90"
        >
          {{ shop.category || "Spot" }}
        </span>
        <div class="flex flex-col gap-3">
          <!-- Favorite -->
          <button
            @click.stop="$emit('toggle-favorite')"
            aria-label="Toggle favorite"
            class="p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-pink-500/80 transition-colors transition-transform border border-white/10 shadow-lg"
          >
            <Heart
              class="w-5 h-5"
              :class="{ 'fill-vibe-pink text-vibe-pink': isFavorited }"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- 2. Content Area (Collapsed) -->
    <div
      v-if="!isSelected"
      class="absolute bottom-0 left-0 right-0 p-3 z-30 flex flex-col justify-end pointer-events-none"
    >
      <div class="mb-2 px-1">
        <h2
          class="text-lg font-bold text-white mb-0.5 drop-shadow-md leading-tight"
        >
          {{ shop.name }}
        </h2>
        <div class="flex items-center gap-2 text-white/80 text-xs font-medium">
          <div class="flex items-center gap-1">
            <MapPin class="w-3 h-3 text-blue-400" />
            <span>{{ (shop.distance || 0).toFixed(1) }} km</span>
          </div>
          <span class="w-1 h-1 rounded-full bg-white/50"></span>
          <span class="text-green-400 font-bold uppercase tracking-wider">
            {{ shop.status || "OPEN" }}
          </span>
        </div>
      </div>

      <!-- Action Buttons (Bottom Bar) -->
      <div class="flex gap-2 w-full pointer-events-auto mt-1">
        <button
          @click.stop="$emit('navigate')"
          class="flex-1 py-2 rounded-lg bg-blue-600 active:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg backdrop-blur-md border border-white/10"
        >
          <Navigation class="w-3.5 h-3.5" />
          <span>Nav</span>
        </button>
        <button
          @click.stop="$emit('open-ride')"
          class="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg backdrop-blur-md border border-white/10"
        >
          <Car class="w-3.5 h-3.5" />
          <span>Ride</span>
        </button>
      </div>
    </div>

    <!-- 3. Expanded Content (Scrollable) -->
    <div v-else class="flex-1 bg-dark flex flex-col relative animate-slide-up">
      <!-- Handle -->
      <button
        type="button"
        class="w-full flex justify-center py-3"
        aria-label="Collapse details"
        @click="$emit('collapse')"
      >
        <span class="w-12 h-1.5 bg-white/20 rounded-full"></span>
      </button>

      <div class="p-6 overflow-y-auto pb-safe-bottom">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-2xl font-bold text-white mb-1">{{ shop.name }}</h1>
            <p class="text-text-muted text-sm">Open 17:00 - 02:00 • $$</p>
          </div>
          <ActionBtn
            variant="primary"
            size="sm"
            radius="full"
            @click="$emit('navigate')"
          >
            <template #icon-left><Navigation class="w-3 h-3" /></template>
            GO
          </ActionBtn>
        </div>

        <!-- Highlights Grid -->
        <div class="space-y-4">
          <h3
            class="text-sm font-bold text-text-secondary uppercase tracking-widest"
          >
            Highlights
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-4 rounded-xl bg-surface-test border border-white/5">
              <div class="text-vibe-purple mb-2"><Music class="w-5 h-5" /></div>
              <div class="text-sm font-bold text-white">Live Jazz</div>
              <div class="text-xs text-text-muted">Tonight 9 PM</div>
            </div>
            <div class="p-4 rounded-xl bg-surface-test border border-white/5">
              <div class="text-vibe-pink mb-2"><Star class="w-5 h-5" /></div>
              <div class="text-sm font-bold text-white">Signature</div>
              <div class="text-xs text-text-muted">Cocktails</div>
            </div>
          </div>
        </div>

        <div class="mt-8 text-center">
          <ActionBtn variant="secondary" block @click="$emit('collapse')"
            >Close Details</ActionBtn
          >
        </div>
      </div>
    </div>
  </GlassCard>
</template>

<script setup>
import { Car, Heart, MapPin, Music, Navigation, Star } from "lucide-vue-next";
import { computed, ref } from "vue";
import ActionBtn from "../primitives/ActionBtn.vue";
import GlassCard from "../primitives/GlassCard.vue";

const props = defineProps({
	shop: Object,
	isActive: Boolean,
	isSelected: Boolean,
	isFavorited: Boolean,
});

const emit = defineEmits([
	"toggle-favorite",
	"navigate",
	"open-ride",
	"collapse",
	"expand",
	"share",
]);

// Physics State
const container = ref(null);
const touchStartY = ref(0);
const pullUpDistance = ref(0);
const isDragging = ref(false);
const threshold = 120; // Hardcoded or prop

const applyResistance = (diff) => {
	const limit = 200;
	return (1 - Math.exp(-Math.abs(diff) / 300)) * limit;
};

const handleTouchStart = (e) => {
	if (props.isSelected) return; // Only allow expand from collapsed
	touchStartY.value = e.touches[0].clientY;
	isDragging.value = true;
};

const handleTouchMove = (e) => {
	if (!isDragging.value || props.isSelected) return;

	const currentY = e.touches[0].clientY;
	const diffY = currentY - touchStartY.value;

	if (diffY < 0) {
		if (e.cancelable) e.preventDefault();
		pullUpDistance.value = applyResistance(diffY);
	}
};

const handleTouchEnd = () => {
	isDragging.value = false;
	if (pullUpDistance.value > threshold) {
		emit("expand");
		// Reset after animation
		setTimeout(() => {
			pullUpDistance.value = 0;
		}, 300);
	} else {
		pullUpDistance.value = 0;
	}
};

// Computed Transformations
const cardStyle = computed(() => {
	if (props.isSelected) return {};

	// Slight scale effect when pulling
	const progress = Math.min(pullUpDistance.value / threshold, 1.0);
	return {
		transform: `translateY(${-pullUpDistance.value}px) scale(${1 - progress * 0.05})`,
		transition: isDragging.value
			? "none"
			: "transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)",
	};
});
</script>

<style scoped>
.animate-slide-up {
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 24px);
}

@media (prefers-reduced-motion: reduce) {
  .animate-slide-up {
    animation: none;
  }
}
</style>
