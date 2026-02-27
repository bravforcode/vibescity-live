<script setup>
import { ref, watch } from "vue";
import { Loader2 } from "lucide-vue-next";
import { useHaptics } from "@/composables/useHaptics";

const props = defineProps({
  isRefreshing: Boolean,
});

const emit = defineEmits(["refresh"]);
const { selectFeedback, successFeedback } = useHaptics();

const pullDistance = ref(0);
const isReadyToRefresh = ref(false);
const containerRef = ref(null);
const THRESHOLD = 80;

// State tracking
let startY = 0;
let isDragging = false;

const onTouchStart = (e) => {
  // Only trigger if at top of scroll
  if (
    window.scrollY > 0 &&
    (!containerRef.value || containerRef.value.scrollTop > 0)
  )
    return;

  startY = e.touches[0].clientY;
  isDragging = true;
};

const onTouchMove = (e) => {
  if (!isDragging) return;

  const currentY = e.touches[0].clientY;
  const diff = currentY - startY;

  // Only pull down
  if (diff > 0) {
    // Apply resistance
    const resistance = diff * 0.4;
    pullDistance.value = Math.min(resistance, 150); // Cap visual pull

    // Haptic snap logic
    if (pullDistance.value > THRESHOLD && !isReadyToRefresh.value) {
      isReadyToRefresh.value = true;
      selectFeedback();
    } else if (pullDistance.value < THRESHOLD && isReadyToRefresh.value) {
      isReadyToRefresh.value = false;
    }

    // Prevent browser refresh logic if we are handling it
    if (diff < 200 && e.cancelable) e.preventDefault();
  }
};

const onTouchEnd = () => {
  isDragging = false;
  if (isReadyToRefresh.value) {
    pullDistance.value = THRESHOLD; // Snap to loading position
    successFeedback();
    emit("refresh");
  } else {
    pullDistance.value = 0; // Snap back
  }
};

watch(
  () => props.isRefreshing,
  (newVal) => {
    if (!newVal) {
      // Reset after refresh done
      setTimeout(() => {
        pullDistance.value = 0;
        isReadyToRefresh.value = false;
      }, 300);
    }
  },
);
</script>

<template>
  <div
    ref="containerRef"
    class="pull-refresh-wrapper relative"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Spinner Area -->
    <div
      class="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none z-50 overflow-hidden text-white"
      :style="{
        height: `${pullDistance}px`,
        opacity: pullDistance / THRESHOLD,
        transition: isDragging
          ? 'none'
          : 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
      }"
    >
      <div class="transform translate-y-2">
        <Loader2
          class="w-6 h-6"
          :class="[
            isRefreshing || isReadyToRefresh ? 'animate-spin' : '',
            isReadyToRefresh ? 'text-blue-400' : 'text-white/50',
          ]"
        />
      </div>
    </div>

    <!-- Content Slot (Pushed down) -->
    <div
      class="relative transition-transform duration-300 ease-out will-change-transform"
      :style="{
        transform: `translateY(${pullDistance}px)`,
        transition: isDragging
          ? 'none'
          : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
      }"
    >
      <slot />
    </div>
  </div>
</template>
