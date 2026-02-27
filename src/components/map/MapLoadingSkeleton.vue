<script setup>
import { Map as MapIcon } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div
    class="relative w-full h-full z-0 bg-[#09090b] flex items-center justify-center overflow-hidden"
    role="status"
    aria-live="polite"
    aria-busy="true"
    :aria-label="t('map.loading')"
  >
    <!-- Road grid skeleton lines -->
    <div
      class="skeleton-road skeleton-road--h"
      style="top: 30%; animation-delay: 0s"
    ></div>
    <div
      class="skeleton-road skeleton-road--h"
      style="top: 55%; animation-delay: 0.15s"
    ></div>
    <div
      class="skeleton-road skeleton-road--h"
      style="top: 78%; animation-delay: 0.3s"
    ></div>
    <div
      class="skeleton-road skeleton-road--v"
      style="left: 25%; animation-delay: 0.1s"
    ></div>
    <div
      class="skeleton-road skeleton-road--v"
      style="left: 50%; animation-delay: 0.25s"
    ></div>
    <div
      class="skeleton-road skeleton-road--v"
      style="left: 75%; animation-delay: 0.4s"
    ></div>

    <!-- Floating pin placeholders -->
    <div
      class="absolute top-[22%] left-[30%] skeleton-pin"
      style="animation-delay: 0.2s"
    ></div>
    <div
      class="absolute top-[45%] left-[60%] skeleton-pin"
      style="animation-delay: 0.4s"
    ></div>
    <div
      class="absolute top-[65%] left-[40%] skeleton-pin"
      style="animation-delay: 0.6s"
    ></div>

    <!-- Center loader -->
    <div class="relative z-10 flex flex-col items-center gap-3">
      <div
        class="skeleton-center-icon w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse"
        aria-hidden="true"
      >
        <MapIcon class="w-6 h-6 text-purple-400/70" />
      </div>
      <div class="text-xs text-white/40 font-medium tracking-wider uppercase" aria-hidden="true">
        {{ t('map.loading') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-road {
  position: absolute;
  background: rgba(255, 255, 255, 0.04);
  animation: skeleton-shimmer 2s ease-in-out infinite;
}
.skeleton-road--h {
  left: 0;
  right: 0;
  height: 2px;
}
.skeleton-road--v {
  top: 0;
  bottom: 0;
  width: 2px;
}
.skeleton-pin {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(168, 85, 247, 0.2);
  animation: skeleton-pin-pulse 1.8s ease-in-out infinite;
}
@keyframes skeleton-shimmer {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.8;
  }
}
@keyframes skeleton-pin-pulse {
  0%,
  100% {
    transform: scale(0.8);
    opacity: 0.3;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.7;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-road,
  .skeleton-pin,
  .skeleton-center-icon {
    animation: none;
    opacity: 0.4;
  }
}
</style>
