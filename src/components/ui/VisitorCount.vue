<script setup>
/**
 * VisitorCount.vue - Real-time visitor count display
 * Feature #36: Real-time Visitor Count UI
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useAnimatedCounter } from "../../composables/useAnimatedCounter";

const props = defineProps({
	shopId: {
		type: [String, Number],
		required: true,
	},
	isDarkMode: {
		type: Boolean,
		default: true,
	},
	initialCount: {
		type: Number,
		default: 0,
	},
	liveCount: {
		type: Number,
		default: null,
	},
});

const visitorCount = ref(props.initialCount);
const trend = ref("stable"); // 'up', 'down', 'stable'
const interval = null;

import { useRoomStore } from "../../store/roomStore";

const roomStore = useRoomStore();

// Watch for live updates from store
watch(
	() => roomStore.getCount(props.shopId),
	(newVal, oldVal) => {
		if (newVal !== undefined) {
			if (newVal > (oldVal || visitorCount.value)) trend.value = "up";
			else if (newVal < (oldVal || visitorCount.value)) trend.value = "down";
			else trend.value = "stable";
			visitorCount.value = newVal;
		}
	},
	{ immediate: true },
);

// Simulate real-time updates (would be WebSocket in production)
onMounted(() => {
	// If live count provided via props, use it (override)
	if (props.liveCount !== null) {
		visitorCount.value = props.liveCount;
		return;
	}

	// Initial load from store
	visitorCount.value = roomStore.getCount(props.shopId);
});

onUnmounted(() => {
	// Cleanup if needed
});

const getTrendIcon = () => {
	if (trend.value === "up") return "↑";
	if (trend.value === "down") return "↓";
	return "•";
};

const getTrendColor = () => {
	if (trend.value === "up") return "text-green-400";
	if (trend.value === "down") return "text-red-400";
	return "text-gray-400";
};

const getCrowdLevel = () => {
	if (visitorCount.value > 40) return { label: "Packed", color: "bg-red-500" };
	if (visitorCount.value > 25) return { label: "Busy", color: "bg-orange-500" };
	if (visitorCount.value > 10)
		return { label: "Moderate", color: "bg-yellow-500" };
	return { label: "Quiet", color: "bg-green-500" };
};

// Animated counter for smooth digit roll-up
const { displayValue: animatedCount } = useAnimatedCounter(
	computed(() => visitorCount.value),
	{ duration: 800 },
);
</script>

<template>
  <div
    :class="[
      'visitor-count flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
      isDarkMode ? 'bg-zinc-800' : 'bg-gray-100',
    ]"
  >
    <!-- Animated dot -->
    <div class="relative">
      <div :class="['w-2 h-2 rounded-full', getCrowdLevel().color]" />
      <div
        :class="[
          'absolute inset-0 w-2 h-2 rounded-full animate-ping',
          getCrowdLevel().color,
        ]"
        style="animation-duration: 2s"
      />
    </div>

    <!-- Count -->
    <span
      :class="[
        'font-bold tabular-nums',
        isDarkMode ? 'text-white' : 'text-gray-900',
      ]"
    >
      {{ animatedCount }}
    </span>

    <!-- Trend -->
    <span :class="['text-xs font-bold', getTrendColor()]">
      {{ getTrendIcon() }}
    </span>

    <!-- Label -->
    <span :class="['text-xs', isDarkMode ? 'text-white/50' : 'text-gray-500']">
      {{ getCrowdLevel().label }}
    </span>
  </div>
</template>

<style scoped>
.visitor-count {
  backdrop-filter: blur(8px);
}
</style>
