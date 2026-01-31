<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../../lib/supabase";

const router = useRouter();
const loading = ref(true);
const venues = ref([]);
const user = ref(null);
const stats = ref({
	live_visitors: 0,
	total_views: 0,
	rating: 0,
	is_promoted: false,
});

onMounted(async () => {
	// Check Auth
	const {
		data: { user: currentUser },
	} = await supabase.auth.getUser();
	if (!currentUser) {
		alert("Please sign in to access Merchant Portal");
		router.push("/");
		return;
	}
	user.value = currentUser;

	try {
		// Fetch Owned Venues (using user_submissions for MVP claiming logic)
		const { data, error } = await supabase
			.from("user_submissions")
			.select("*")
			.eq("user_id", currentUser.id);

		if (error) throw error;
		venues.value = data || [];

		// Mock Stats Logic (Aggregate from venues later)
		// For MVP, we just sum up some random numbers or use real fields if available
		stats.value = {
			live_visitors: Math.floor(Math.random() * 50) + 10, // Mock real-time
			total_views: venues.value.length * 125, // Mock views based on count
			rating: 4.8, // Default high rating
			is_promoted: false,
		};
	} catch (e) {
		console.error("Error fetching merchant data:", e);
	} finally {
		loading.value = false;
	}
});

const isBoosting = ref(false);
const toggleBoost = async () => {
	isBoosting.value = true;
	// Simulate API call for boost
	setTimeout(() => {
		stats.value.is_promoted = true;
		isBoosting.value = false;
		alert("Boost Activated! Your venue is now highlighted.");
	}, 1500);
};
</script>

<template>
  <div
    class="owner-dashboard-container min-h-screen bg-zinc-950 p-6 w-full pt-20"
  >
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="mb-8 flex justify-between items-center">
        <div>
          <h1
            class="text-3xl font-black uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600"
          >
            Merchant Portal
          </h1>
          <p class="text-zinc-400 text-sm mt-1">
            Manage your venues and view insights
          </p>
        </div>
        <div class="flex gap-3 items-center">
          <button
            @click="router.push('/')"
            class="text-sm font-bold text-zinc-500 hover:text-white transition"
          >
            Exit
          </button>
          <div
            v-if="venues.length > 0"
            class="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30 flex items-center gap-1"
          >
            <span
              class="w-2 h-2 rounded-full bg-green-400 animate-pulse"
            ></span>
            {{ venues.length }} Active
          </div>
        </div>
      </div>

      <div v-if="loading" class="py-20 text-center text-zinc-500 animate-pulse">
        Loading dashboard...
      </div>

      <div v-else>
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <!-- Card 1: Live Visitors -->
          <div
            class="glass-card p-6 rounded-2xl relative overflow-hidden group"
          >
            <div
              class="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-10 -mt-10"
            ></div>
            <h3 class="text-white/60 text-sm font-medium mb-2">
              Live Visitors
            </h3>
            <div
              class="text-4xl font-bold text-white flex items-baseline gap-2"
            >
              {{ stats.live_visitors }}
              <span class="text-sm text-green-400 font-normal"
                >On site now</span
              >
            </div>
            <div class="mt-4 h-1 bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-purple-500 w-[60%]"></div>
            </div>
          </div>

          <!-- Card 2: Total Views -->
          <div class="glass-card p-6 rounded-2xl relative overflow-hidden">
            <h3 class="text-white/60 text-sm font-medium mb-2">
              Total Page Views
            </h3>
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
            <p class="text-white/40 text-xs mt-1">Based on recent activity</p>
          </div>
        </div>

        <!-- Venue List -->
        <h2 class="text-lg font-bold text-white mb-4">Your Venues</h2>
        <div v-if="venues.length > 0" class="grid gap-4 mb-8">
          <div
            v-for="venue in venues"
            :key="venue.id"
            class="p-4 bg-zinc-900/50 backdrop-blur-md rounded-xl border border-white/5 hover:border-purple-500/30 transition flex justify-between items-center group"
          >
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden">
                <img
                  v-if="venue.image_url"
                  :src="venue.image_url"
                  alt="Venue Preview"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-xl"
                >
                  🏢
                </div>
              </div>
              <div>
                <h3
                  class="font-bold text-white group-hover:text-purple-400 transition"
                >
                  {{ venue.shop_name || venue.name }}
                </h3>
                <div class="text-xs text-zinc-500">
                  {{ venue.status }} • {{ venue.category }}
                </div>
              </div>
            </div>
            <div class="flex gap-2">
              <span
                v-if="venue.status === 'PENDING'"
                class="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded"
                >PENDING REVIEW</span
              >
              <button
                class="px-4 py-2 bg-zinc-800 rounded-lg text-xs font-bold hover:bg-zinc-700 text-white"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
        <div
          v-else
          class="text-center py-10 text-zinc-600 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800 mb-8"
        >
          You haven't added any venues yet.
        </div>

        <!-- Actions -->
        <div
          class="glass-card p-6 rounded-2xl flex items-center justify-between"
        >
          <div>
            <h3 class="text-xl font-bold text-white mb-1">
              Boost Visibility 🚀
            </h3>
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
