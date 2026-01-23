<script setup>
/**
 * PullToRefresh.vue - Pull-to-refresh gesture handler
 * Feature #4: Pull-to-Refresh
 */
import { ref, onMounted, onUnmounted } from "vue";

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  threshold: {
    type: Number,
    default: 80,
  },
  isDarkMode: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["refresh"]);

const isPulling = ref(false);
const isRefreshing = ref(false);
const pullDistance = ref(0);
const startY = ref(0);

const handleTouchStart = (e) => {
  if (props.disabled || isRefreshing.value) return;

  // Only trigger if at top of scroll
  const scrollTop = e.currentTarget.scrollTop || 0;
  if (scrollTop > 5) return;

  startY.value = e.touches[0].clientY;
  isPulling.value = true;
};

const handleTouchMove = (e) => {
  if (!isPulling.value || isRefreshing.value) return;

  const currentY = e.touches[0].clientY;
  const diff = currentY - startY.value;

  if (diff > 0) {
    // Apply resistance
    pullDistance.value = Math.min(diff * 0.5, props.threshold * 1.5);
  }
};

const handleTouchEnd = () => {
  if (!isPulling.value) return;

  if (pullDistance.value >= props.threshold) {
    isRefreshing.value = true;
    emit("refresh");

    // Auto-reset after timeout (parent should call reset)
    setTimeout(() => {
      reset();
    }, 3000);
  } else {
    pullDistance.value = 0;
  }

  isPulling.value = false;
};

const reset = () => {
  isRefreshing.value = false;
  pullDistance.value = 0;
  isPulling.value = false;
};

defineExpose({ reset });
</script>

<template>
  <div
    class="pull-to-refresh-container"
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Pull indicator -->
    <div
      class="pull-indicator"
      :class="{ 'is-refreshing': isRefreshing }"
      :style="{
        transform: `translateY(${pullDistance - 60}px)`,
        opacity: Math.min(pullDistance / props.threshold, 1),
      }"
    >
      <div v-if="isRefreshing" class="refresh-spinner" />
      <svg
        v-else
        class="pull-arrow"
        :style="{
          transform: `rotate(${pullDistance >= props.threshold ? 180 : 0}deg)`,
        }"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 5v14M5 12l7-7 7 7" />
      </svg>
      <span class="pull-text">
        {{
          isRefreshing
            ? "Refreshing..."
            : pullDistance >= props.threshold
              ? "Release"
              : "Pull down"
        }}
      </span>
    </div>

    <!-- Content -->
    <div
      class="pull-content"
      :style="{ transform: `translateY(${pullDistance}px)` }"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.pull-to-refresh-container {
  position: relative;
  overflow: hidden;
}

.pull-indicator {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 60px;
  color: rgba(255, 255, 255, 0.6);
  transition: opacity 0.2s;
}

.pull-arrow {
  transition: transform 0.3s ease;
}

.pull-text {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.refresh-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #8b5cf6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pull-content {
  transition: transform 0.2s ease-out;
}

.is-refreshing .pull-content {
  transition: transform 0.3s ease;
}
</style>
