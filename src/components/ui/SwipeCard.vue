<script setup>
/**
 * SwipeCard.vue - Pure Teaser (iOS Enterprise Edition)
 * Optimized for horizontal carousel fluidity and vertical interaction.
 */
import { ref, computed } from "vue";
import { ChevronUp } from "lucide-vue-next";
import { useHaptics } from "@/composables/useHaptics";

const props = defineProps({
  threshold: { type: Number, default: 120 },
  showExpand: { type: Boolean, default: true },
  isSelected: { type: Boolean, default: false },
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

// Physics State
const touchStartY = ref(0);
const touchStartX = ref(0);
const pullUpDistance = ref(0);
const isDragging = ref(false);
const hasTriggeredSnap = ref(false);

const applyResistance = (diff) => {
  // iOS-style Logarithmic Decay for realistic deep-pull feel
  const limit = 200;
  return (1 - Math.exp(-Math.abs(diff) / 300)) * limit;
};

const handleTouchStart = (e) => {
  touchStartY.value = e.touches[0].clientY;
  touchStartX.value = e.touches[0].clientX;
  isDragging.value = true;
  hasTriggeredSnap.value = false;
};

const handleTouchMove = (e) => {
  if (!isDragging.value) return;

  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const diffY = currentY - touchStartY.value;
  const diffX = currentX - touchStartX.value;

  // 1. Horizontal Lock: If moving sideways dramatically, ignore vertical pull
  if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
    pullUpDistance.value = 0;
    return; // Let native carousel scroll take over
  }

  // 2. Vertical Pull Logic (Only if pulling UP)
  if (diffY < 0) {
    if (e.cancelable) e.preventDefault(); // Stop page scroll
    pullUpDistance.value = applyResistance(diffY);

    if (
      pullUpDistance.value > props.threshold * 0.8 &&
      !hasTriggeredSnap.value
    ) {
      selectFeedback(); // Light haptic
      hasTriggeredSnap.value = true;
    } else if (
      pullUpDistance.value < props.threshold * 0.8 &&
      hasTriggeredSnap.value
    ) {
      hasTriggeredSnap.value = false;
    }
  }
};

const handleTouchEnd = (e) => {
  isDragging.value = false;

  if (pullUpDistance.value > props.threshold) {
    // Valid "Open" gesture
    successFeedback(); // Heavy haptic
    emit("expand");

    // Smooth reset
    setTimeout(() => {
      pullUpDistance.value = 0;
    }, 300);
  } else {
    // Snap back
    pullUpDistance.value = 0;
  }
};

// Computed Transformations
const cardStyle = computed(() => {
  const progress = Math.min(pullUpDistance.value / props.threshold, 1.0);
  const scale = 1.0 - progress * 0.05; // Slight shrink on pull

  return {
    transform: `
      translateY(${-pullUpDistance.value}px) 
      scale(${scale}) 
      perspective(1000px)
    `,
    borderRadius: `${24 + progress * 8}px`,
    transition: isDragging.value
      ? "none" // Zero latency while dragging
      : "transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), border-radius 0.3s ease", // iOS Spring on release
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
    class="swipe-card-container group relative transition-all duration-300"
    :class="{ 'z-30 scale-[1.02]': isSelected }"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Content Wrapper -->
    <div
      class="swipe-card-content origin-center relative bg-black overflow-hidden shadow-2xl"
      :style="cardStyle"
    >
      <!-- Slot for Image/Video content -->
      <slot />

      <!-- Premium Pull Handle Overlay (Minimalist) -->
      <div
        v-if="showExpand"
        class="absolute bottom-4 left-0 right-0 flex flex-col items-center justify-end pointer-events-none transition-opacity duration-300 z-10"
        :style="{ opacity: uiOpacity }"
      >
        <div class="flex flex-col items-center gap-1.5">
          <!-- Glass Pill Indicator (No Blur, just White) -->
          <div
            class="w-8 h-1 bg-white/80 rounded-full shadow-sm animate-bounce-micro"
          ></div>

          <!-- Blurred Text Hint (Only text area is blurred) -->
          <div class="overflow-hidden rounded-md mt-1">
            <span
              class="block text-[9px] font-black text-white/90 uppercase tracking-[0.2em] backdrop-blur-md bg-black/20 px-3 py-1 border border-white/5"
            >
              Swipe for Detail
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Release Indicator (Behind Card) -->
    <div
      class="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none z-0"
      :style="{
        opacity: pullUpDistance > 60 ? pullUpDistance / props.threshold : 0,
        transform: `translateY(${Math.min(0, -pullUpDistance * 0.1 + 10)}px) scale(${0.8 + (pullUpDistance / props.threshold) * 0.2})`,
      }"
    >
      <div
        class="px-4 py-2 rounded-full bg-white text-black font-black text-[10px] uppercase tracking-wider shadow-xl flex items-center gap-2"
      >
        <ChevronUp class="w-3 h-3 animate-bounce" />
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
  touch-action: pan-x; /* Critical for horizontal scroll */
  overflow: visible;
  perspective: 1000px;
}

.swipe-card-content {
  position: relative;
  width: 100%;
  height: 100%;
  will-change: transform, border-radius;
  border-radius: 24px;
  /* Premium Shadow */
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5);
  backface-visibility: hidden;
  transform: translateZ(0);
  background-color: #1a1a1a;
}

@keyframes bounce-micro {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  50% {
    transform: translateY(-3px);
    opacity: 0.8;
  }
}
.animate-bounce-micro {
  animation: bounce-micro 2s infinite ease-in-out;
}
</style>
