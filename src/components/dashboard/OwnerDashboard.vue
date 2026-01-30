<script setup>
import { onMounted, ref } from "vue";
import { useShopStore } from "../../store/shopStore";

const shopStore = useShopStore();
const stats = ref(null);
const isLoading = ref(true);
const isBoosting = ref(false);

const fetchStats = async () => {
  isLoading.value = true;
  try {
    // Hardcoded Shop ID 1 for MVP Demo
    const res = await fetch("http://127.0.0.1:8000/api/v1/owner/stats/1");
    stats.value = await res.json();
  } catch (e) {
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

const toggleBoost = async () => {
  isBoosting.value = true;
  try {
    const res = await fetch(`http://127.0.0.1:8000/api/v1/owner/promote/1`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.status === "success") {
      if (stats.value) stats.value.is_promoted = true;
      // Also update local store to show Giant Pin immediately?
      // Ideally this should trigger a WebSocket event "Shop Promoted"
    }
  } catch (e) {
    console.error(e);
  } finally {
    isBoosting.value = false;
  }
};

onMounted(() => {
  fetchStats();
  // Poll every 5 seconds for live updates (since we don't have a dedicated owner socket yet)
  setInterval(fetchStats, 5000);
});
</script>

<template>
  <div class="owner-dashboard-container p-6 w-full max-w-4xl mx-auto mt-20">
    <!-- Header -->
    <div class="mb-8 flex justify-between items-center">
      <div>
        <h1
          class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600"
        >
          Owner Portal
        </h1>
        <p class="text-white/60">Manage "Cat House Cafe"</p>
      </div>
      <div class="flex gap-2">
        <div
          class="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30 flex items-center gap-1"
        >
          <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
          LIVE
        </div>
      </div>
    </div>

    <!-- Stats Grid -->
    <div v-if="stats" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <!-- Card 1: Live Visitors -->
      <div class="glass-card p-6 rounded-2xl relative overflow-hidden group">
        <div
          class="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-10 -mt-10"
        ></div>
        <h3 class="text-white/60 text-sm font-medium mb-2">Live Visitors</h3>
        <div class="text-4xl font-bold text-white flex items-baseline gap-2">
          {{ stats.live_visitors }}
          <span class="text-sm text-green-400 font-normal">On site now</span>
        </div>
        <div class="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full bg-purple-500 w-[60%]"></div>
        </div>
      </div>

      <!-- Card 2: Total Views -->
      <div class="glass-card p-6 rounded-2xl relative overflow-hidden">
        <h3 class="text-white/60 text-sm font-medium mb-2">Total Page Views</h3>
        <div class="text-4xl font-bold text-white mb-1">
          {{ stats.total_views }}
        </div>
        <div class="text-green-400 text-xs flex items-center gap-1">
          ▲ 12% <span class="text-white/40">vs last week</span>
        </div>
      </div>

      <!-- Card 3: Rating -->
      <div class="glass-card p-6 rounded-2xl relative overflow-hidden">
        <h3 class="text-white/60 text-sm font-medium mb-2">Reputation</h3>
        <div class="text-4xl font-bold text-white flex items-center gap-2">
          {{ stats.rating }} <span class="text-yellow-400 text-2xl">★</span>
        </div>
        <p class="text-white/40 text-xs mt-1">Based on 124 vibes</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="glass-card p-6 rounded-2xl flex items-center justify-between">
      <div>
        <h3 class="text-xl font-bold text-white mb-1">Boost Visibility 🚀</h3>
        <p class="text-white/60 text-sm">
          Activate a Giant 3D Pin on the map to attract 3x more visitors.
        </p>
      </div>
      <button
        @click="toggleBoost"
        :disabled="isBoosting || stats?.is_promoted"
        class="px-6 py-3 rounded-xl font-bold transition-all transform hover:scale-105 active:scale-95"
        :class="
          stats?.is_promoted
            ? 'bg-gray-500/50 text-white/50 cursor-not-allowed'
            : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-purple-500/30'
        "
      >
        {{ stats?.is_promoted ? "Boost Active ✨" : "Activate Boost ($5)" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
