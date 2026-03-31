<template>
  <div class="admin-reviews space-y-6 text-slate-200">
    <!-- Rating Distribution -->
    <div
      class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm max-w-lg"
    >
      <h3
        class="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-slate-700 flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-amber-400"
        >
          <polygon
            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
          />
        </svg>
        Rating Distribution
      </h3>
      <div class="flex flex-col gap-2.5">
        <div
          v-for="star in [5, 4, 3, 2, 1]"
          :key="star"
          class="flex items-center gap-3"
        >
          <span class="w-8 text-right text-xs font-semibold text-slate-400"
            >{{ star }} <span class="text-amber-400">★</span></span
          >
          <div
            class="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/50"
          >
            <div
              class="h-full bg-amber-400 rounded-full transition-[width] duration-500 ease-out"
              :style="{ width: ratingWidth(star) }"
            />
          </div>
          <span class="w-10 text-right text-xs text-slate-500 tabular-nums">{{
            ratingDist[star] || 0
          }}</span>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm">
      <h3
        class="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-slate-700 flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-slate-400"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        Venue Reviews
      </h3>
      <DataTable
        :columns="columns"
        :fetch-fn="adminDataService.getReviews"
        search-placeholder="Search reviews by comment, venue..."
        default-sort="created_at"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { adminDataService } from "../../services/adminDataService";
import DataTable from "./DataTable.vue";

const ratingDist = ref({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
const maxRating = computed(() =>
	Math.max(1, ...Object.values(ratingDist.value)),
);
const ratingWidth = (star) =>
	`${(ratingDist.value[star] / maxRating.value) * 100}%`;

onMounted(async () => {
	try {
		ratingDist.value = await adminDataService.getReviewRatingDistribution();
	} catch (e) {
		console.error(e);
	}
});

const columns = [
	{ key: "id", label: "Review ID", width: "100px" },
	{ key: "venue_id", label: "Venue", width: "130px" },
	{ key: "user_id", label: "User", width: "130px" },
	{ key: "visitor_id", label: "Visitor", width: "130px" },
	{
		key: "rating",
		label: "Rating",
		type: "number",
		width: "100px",
		render: (v) => {
			const r = Number(v) || 0;
			return `<span class="text-amber-400 font-serif tracking-widest">${"★".repeat(r)}<span class="text-slate-600">${"★".repeat(5 - r)}</span></span>`;
		},
	},
	{
		key: "comment",
		label: "Comment",
		width: "300px",
		class: "whitespace-normal text-xs",
	},
	{ key: "created_at", label: "Date", type: "date", width: "140px" },
];
</script>
