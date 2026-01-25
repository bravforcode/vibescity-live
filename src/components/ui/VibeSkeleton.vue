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
    class="vibe-skeleton relative overflow-hidden bg-white/5"
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
    <!-- Shimmer Effect -->
    <div
      class="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
    ></div>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite;
}

.vibe-skeleton {
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
