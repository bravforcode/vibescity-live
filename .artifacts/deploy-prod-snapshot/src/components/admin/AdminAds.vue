<template>
  <div class="admin-ads space-y-8 text-slate-200">
    <!-- Active Campaigns Table -->
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
          class="text-blue-500"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        Local Ad Campaigns
      </h3>
      <DataTable
        :columns="adColumns"
        :fetch-fn="adminDataService.getLocalAds"
        search-placeholder="Search ads by title, venue..."
        default-sort="created_at"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Ad Impressions Table -->
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
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
            class="text-emerald-500"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Ad Impressions
        </h3>
        <DataTable
          :columns="impressionColumns"
          :fetch-fn="adminDataService.getAdImpressions"
          search-placeholder="Search by ad ID, visitor..."
          default-sort="created_at"
        />
      </div>

      <!-- Ad Clicks Table -->
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
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
            class="text-amber-500"
          >
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path
              d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"
            />
            <path d="m21 3-6 5" />
            <path d="m9 12 .33.33a2 2 0 0 0 2.83 0L13 11" />
            <path d="m3 3 18 18" />
          </svg>
          Ad Clicks
        </h3>
        <DataTable
          :columns="clickColumns"
          :fetch-fn="adminDataService.getAdClicks"
          search-placeholder="Search by ad ID, visitor..."
          default-sort="created_at"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { adminDataService } from "../../services/adminDataService";
import DataTable from "./DataTable.vue";

const adColumns = [
	{ key: "id", label: "Ad ID", width: "120px" },
	{ key: "title", label: "Title", width: "200px" },
	{ key: "venue_id", label: "Venue", width: "130px" },
	{
		key: "ad_type",
		label: "Type",
		width: "100px",
		render: (v) =>
			`<span class="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">${v}</span>`,
	},
	{
		key: "status",
		label: "Status",
		width: "100px",
		render: (v) => {
			const isAct = v === "active";
			return `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center justify-center border ${isAct ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-700/50 text-slate-300 border-slate-600"}">${(v || "").toUpperCase()}</span>`;
		},
	},
	{ key: "budget", label: "Budget", type: "currency", width: "100px" },
	{ key: "start_date", label: "Start", type: "date", width: "130px" },
	{ key: "end_date", label: "End", type: "date", width: "130px" },
	{ key: "created_at", label: "Created", type: "date", width: "130px" },
];

const impressionColumns = [
	{ key: "id", label: "ID", width: "80px" },
	{ key: "ad_id", label: "Ad ID", width: "110px" },
	{ key: "venue_id", label: "Venue", width: "110px" },
	{ key: "visitor_id", label: "Visitor", width: "130px" },
	{ key: "session_id", label: "Session", width: "110px" },
	{ key: "created_at", label: "Time", type: "date", width: "130px" },
];

const clickColumns = [
	{ key: "id", label: "ID", width: "80px" },
	{ key: "ad_id", label: "Ad ID", width: "110px" },
	{ key: "venue_id", label: "Venue", width: "110px" },
	{ key: "visitor_id", label: "Visitor", width: "130px" },
	{ key: "session_id", label: "Session", width: "110px" },
	{ key: "created_at", label: "Time", type: "date", width: "130px" },
];
</script>
