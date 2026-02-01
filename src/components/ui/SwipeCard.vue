<script setup>
/**
 * SwipeCard.vue - Premium Enhanced Edition with Subtle RGB Glow
 * Optimized for visual excellence and smooth interactions
 */

import { useHaptics } from "@/composables/useHaptics";
import { Car, ChevronUp, Clock, Heart, Share2 } from "lucide-vue-next";
import { computed, defineEmits, defineProps, ref, watch } from "vue";
import { useShopStore } from "../../store/shopStore";

const props = defineProps({
  threshold: { type: Number, default: 90 },
  showExpand: { type: Boolean, default: true },
  isSelected: { type: Boolean, default: false },
  isImmersive: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false, Shop: Object },
  shop: { type: Object },
});

const emit = defineEmits([
  "swipe-left",
  "swipe-right",
  "expand",
  "toggle-favorite",
  "share",
  "open-ride", // ✅ Added
]);

// ... (keep existing setup)

// Computed for Safe Display
const displayName = computed(
  () => props.shop?.name || props.shop?.Name || "Venue",
);
const displayCategory = computed(
  () =>
    props.shop?.category ||
    props.shop?.Category ||
    props.shop?.type ||
    "General",
);
const displayTime = computed(() => {
  const o = props.shop?.openTime || props.shop?.OpenTime || "10:00";
  const c = props.shop?.closeTime || props.shop?.CloseTime || "22:00";
  return `${o} - ${c}`;
});
const displayDistance = computed(() => {
  const d = props.shop?.distance || props.shop?.Distance;
  return d !== undefined ? `${Number(d).toFixed(1)}km` : "Nearby";
});

// ...

// In Template:
// Replace {{ shop?.name }} with {{ displayName }}
// Replace category with {{ displayCategory }}
// Update Ride Button:
/*
<button
  @click.stop="emit('open-ride')"
  class="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-sm shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 border border-blue-400/50"
>
  <Car class="w-4 h-4" />
  เรียกรถ
</button>
*/

const { selectFeedback, successFeedback } = useHaptics();

// Element Refs
const container = ref(null);
const shopStore = useShopStore();

watch(
  () => props.isActive,
  (active) => {
    if (active && props.shop?.id) {
      shopStore.incrementView(props.shop.id);
    }
  },
);

// Physics State
const touchStartY = ref(0);
const touchStartX = ref(0);
const pullUpDistance = ref(0);
const isDragging = ref(false);
const hasTriggeredSnap = ref(false);

const applyResistance = (diff) => {
  const limit = 200;
  return (1 - Math.exp(-Math.abs(diff) / 300)) * limit;
};

const handleTouchStart = (e) => {
  if (props.isImmersive) return; // Disable drag in immersive mode
  touchStartY.value = e.touches[0].clientY;
  touchStartX.value = e.touches[0].clientX;
  isDragging.value = true;
  hasTriggeredSnap.value = false;
};

const handleTouchMove = (e) => {
  if (!isDragging.value) return;

  // Use rAF to sync with screen refresh
  requestAnimationFrame(() => {
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const diffY = currentY - touchStartY.value;
    const diffX = currentX - touchStartX.value;

    // Horizontal Swipe Protection
    if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (pullUpDistance.value !== 0) pullUpDistance.value = 0;
      return;
    }

    if (diffY < 0) {
      if (e.cancelable) e.preventDefault();
      pullUpDistance.value = applyResistance(diffY);

      if (
        pullUpDistance.value > props.threshold * 0.8 &&
        !hasTriggeredSnap.value
      ) {
        selectFeedback();
        hasTriggeredSnap.value = true;
      } else if (
        pullUpDistance.value < props.threshold * 0.8 &&
        hasTriggeredSnap.value
      ) {
        hasTriggeredSnap.value = false;
      }
    }
  });
};

const handleTouchEnd = () => {
  isDragging.value = false;

  if (pullUpDistance.value > props.threshold) {
    successFeedback();
    emit("expand");

    setTimeout(() => {
      pullUpDistance.value = 0;
    }, 300);
  } else {
    pullUpDistance.value = 0;
  }
};

// Computed Transformations
const cardStyle = computed(() => {
  const progress = Math.min(pullUpDistance.value / props.threshold, 1.0);
  const scale = 1.0 - progress * 0.05;

  return {
    transform: `
      translateY(${-pullUpDistance.value}px)
      scale(${scale})
      perspective(1000px)
    `,
    borderRadius: `${24 + progress * 8}px`,
    transition: isDragging.value
      ? "none"
      : "transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), border-radius 0.3s ease",
    willChange: "transform, border-radius",
  };
});

const uiOpacity = computed(() =>
  Math.max(0, 1 - pullUpDistance.value / (props.threshold * 0.6)),
);
</script>

<template>
  <div
    ref="container"
    data-testid="shop-card"
    class="swipe-card-container group relative transition-all duration-300"
    :class="{ 'z-30': isSelected }"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
  >
    <!-- ✅ Shop Content (Restored) -->
    <div
      class="swipe-card-content bg-zinc-900 overflow-hidden shadow-2xl relative w-full h-full"
    >
      <!-- Image -->
      <img
        v-if="shop?.Image_URL1"
        :src="shop.Image_URL1"
        :alt="shop?.name"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-110"
        loading="lazy"
      />
      <div
        v-else
        class="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2 opacity-30">
          <span class="text-4xl">📸</span>
          <span class="text-[10px] font-bold uppercase tracking-widest"
            >No Image</span
          >
        </div>
      </div>

      <!-- Gradient Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent"
      ></div>

      <!-- Badges & Actions (Top) -->
      <div
        class="absolute top-3 left-3 right-3 flex justify-between items-start z-20"
      >
        <div class="flex flex-col gap-2">
          <div
            v-if="shop?.status === 'LIVE'"
            class="px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black animate-pulse shadow-lg backdrop-blur-sm border border-red-400/50 flex items-center gap-1"
          >
            <span class="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
          </div>
          <div
            v-if="shop?.isPromoted"
            class="px-2.5 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[10px] font-black shadow-lg border border-yellow-300/50 flex items-center gap-1"
          >
            🔥 GOLDEN
          </div>
        </div>

        <!-- Quick Actions -->
        <div v-if="!isImmersive" class="flex flex-col gap-2">
          <button
            @click.stop="emit('toggle-favorite')"
            class="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all hover:bg-black/60"
          >
            <Heart class="w-4 h-4" />
          </button>
          <button
            @click.stop="emit('share')"
            class="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all hover:bg-black/60"
          >
            <Share2 class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Info Area -->
      <div class="absolute bottom-0 left-0 right-0 p-4 z-20 pb-10">
        <!-- Title & Type -->
        <h4
          class="text-xl font-black text-white leading-tight truncate mb-1 drop-shadow-md"
        >
          {{ displayName }}
        </h4>
        <div class="flex items-center gap-2 mb-2">
          <span
            class="px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-bold text-white/90 uppercase backdrop-blur-sm"
          >
            {{ displayCategory }}
          </span>
          <div class="flex items-center gap-1 text-white/80 text-[10px]">
            <Clock class="w-3 h-3" />
            <span>{{ displayTime }}</span>
          </div>
        </div>

        <!-- Rating & Status stats -->
        <div class="flex items-center gap-3 mb-3">
          <div
            class="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-full border border-white/10"
          >
            <span class="w-2 h-2 rounded-full bg-yellow-400"></span>
            <span class="text-xs font-bold text-white">16</span>
          </div>
          <span class="text-[10px] text-green-400 font-bold flex items-center">
            ↑ {{ displayDistance }}
          </span>
        </div>

        <!-- CTA Button -->
        <button
          @click.stop="emit('open-ride')"
          class="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold text-sm shadow-lg shadow-blue-500/30 active:scale-95 transition-all flex items-center justify-center gap-2 border border-blue-400/50"
        >
          <Car class="w-4 h-4" />
          เรียกรถ
        </button>
      </div>
    </div>

    <!-- ✨ Enhanced Pull Handle Overlay (iPhone Style Home Bar) - Inside Card for safety -->
    <div
      v-if="showExpand"
      class="absolute bottom-1 left-0 right-0 flex justify-center pointer-events-none transition-opacity duration-300 z-20"
      :style="{ opacity: uiOpacity }"
    >
      <div
        class="w-10 h-1 rounded-full bg-white/50 backdrop-blur-md shadow-sm"
      ></div>
    </div>

    <!-- Release Indicator (Enhanced: Blended) -->
    <div
      class="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-0"
      :style="{
        opacity:
          pullUpDistance > 40
            ? Math.min(1, (pullUpDistance - 40) / (props.threshold - 40))
            : 0,
        transform: `translateY(${Math.min(0, -pullUpDistance * 0.1)}px) scale(${0.9 + (pullUpDistance / props.threshold) * 0.1})`,
      }"
    >
      <div
        class="relative px-5 py-2.5 rounded-full bg-black/60 backdrop-blur-xl text-white font-bold text-[10px] uppercase tracking-widest shadow-2xl flex items-center gap-2 border border-white/10"
      >
        <ChevronUp
          class="w-4 h-4 animate-bounce text-blue-400"
          stroke-width="3"
        />
        <span class="text-white/90">More details</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.swipe-card-container {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  touch-action: pan-x;
  overflow: visible;
  perspective: 1000px;
}

.swipe-card-content {
  position: relative;
  width: 100%;
  height: 100%;
  will-change: transform, border-radius;
  border-radius: 24px;
  backface-visibility: hidden;
  transform: translateZ(0);
  transition:
    background-color 0.3s ease,
    box-shadow 0.3s ease;
}

@keyframes bounce-gentle {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-bounce-gentle {
  animation: bounce-gentle 2s ease-in-out infinite;
}

@keyframes slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}

.animate-slide {
  animation: slide 2.5s ease-in-out infinite;
}
</style>
