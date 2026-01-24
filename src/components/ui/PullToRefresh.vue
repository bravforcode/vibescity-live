<script setup>
/**
 * PullToRefresh.vue - Custom iOS-grade Rubber Banding
 * Features:
 * - Logarithmic Decay Scaling (Apple-style resistance)
 * - Cubic-bezier Spring Snap-back
 * - Glassmorphic Pill UI
 * - Haptic Thresholds (Light -> Medium -> Heavy)
 */
import { ref } from "vue";
import { Loader2, ArrowDown } from "lucide-vue-next";
import { useHaptics } from "@/composables/useHaptics";

const props = defineProps({
  threshold: {
    type: Number,
    default: 100, // Distance to trigger refresh
  },
});

const emit = defineEmits(["refresh"]);

const { selectFeedback, successFeedback, toggleFeedback } = useHaptics();

// State
const el = ref(null);
const startY = ref(0);
const pullDistance = ref(0);
const isDragging = ref(false);
const isRefreshing = ref(false);
const hasTriggeredHaptic = ref(false);

// Physics: Apple Logarithmic Decay
// f(x) = (1 - 1 / ((x * k / d) + 1)) * d
const applyRubberBandPhysics = (diff) => {
  const dimension = window.innerHeight;
  const constant = 0.55; // Apple's friction constant
  return (1.0 - 1.0 / ((diff * constant) / dimension + 1.0)) * dimension;
};

const handleTouchStart = (e) => {
  // Only activate if at top of scroll
  if (window.scrollY <= 0 && !isRefreshing.value) {
    startY.value = e.touches[0].clientY;
    isDragging.value = true;
    hasTriggeredHaptic.value = false;
  }
};

const handleTouchMove = (e) => {
  if (!isDragging.value || isRefreshing.value) return;

  const currentY = e.touches[0].clientY;
  const diff = currentY - startY.value;

  // Logic: Dragging DOWN at the top
  if (diff > 0 && window.scrollY <= 0) {
    if (e.cancelable && !isRefreshing.value) e.preventDefault(); // Stop native refresh

    // Physics: 1:1 Linear until threshold, then Logarithmic Friction ("Sticky" feel)
    if (diff < props.threshold) {
      pullDistance.value = diff; // 1:1
    } else {
      const extra = diff - props.threshold;
      const friction = 0.55; // Apple constant
      const resistive =
        (1.0 - 1.0 / ((extra * friction) / window.innerHeight + 1.0)) *
        window.innerHeight;
      pullDistance.value = props.threshold + resistive;
    }

    // Haptic Thresholds
    if (pullDistance.value >= props.threshold && !hasTriggeredHaptic.value) {
      selectFeedback(); // Use select (medium-ish) for threshold
      hasTriggeredHaptic.value = true;
    } else if (
      pullDistance.value < props.threshold &&
      hasTriggeredHaptic.value
    ) {
      hasTriggeredHaptic.value = false;
      toggleFeedback(); // Tiny tick on cancel
    }
  } else {
    // Dragging up or not at top
    pullDistance.value = 0;
  }
};

const handleTouchEnd = () => {
  isDragging.value = false;
  startY.value = 0;

  if (pullDistance.value >= props.threshold) {
    // TRIGGER REFRESH
    isRefreshing.value = true;
    pullDistance.value = props.threshold; // Hold at threshold
    successFeedback(); // Heavy success click
    emit("refresh");

    // Failsafe timeout (parent should call finishRefresh)
    setTimeout(() => {
      if (isRefreshing.value) finishRefresh();
    }, 5000);
  } else {
    // CANCEL
    pullDistance.value = 0;
  }
};

// Exposed Method: Call this ref to close the spinner
const finishRefresh = () => {
  if (isRefreshing.value) {
    isRefreshing.value = false;
    pullDistance.value = 0;
    // Optional: Play a "done" sound or haptic
  }
};

defineExpose({ finishRefresh });
</script>

<template>
  <div
    ref="el"
    data-testid="scroll-root"
    class="relative w-full min-h-screen overscroll-contain"
    @touchstart.passive="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Indicator Layer (Absolute Top) -->
    <div
      data-testid="refresh-indicator"
      class="absolute left-0 top-0 z-40 flex w-full justify-center pointer-events-none"
      :style="{
        transform: `translate3d(0, ${pullDistance - 50}px, 0)`,
        opacity: Math.min(pullDistance / (props.threshold * 0.8), 1),
        transition: isDragging
          ? 'none'
          : 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)',
      }"
    >
      <!-- Glassmorphic Pill -->
      <div
        class="flex items-center gap-3 px-4 py-2 rounded-full border border-white/20 bg-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-all duration-300 transform scale-95"
        :class="{
          'scale-105 bg-white/30 shadow-[0_8px_32px_rgba(37,99,235,0.2)]':
            hasTriggeredHaptic,
        }"
      >
        <div class="relative w-5 h-5 flex items-center justify-center">
          <Loader2
            v-if="isRefreshing"
            class="w-4 h-4 text-white animate-spin"
          />
          <ArrowDown
            v-else
            class="w-4 h-4 text-white transition-transform duration-300"
            :style="{ transform: `rotate(${hasTriggeredHaptic ? 180 : 0}deg)` }"
          />
        </div>

        <span
          class="text-[10px] font-bold text-white uppercase tracking-widest drop-shadow-sm"
        >
          {{
            isRefreshing
              ? "Updating..."
              : hasTriggeredHaptic
                ? "Release"
                : "Pull Down"
          }}
        </span>
      </div>
    </div>

    <!-- Content Slot (Pushed Down) -->
    <div
      class="relative h-full w-full bg-neutral-50 dark:bg-[#0b0d11] transition-transform"
      :style="{
        transform: `translate3d(0, ${pullDistance}px, 0)`,
        transition: isDragging
          ? 'none'
          : 'transform 0.6s cubic-bezier(0.19, 1, 0.22, 1)',
        willChange: 'transform',
      }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* Prevent Chrome/Safari bounce to allow our custom physics */
.overscroll-contain {
  overscroll-behavior-y: none;
}
</style>
