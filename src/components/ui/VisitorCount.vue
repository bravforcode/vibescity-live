<script setup>
/**
 * VisitorCount.vue - Real-time visitor count display
 * Feature #36: Real-time Visitor Count UI
 */
import { ref, onMounted, onUnmounted } from "vue";

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
});

const visitorCount = ref(props.initialCount);
const trend = ref("stable"); // 'up', 'down', 'stable'
let interval = null;

// Simulate real-time updates (would be WebSocket in production)
onMounted(() => {
  // Random initial count based on shop ID
  visitorCount.value = props.initialCount || Math.floor(Math.random() * 50) + 5;

  interval = setInterval(() => {
    const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
    const newCount = Math.max(0, visitorCount.value + change);

    if (newCount > visitorCount.value) trend.value = "up";
    else if (newCount < visitorCount.value) trend.value = "down";
    else trend.value = "stable";

    visitorCount.value = newCount;
  }, 5000);
});

onUnmounted(() => {
  if (interval) clearInterval(interval);
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
    <span :class="['font-bold', isDarkMode ? 'text-white' : 'text-gray-900']">
      {{ visitorCount }}
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
