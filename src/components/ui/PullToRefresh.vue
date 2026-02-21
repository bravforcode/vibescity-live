<script setup>
import { Loader2 } from "lucide-vue-next";
import { onBeforeUnmount, ref, watch } from "vue";
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
let resetTimeout = null; // ✅ Store timeout ID for cleanup

const onTouchStart = (e) => {
	// Only trigger if at top of scroll (use || not &&)
	if (
		window.scrollY > 0 ||
		(containerRef.value && containerRef.value.scrollTop > 0)
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

		// Always prevent native pull-to-refresh when actively handling
		if (e.cancelable) e.preventDefault();
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
			// Clear existing timeout before creating new one
			if (resetTimeout) clearTimeout(resetTimeout);
			// Reset after refresh done
			resetTimeout = setTimeout(() => {
				pullDistance.value = 0;
				isReadyToRefresh.value = false;
				resetTimeout = null;
			}, 300);
		}
	},
);

// ✅ Cleanup timeout on unmount
onBeforeUnmount(() => {
	if (resetTimeout) {
		clearTimeout(resetTimeout);
		resetTimeout = null;
	}
});
</script>

<template>
  <div
    ref="containerRef"
    data-testid="pull-refresh"
    class="pull-refresh-wrapper relative"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Spinner Area -->
    <div
      data-testid="refresh-indicator"
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
          class="w-6 h-6 transition-all duration-300"
          :class="[
            isRefreshing || isReadyToRefresh
              ? 'animate-spin text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]'
              : 'text-white/20',
            isDragging && !isReadyToRefresh ? 'scale-75' : 'scale-100',
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
