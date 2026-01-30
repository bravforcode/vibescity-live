<template>
  <div
    class="fixed inset-x-0 bottom-0 z-50 flex flex-col transition-transform duration-300 ease-emphasized will-change-transform"
    :class="[
      stateClasses,
      'bg-surface-glass backdrop-blur-[20px] rounded-t-[32px] border-t border-white/10 shadow-elevation-3',
    ]"
    :style="sheetStyle"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Handle -->
    <div
      class="w-full flex justify-center py-4 cursor-grab active:cursor-grabbing"
    >
      <div class="w-12 h-1.5 bg-white/20 rounded-full"></div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden relative">
      <slot :state="currentState" />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const props = defineProps({
	modelValue: {
		// 'collapsed' | 'half' | 'full'
		type: String,
		default: "collapsed",
	},
});

const emit = defineEmits(["update:modelValue"]);

// Constants
const STATES = {
	COLLAPSED: "collapsed",
	HALF: "half",
	FULL: "full",
};

const currentState = ref(props.modelValue);
const touchStartY = ref(0);
const currentY = ref(0);
const isDragging = ref(false);

watch(
	() => props.modelValue,
	(val) => {
		currentState.value = val;
	},
);

const stateClasses = computed(() => {
	// Height classes managed via dynamic style for better physics control,
	// but we can use classes for base positioning
	return "";
});

const sheetStyle = computed(() => {
	let height = "120px"; // Default collapsed
	if (currentState.value === STATES.HALF) height = "50vh";
	if (currentState.value === STATES.FULL) height = "92vh";

	if (isDragging.value) {
		// Add drag offset logic here if needed for specific physics
	}

	return { height };
});

const handleTouchStart = (e) => {
	touchStartY.value = e.touches[0].clientY;
	isDragging.value = true;
};

const handleTouchMove = (e) => {
	if (!isDragging.value) return;
	const touchY = e.touches[0].clientY;
	const diff = touchY - touchStartY.value;

	// Simple state switching logic based on drag direction
	if (Math.abs(diff) > 50) {
		// Determine direction
	}
};

const handleTouchEnd = (e) => {
	isDragging.value = false;
	const touchY = e.changedTouches[0].clientY;
	const diff = touchY - touchStartY.value;

	if (Math.abs(diff) > 100) {
		if (diff < 0) {
			// Dragged Up
			if (currentState.value === STATES.COLLAPSED) updateState(STATES.HALF);
			else if (currentState.value === STATES.HALF) updateState(STATES.FULL);
		} else {
			// Dragged Down
			if (currentState.value === STATES.FULL) updateState(STATES.HALF);
			else if (currentState.value === STATES.HALF)
				updateState(STATES.COLLAPSED);
		}
	}
};

const updateState = (newState) => {
	currentState.value = newState;
	emit("update:modelValue", newState);
};
</script>
