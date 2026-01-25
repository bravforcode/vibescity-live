<script setup>
/**
 * VibeError.vue
 * A beautiful error state that maintains the premium feel of the app.
 */
import { WifiOff, RefreshCw } from "lucide-vue-next";

defineProps({
  title: { type: String, default: "Connection Interrupted" },
  message: {
    type: String,
    default:
      "We couldn't load the vibe city data. Please check your connection.",
  },
  actionLabel: { type: String, default: "Retry" },
});

const emit = defineEmits(["retry"]);

const handleRetry = () => {
  emit("retry");
};
</script>

<template>
  <div
    class="flex flex-col items-center justify-center w-full h-full p-6 text-center z-50 absolute inset-0 bg-black/80 backdrop-blur-xl"
  >
    <div class="mb-6 relative">
      <div
        class="absolute inset-0 bg-red-500/20 blur-xl rounded-full animate-pulse"
      ></div>
      <WifiOff class="w-16 h-16 text-white/80 relative z-10" />
    </div>

    <h2 class="text-xl font-black text-white uppercase tracking-wider mb-2">
      {{ title }}
    </h2>
    <p class="text-sm text-gray-400 max-w-xs mb-8 leading-relaxed">
      {{ message }}
    </p>

    <button
      @click="handleRetry"
      class="group relative flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-white text-black font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
    >
      <RefreshCw class="w-4 h-4 transition-transform group-hover:rotate-180" />
      <span>{{ actionLabel }}</span>
    </button>
  </div>
</template>
