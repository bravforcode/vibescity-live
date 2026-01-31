<script setup>
/**
 * SwipeCard.vue - Premium Enhanced Edition with Subtle RGB Glow
 * Optimized for visual excellence and smooth interactions
 */

import { useHaptics } from "@/composables/useHaptics";
import { ChevronUp } from "lucide-vue-next";
import { computed, defineEmits, defineProps, ref, watch } from "vue";
import { useShopStore } from "../../store/shopStore";

const props = defineProps({
  threshold: { type: Number, default: 120 },
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
]);

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

    <!-- Release Indicator (Enhanced) -->
    <div
      class="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none z-0"
      :style="{
        opacity: pullUpDistance > 60 ? pullUpDistance / props.threshold : 0,
        transform: `translateY(${Math.min(0, -pullUpDistance * 0.15 + 10)}px) scale(${0.8 + (pullUpDistance / props.threshold) * 0.2})`,
      }"
    >
      <div
        class="relative px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl flex items-center gap-2 border-2 border-white/30"
      >
        <div
          class="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 blur-xl opacity-60 -z-10"
        ></div>
        <ChevronUp class="w-4 h-4 animate-bounce" stroke-width="3" />
        <span>Release to Open</span>
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
