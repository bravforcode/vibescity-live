<script setup>
import { FilterX, Map as MapIcon, RefreshCw } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

const { t, te } = useI18n();
const tt = (key, fallback) => (te(key) ? t(key) : fallback);

const emit = defineEmits(["reload-map", "reset-filters"]);
</script>

<template>
  <div
    role="alert"
    aria-live="assertive"
    class="relative flex flex-col items-center justify-center w-full h-full min-h-[40vh] p-6 text-center bg-[#09090b]"
  >
    <!-- Subtle animated background -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        class="map-error-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-red-500/10 blur-3xl rounded-full animate-pulse"
      ></div>
    </div>

    <div class="relative z-10 flex flex-col items-center max-w-xs gap-5">
      <!-- Icon -->
      <div
        class="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20"
      >
        <MapIcon
          class="w-8 h-8 text-red-400 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]"
        />
      </div>

      <!-- Text -->
      <div class="space-y-1">
        <h2 class="text-lg font-black text-white">
          {{ tt("error.map_crashed", "Map failed to load") }}
        </h2>
        <p class="text-xs text-zinc-400">
          {{
            tt(
              "error.map_crashed_hint",
              "An unexpected error occurred. Try reloading the map.",
            )
          }}
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col gap-2 w-full">
        <button
          type="button"
          @click="emit('reload-map')"
          class="group flex items-center justify-center gap-2 w-full px-5 py-3 min-h-[44px] bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-white text-sm font-bold transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <RefreshCw
            class="w-4 h-4 transition-transform duration-500 group-hover:rotate-180"
          />
          <span>{{ tt("error.reload_map", "Reload Map") }}</span>
        </button>
        <button
          type="button"
          @click="emit('reset-filters')"
          class="flex items-center justify-center gap-2 w-full px-5 py-3 min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 text-sm font-medium transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <FilterX class="w-4 h-4" />
          <span>{{ tt("error.reset_filters", "Reset Filters") }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .map-error-pulse,
  .group svg {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
}
</style>
