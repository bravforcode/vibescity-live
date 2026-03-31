<script setup>
import {
	BarChart3,
	ChevronLeft,
	Edit3,
	Eye,
	MapPin,
	RefreshCw,
	Rocket,
	Star,
	TrendingUp,
	Users,
} from "lucide-vue-next";
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
const editingVenue = ref(null);
const activeTab = ref("overview");

const tabs = [
	{ id: "overview", label: "Overview", icon: BarChart3 },
	{ id: "venues", label: "My Venues", icon: MapPin },
];

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
		const vid = localStorage.getItem("vibe_visitor_id");
		if (!vid) {
			notifyError("No Visitor ID found. Please browse the map first.");
			router.push("/");
			return;
		}
		visitorId.value = vid;

		const { data: ownedVenues, error } = await supabase
			.from("venues")
			.select("*")
			.eq("owner_visitor_id", vid);

		if (error) throw error;
		venues.value = ownedVenues || [];

		let totalLive = 0;
		let totalViews = 0;

		// Fetch all venue stats in parallel (was sequential N+1)
		const statsResults = await Promise.all(
			venues.value.map((venue) =>
				supabase.rpc("get_venue_stats", { p_shop_id: venue.id }),
			),
		);
		statsResults.forEach(({ data: stat }, i) => {
			if (stat) {
				totalLive += stat.live_visitors ?? 0;
				totalViews += stat.total_views ?? 0;
				venues.value[i].stats = stat;
			}
		});

		stats.value = {
			live_visitors: totalLive,
			total_views: totalViews,
			rating: 5.0,
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
  <div class="relative z-50 isolate min-h-screen overflow-x-hidden w-full bg-zinc-950 text-white">

    <!-- Top Bar -->
    <div class="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center gap-3">
      <button
        @click="safeExit"
        class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/14 active:scale-95 transition-all"
        aria-label="Exit dashboard"
      >
        <ChevronLeft class="w-5 h-5 text-white/70" />
      </button>
      <div class="flex-1">
        <h1 class="text-base font-black text-white tracking-tight">Merchant Portal</h1>
        <p class="text-xs text-white/40">{{ venues.length }} venue{{ venues.length !== 1 ? 's' : '' }} managed</p>
      </div>
      <button
        @click="fetchDashboardData"
        :disabled="loading"
        class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/14 active:scale-95 transition-all disabled:opacity-40"
        aria-label="Refresh data"
      >
        <RefreshCw class="w-4 h-4 text-white/70" :class="loading ? 'animate-spin' : ''" />
      </button>
    </div>

    <!-- Tab Bar -->
    <div class="relative z-10 pointer-events-auto flex gap-1 px-4 pt-4 pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        style="touch-action: manipulation"
        class="touch-manipulation select-none flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
        :class="activeTab === tab.id
          ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
          : 'text-white/40 hover:text-white/70 hover:bg-white/5'"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <div class="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="text-sm text-white/40">Loading your dashboard...</p>
    </div>

    <!-- Error -->
    <div
      v-else-if="dashboardError"
      class="m-4 p-5 rounded-2xl border border-red-500/30 bg-red-500/10 text-center space-y-4"
    >
      <div class="text-red-300 font-bold">Something went wrong</div>
      <div class="text-sm text-red-200/70">{{ dashboardError }}</div>
      <div class="flex justify-center gap-3">
        <button
          @click="fetchDashboardData"
          class="px-5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/30 text-red-100 font-bold text-sm active:scale-95 transition-all"
        >
          Try Again
        </button>
        <button
          @click="safeExit"
          class="px-5 py-2.5 rounded-xl bg-white/8 border border-white/15 text-white font-bold text-sm active:scale-95 transition-all"
        >
          Exit
        </button>
      </div>
    </div>

    <div v-else class="pb-10">

      <!-- ── OVERVIEW TAB ── -->
      <div v-if="activeTab === 'overview'" class="px-4 space-y-4 pt-2">

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-3">
          <!-- Live Visitors -->
          <div class="min-w-0 stat-card p-4 rounded-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 w-20 h-20 bg-green-500/15 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
            <div class="flex items-center gap-2 mb-2">
              <div class="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Users class="w-3.5 h-3.5 text-green-400" />
              </div>
              <span class="text-xs text-white/50 font-medium">Live Now</span>
            </div>
            <div class="text-3xl font-black text-white">{{ stats.live_visitors }}</div>
            <div class="flex items-center gap-1 mt-1">
              <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
              <span class="text-[11px] text-green-400 font-medium">On site</span>
            </div>
          </div>

          <!-- Total Views -->
          <div class="min-w-0 stat-card p-4 rounded-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 w-20 h-20 bg-violet-500/15 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
            <div class="flex items-center gap-2 mb-2">
              <div class="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Eye class="w-3.5 h-3.5 text-violet-400" />
              </div>
              <span class="text-xs text-white/50 font-medium">Page Views</span>
            </div>
            <div class="text-3xl font-black text-white">{{ stats.total_views.toLocaleString() }}</div>
            <div class="flex items-center gap-1 mt-1">
              <TrendingUp class="w-3 h-3 text-violet-400" />
              <span class="text-[11px] text-white/40">All time</span>
            </div>
          </div>

          <!-- Rating -->
          <div class="min-w-0 stat-card p-4 rounded-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 w-20 h-20 bg-yellow-500/15 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
            <div class="flex items-center gap-2 mb-2">
              <div class="w-7 h-7 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <Star class="w-3.5 h-3.5 text-yellow-400" />
              </div>
              <span class="text-xs text-white/50 font-medium">Reputation</span>
            </div>
            <div class="text-3xl font-black text-white flex items-baseline gap-1">
              {{ stats.rating }}<span class="text-base text-yellow-400">★</span>
            </div>
            <div class="text-[11px] text-white/40 mt-1">Community score</div>
          </div>

          <!-- Venues Count -->
          <div class="min-w-0 stat-card p-4 rounded-2xl relative overflow-hidden">
            <div class="absolute top-0 right-0 w-20 h-20 bg-blue-500/15 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none"></div>
            <div class="flex items-center gap-2 mb-2">
              <div class="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <MapPin class="w-3.5 h-3.5 text-blue-400" />
              </div>
              <span class="text-xs text-white/50 font-medium">Venues</span>
            </div>
            <div class="text-3xl font-black text-white">{{ venues.length }}</div>
            <div class="text-[11px] text-white/40 mt-1">Listed on map</div>
          </div>
        </div>

        <!-- Quick Promote CTA -->
        <div
          v-if="venues.length > 0"
          class="p-4 rounded-2xl bg-gradient-to-r from-violet-900/50 to-fuchsia-900/50 border border-violet-500/25"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-black text-white mb-0.5">Boost Visibility</div>
              <div class="text-xs text-violet-300">Get 10x more visitors with a Promoted Pin</div>
            </div>
            <button
              @click="openPromote(venues[0])"
              class="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-black active:scale-95 transition-all shadow-lg shadow-violet-500/30 flex items-center gap-1.5"
            >
              <Rocket class="w-3.5 h-3.5" />
              Boost
            </button>
          </div>
        </div>
      </div>

      <!-- ── VENUES TAB ── -->
      <div v-if="activeTab === 'venues'" class="px-4 pt-2 space-y-3">

        <!-- Empty state -->
        <div
          v-if="venues.length === 0"
          class="py-16 text-center rounded-2xl border border-dashed border-white/10 bg-white/2"
        >
          <MapPin class="w-10 h-10 text-white/20 mx-auto mb-3" />
          <div class="text-sm font-bold text-white/40 mb-1">No venues yet</div>
          <div class="text-xs text-white/25">Add your first venue to get started</div>
        </div>

        <!-- Venue cards -->
        <div
          v-for="venue in venues"
          :key="venue.id"
          class="min-w-0 venue-card p-4 rounded-2xl border border-white/6 hover:border-violet-500/30 transition-all group"
        >
          <div class="flex items-center gap-3">
            <!-- Image -->
            <div class="w-14 h-14 rounded-xl bg-zinc-800 overflow-hidden shrink-0">
              <img
                v-if="venue.image_url || venue.Image_URL1"
                :src="venue.image_url || venue.Image_URL1"
                alt="Venue"
                class="w-full h-full object-cover"
                loading="lazy"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-2xl">🏢</div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="font-black text-white text-sm truncate group-hover:text-violet-300 transition-colors">
                {{ venue.shop_name || venue.name }}
              </h3>
              <div class="text-xs text-white/40 mt-0.5">{{ venue.category }}</div>
              <div class="flex items-center gap-2 mt-1.5">
                <span
                  :class="[
                    'text-[10px] px-2 py-0.5 rounded-full font-bold',
                    venue.status === 'LIVE' ? 'bg-green-500/20 text-green-400'
                    : venue.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-white/10 text-white/50'
                  ]"
                >
                  {{ venue.status || 'ACTIVE' }}
                </span>
                <span v-if="venue.stats?.live_visitors" class="text-[10px] text-white/30 flex items-center gap-1">
                  <span class="w-1 h-1 rounded-full bg-green-400 animate-pulse"></span>
                  {{ venue.stats.live_visitors }} live
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-2 shrink-0">
              <button
                @click="openPromote(venue)"
                class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold active:scale-95 transition-all shadow-md shadow-violet-500/20 flex items-center gap-1"
              >
                <Rocket class="w-3 h-3" />
                Boost
              </button>
              <button
                @click="openEdit(venue)"
                class="px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/14 text-white text-xs font-bold active:scale-95 transition-all flex items-center gap-1"
              >
                <Edit3 class="w-3 h-3" />
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Buy Pins Modal -->
    <div
      v-if="promotingVenue"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      @click.self="closePromote"
    >
      <div class="w-full max-h-[92dvh] sm:max-h-[90dvh] overflow-y-auto max-w-5xl relative animate-fade-in rounded-t-3xl sm:rounded-3xl sm:m-4">
        <div class="sticky top-0 z-10 flex justify-end px-4 pt-3 pb-1 bg-gradient-to-b from-gray-900/90 to-transparent">
          <button
            @click="closePromote"
            class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs font-black flex items-center justify-center transition-all active:scale-90"
            aria-label="Close"
          >✕</button>
        </div>
        <BuyPinsPanel :shop-id="promotingVenue.id" />
      </div>
    </div>

    <!-- Edit Venue Modal -->
    <EditVenueModal
      v-if="editingVenue"
      :venue="editingVenue"
      @close="closeEdit"
    />
  </div>
</template>

<style scoped>
.stat-card {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.venue-card {
  background: rgba(255, 255, 255, 0.03);
}

.bg-white\/2 { background: rgba(255,255,255,0.02); }
.bg-white\/8 { background: rgba(255,255,255,0.08); }
.bg-white\/14 { background: rgba(255,255,255,0.14); }
.border-white\/6 { border-color: rgba(255,255,255,0.06); }
.border-white\/8 { border-color: rgba(255,255,255,0.08); }
.border-white\/15 { border-color: rgba(255,255,255,0.15); }
</style>
