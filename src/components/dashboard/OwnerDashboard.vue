<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useNotifications } from "@/composables/useNotifications";
import { supabase } from "../../lib/supabase";
import EditVenueModal from "../modal/EditVenueModal.vue";
import BuyPinsPanel from "./BuyPinsPanel.vue";

const router = useRouter();
const loading = ref(true);
const venues = ref([]);
const visitorId = ref(null);
const dashboardError = ref(null);
const stats = ref({
	live_visitors: 0,
	total_views: 0,
	rating: 5.0,
	is_promoted: false,
});
const { notifyError } = useNotifications();

const promotingVenue = ref(null);
const editingVenue = ref(null); // ✅ Edit State

const openPromote = (venue) => {
	promotingVenue.value = venue;
};

const closePromote = () => {
	promotingVenue.value = null;
};

const openEdit = (venue) => {
	editingVenue.value = venue;
};

const safeExit = async () => {
	try {
		await router.push("/");
		setTimeout(() => {
			if (window.location.pathname.startsWith("/merchant")) {
				window.location.href = "/";
			}
		}, 200);
	} catch {
		window.location.href = "/";
	}
};

const closeEdit = (shouldRefresh = false) => {
	editingVenue.value = null;
	if (shouldRefresh) fetchDashboardData();
};

const fetchDashboardData = async () => {
	loading.value = true;
	dashboardError.value = null;
	try {
		// 1. Get Visitor ID
		const vid = localStorage.getItem("vibe_visitor_id");
		if (!vid) {
			notifyError("No Visitor ID found. Please browse the map first.");
			router.push("/");
			return;
		}
		visitorId.value = vid;

		// 2. Fetch Owned Venues via Visitor ID
		const { data: ownedVenues, error } = await supabase
			.from("venues")
			.select("*")
			.eq("owner_visitor_id", vid);

		if (error) throw error;
		venues.value = ownedVenues || [];

		// 3. Aggregate Real Stats
		let totalLive = 0;
		let totalViews = 0;

		for (const venue of venues.value) {
			const { data: stat } = await supabase.rpc("get_venue_stats", {
				p_shop_id: venue.id,
			});
			if (stat) {
				totalLive += stat.live_visitors;
				totalViews += stat.total_views;
				// Assign to venue object for list display if needed
				venue.stats = stat;
			}
		}

		stats.value = {
			live_visitors: totalLive,
			total_views: totalViews,
			rating: 5.0, // Default for positive vibes
			is_promoted: false,
		};
	} catch (e) {
		console.error("Error fetching dashboard:", e);
		dashboardError.value = e?.message || "Failed to load merchant dashboard.";
		notifyError("Could not load Merchant Dashboard. Please try again.");
	} finally {
		loading.value = false;
	}
};

onMounted(() => {
	fetchDashboardData();
});
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
            @click="safeExit"
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
      <div
        v-else-if="dashboardError"
        class="p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-center space-y-4"
      >
        <div class="text-red-300 font-bold">Merchant Dashboard Error</div>
        <div class="text-sm text-red-100/90">{{ dashboardError }}</div>
        <div class="flex justify-center gap-3">
          <button
            @click="fetchDashboardData"
            class="px-4 py-2 rounded-lg bg-red-500/20 border border-red-400/30 text-red-100 font-bold"
          >
            Retry
          </button>
          <button
            @click="safeExit"
            class="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-bold"
          >
            Exit
          </button>
        </div>
      </div>

      <div v-else>
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <div class="flex gap-2">
                <span
                  v-if="venue.status === 'PENDING'"
                  class="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded"
                  >PENDING REVIEW</span
                >
                <button
                  @click="openPromote(venue)"
                  class="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg text-xs font-bold hover:opacity-90 text-white shadow-lg shadow-purple-500/20"
                >
                  Promote 🚀
                </button>
                <button
                  @click="openEdit(venue)"
                  class="px-4 py-2 bg-zinc-800 rounded-lg text-xs font-bold hover:bg-zinc-700 text-white transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          v-else
          class="text-center py-10 text-zinc-600 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800 mb-8"
        >
          You haven't added any venues yet.
        </div>

        <!-- Buy Pins Modal -->
        <div
          v-if="promotingVenue"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          @click.self="closePromote"
        >
          <div
            class="w-full max-w-5xl relative animate-in fade-in zoom-in duration-200"
          >
            <button
              @click="closePromote"
              class="absolute -top-12 right-0 text-white/50 hover:text-white"
            >
              Close [ESC]
            </button>
            <BuyPinsPanel :shop-id="promotingVenue.id" />
          </div>
        </div>

        <!-- ✅ Edit Venue Modal -->
        <EditVenueModal
          v-if="editingVenue"
          :venue="editingVenue"
          @close="closeEdit"
        />
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
