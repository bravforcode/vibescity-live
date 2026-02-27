<script setup>
import { BarChart, Eye, Play, Navigation, TrendingUp } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps({
  shopId: {
    type: [Number, String],
    required: true,
  },
  isDarkMode: {
    type: Boolean,
    default: true,
  },
});

// Mock Data (In production, fetch from Supabase 'venues' table)
const stats = computed(() => ({
  impressions: 1240, // 👁️
  videoPlays: 856, // ▶️
  actions: 142, // 🚀 (Navigate/Ride)
  growth: 12.5, // +12.5% this week
}));

const maxVal =
  Math.max(
    stats.value.impressions,
    stats.value.videoPlays,
    stats.value.actions,
  ) * 1.2;

const getBarHeight = (val) => `${(val / maxVal) * 100}%`;
</script>

<template>
  <div
    class="p-4 rounded-xl border backdrop-blur-md transition-colors"
    :class="
      isDarkMode
        ? 'bg-zinc-900/90 border-zinc-700'
        : 'bg-white/90 border-gray-200'
    "
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h3
        :class="[
          'text-sm font-bold uppercase tracking-wider',
          isDarkMode ? 'text-white' : 'text-gray-900',
        ]"
      >
        Store Insights
      </h3>
      <div class="flex items-center gap-1 text-[10px] font-bold text-green-400">
        <TrendingUp class="w-3 h-3" />
        +{{ stats.growth }}% this week
      </div>
    </div>

    <!-- Chart Grid -->
    <div class="flex items-end justify-between h-32 gap-2 mb-4 px-2">
      <!-- Bar 1: Impressions -->
      <div class="flex flex-col items-center gap-2 w-1/3 group">
        <div
          class="relative w-full bg-zinc-800/50 rounded-t-lg h-full flex items-end overflow-hidden"
        >
          <div
            class="w-full bg-blue-500/80 group-hover:bg-blue-400 transition-all duration-500 ease-out"
            :style="{ height: getBarHeight(stats.impressions) }"
          ></div>
        </div>
        <div
          class="text-[10px] font-bold text-blue-400 flex items-center gap-1"
        >
          <Eye class="w-3 h-3" /> {{ stats.impressions }}
        </div>
      </div>

      <!-- Bar 2: Video Plays -->
      <div class="flex flex-col items-center gap-2 w-1/3 group">
        <div
          class="relative w-full bg-zinc-800/50 rounded-t-lg h-full flex items-end overflow-hidden"
        >
          <div
            class="w-full bg-purple-500/80 group-hover:bg-purple-400 transition-all duration-500 ease-out delay-75"
            :style="{ height: getBarHeight(stats.videoPlays) }"
          ></div>
        </div>
        <div
          class="text-[10px] font-bold text-purple-400 flex items-center gap-1"
        >
          <Play class="w-3 h-3" /> {{ stats.videoPlays }}
        </div>
      </div>

      <!-- Bar 3: Actions -->
      <div class="flex flex-col items-center gap-2 w-1/3 group">
        <div
          class="relative w-full bg-zinc-800/50 rounded-t-lg h-full flex items-end overflow-hidden"
        >
          <div
            class="w-full bg-green-500/80 group-hover:bg-green-400 transition-all duration-500 ease-out delay-150"
            :style="{ height: getBarHeight(stats.actions) }"
          ></div>
        </div>
        <div
          class="text-[10px] font-bold text-green-400 flex items-center gap-1"
        >
          <Navigation class="w-3 h-3" /> {{ stats.actions }}
        </div>
      </div>
    </div>

    <!-- CTA -->
    <button
      class="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white/50 text-[10px] font-semibold border border-white/5 transition-all text-center"
    >
      Upgrade to Pro for detailed analytics
    </button>
  </div>
</template>
