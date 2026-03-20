<template>
  <div>
    <DataTable
      :columns="columns"
      :fetch-fn="adminDataService.getVenues"
      search-placeholder="Search venues by name, category, city..."
      default-sort="created_at"
    >
      <template #controls>
        <button :aria-label="$t('a11y.action')"
          class="px-3 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          :disabled="isFetchingMedia"
          @click="fetchMissingMedia"
        >
          <span v-if="isFetchingMedia">{{ $t("auto.k_3f595aa4") }}</span>
          <span v-else>{{ $t("auto.k_44ee0700") }}</span>
        </button>
      </template>
      <template #filters>
        <select
          v-model="catFilter"
          class="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus:ring-1 focus:ring-blue-500"
          @change="fetchData"
        >
          <option value="">{{ $t("auto.k_ff36a250") }}</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </template>
    </DataTable>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import i18n from "@/i18n.js";
import { supabase } from "../../lib/supabase";
import { adminDataService } from "../../services/adminDataService";
import DataTable from "./DataTable.vue";

const { notifySuccess, notifyError } = useNotifications();
const catFilter = ref("");
const isFetchingMedia = ref(false);

const categories = [
	"RESTAURANT",
	"CAFE",
	"BAR",
	"NIGHTCLUB",
	"HOTEL",
	"SPA",
	"MALL",
	"SPORTS",
	"ENTERTAINMENT",
	"TEMPLE",
	"COWORKING",
	"MARKET",
	"PARK",
	"MUSEUM",
	"OTHER",
];

const columns = [
	{ key: "name", label: "Name", width: "200px" },
	{ key: "category", label: "Category", width: "100px" },
	{ key: "city", label: "City", width: "100px" },
	{ key: "province", label: "Province", width: "100px" },
	{ key: "crowd_level", label: "Crowd", width: "70px" },
	{ key: "avg_rating", label: "Rating", type: "number", width: "70px" },
	{ key: "review_count", label: "Reviews", type: "number", width: "70px" },
	{
		key: "is_giant_active",
		label: "Giant",
		width: "60px",
		render: (v) => (v ? "✅" : ""),
	},
	{
		key: "has_video",
		label: "Video",
		width: "60px",
		render: (v) => (v ? "🎬" : ""),
	},
	{ key: "lat", label: "Lat", type: "number", width: "80px" },
	{ key: "lng", label: "Lng", type: "number", width: "80px" },
	{ key: "created_at", label: "Created", type: "date", width: "140px" },
];

const fetchMissingMedia = async () => {
	if (isFetchingMedia.value) return;
	if (
		!confirm(
			i18n.global.t(
				"admin.trigger_scraper",
				"This will trigger the media scraper edge function to automatically search and fill missing videos/images for up to 10 venues. Continue?",
			),
		)
	)
		return;

	isFetchingMedia.value = true;
	try {
		const { data, error } = await supabase.functions.invoke("media-scraper", {
			body: { limit: 10 },
		});
		if (error) throw error;

		const msg = `Processed ${data?.processed || 0} venues.\nUpdated Photos: ${data?.results?.filter((r) => r.photo === "updated").length || 0}\nUpdated Videos: ${data?.results?.filter((r) => r.video === "updated").length || 0}`;
		notifySuccess(msg, 5000);

		// Refresh page to show new data
		setTimeout(() => {
			window.location.reload();
		}, 1500);
	} catch (e) {
		console.error("Fetch media error:", e);
		notifyError(i18n.global.t("auto.k_31fd7553"));
	} finally {
		isFetchingMedia.value = false;
	}
};
</script>

<style scoped>
.dt-filter {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 6px 8px;
  color: #e0e0e0;
  font-size: 13px;
}
.btn-fetch {
  background: #059669; /* Emerald indicating special AI action */
  border-color: #10b981;
  font-weight: bold;
}
.btn-fetch:hover:not(:disabled) {
  background: #047857;
}
</style>
