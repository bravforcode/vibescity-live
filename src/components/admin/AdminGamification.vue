<template>
  <div class="admin-gamification space-y-6 text-slate-200">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-center"
      >
        <span
          class="text-2xl font-bold font-mono text-emerald-400 tabular-nums"
          >{{ summary.totalUsers }}</span
        >
        <span
          class="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1"
          >Total Users</span
        >
      </div>
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-center"
      >
        <span
          class="text-2xl font-bold font-mono text-amber-400 tabular-nums"
          >{{ summary.totalCoins }}</span
        >
        <span
          class="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1"
          >Coins Distributed</span
        >
      </div>
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-center"
      >
        <span class="text-2xl font-bold font-mono text-blue-400 tabular-nums">{{
          summary.avgBalance
        }}</span>
        <span
          class="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1"
          >Avg Balance</span
        >
      </div>
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex flex-col items-center justify-center text-center"
      >
        <span class="text-2xl font-bold font-mono text-rose-400 tabular-nums">{{
          summary.avgStreak
        }}</span>
        <span
          class="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1"
          >Avg Streak</span
        >
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
          <circle cx="12" cy="12" r="10" />
          <path d="m16 10-4 4-4-4" />
        </svg>
        Gamification Leaderboard
      </h3>
      <DataTable
        ref="table"
        :columns="columns"
        :fetch-fn="fetchAndSummarize"
        search-placeholder="Search by visitor ID..."
        default-sort="updated_at"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { adminDataService } from "../../services/adminDataService";
import DataTable from "./DataTable.vue";

const summary = ref({
	totalUsers: 0,
	totalCoins: 0,
	avgBalance: 0,
	avgStreak: 0,
});

const fetchAndSummarize = async (opts) => {
	const result = await adminDataService.getGamificationStats(opts);
	if (result.rows.length) {
		const total = result.total;
		const coins = result.rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
		const streaks = result.rows.reduce(
			(s, r) => s + (Number(r.streak) || 0),
			0,
		);
		summary.value = {
			totalUsers: total.toLocaleString("en-US"),
			totalCoins: coins.toLocaleString("en-US"),
			avgBalance: total
				? Math.round(
						coins / Math.min(total, result.rows.length),
					).toLocaleString("en-US")
				: "0",
			avgStreak: total
				? (streaks / Math.min(total, result.rows.length)).toFixed(1)
				: "0",
		};
	}
	return result;
};

const columns = [
	{ key: "visitor_id", label: "Visitor ID", width: "220px" },
	{ key: "balance", label: "Balance", type: "number", width: "80px" },
	{ key: "streak", label: "Streak", type: "number", width: "70px" },
	{ key: "total_days", label: "Total Days", type: "number", width: "80px" },
	{
		key: "last_checkin_at",
		label: "Last Check-in",
		type: "date",
		width: "150px",
	},
	{ key: "last_spin_at", label: "Last Spin", type: "date", width: "150px" },
	{ key: "created_at", label: "Created", type: "date", width: "150px" },
	{ key: "updated_at", label: "Updated", type: "date", width: "150px" },
];
</script>
