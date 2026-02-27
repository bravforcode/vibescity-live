<script setup>
/**
 * VibeSkeleton.vue
 * A premium skeleton loader with a dark/purple pulse effect.
 */
defineProps({
  width: { type: String, default: "100%" },
  height: { type: String, default: "20px" },
  borderRadius: { type: String, default: "8px" },
  variant: {
    type: String,
    default: "text", // 'text' | 'card' | 'circle'
    validator: (val) => ["text", "card", "circle"].includes(val),
  },
});
</script>

<template>
  <div
    class="vibe-skeleton relative overflow-hidden"
    :class="{
      'rounded-full': variant === 'circle',
      'rounded-xl': variant === 'card' || variant === 'text',
    }"
    :style="{
      width: variant === 'circle' ? height : width,
      height: height,
      borderRadius: variant === 'circle' ? '50%' : borderRadius,
    }"
  >
    <!-- Neon Pulse Core -->
    <div class="absolute inset-0 bg-white/5 animate-pulse-neon"></div>

    <!-- Shimmer Overlay -->
    <div
      class="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-purple-500/10 to-transparent"
    ></div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

@keyframes pulse-neon {
  0%,
  100% {
    opacity: 0.5;
    box-shadow: 0 0 5px rgba(168, 85, 247, 0.1);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 15px rgba(168, 85, 247, 0.3);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite linear;
}

.animate-pulse-neon {
  animation: pulse-neon 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.vibe-skeleton {
  background: rgba(20, 20, 25, 0.6);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
