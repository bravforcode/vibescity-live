<template>
  <div class="admin-orders space-y-6 text-slate-200">
    <!-- Top KPIs -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <span
            class="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >Total Revenue</span
          >
          <div class="p-2 bg-emerald-500/10 rounded-lg">
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
              <line x1="12" x2="12" y1="2" y2="22" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
        </div>
        <span class="text-2xl font-bold font-mono text-slate-100 tabular-nums"
          >฿{{ formatNumber(totalRevenue) }}</span
        >
      </div>
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <span
            class="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >Paid Orders</span
          >
          <div class="p-2 bg-blue-500/10 rounded-lg">
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
                d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"
              />
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
              <path d="M2 7h20" />
              <path
                d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"
              />
            </svg>
          </div>
        </div>
        <span class="text-2xl font-bold font-mono text-blue-400 tabular-nums">{{
          statusCounts.paid || 0
        }}</span>
      </div>
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <span
            class="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >Pending</span
          >
          <div class="p-2 bg-amber-500/10 rounded-lg">
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>
        <span
          class="text-2xl font-bold font-mono text-amber-400 tabular-nums"
          >{{ statusCounts.pending || 0 }}</span
        >
      </div>
      <div
        class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <span
            class="text-xs font-semibold text-slate-500 uppercase tracking-wider"
            >Rejected</span
          >
          <div class="p-2 bg-rose-500/10 rounded-lg">
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
              class="text-rose-500"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" x2="9" y1="9" y2="15" />
              <line x1="9" x2="15" y1="9" y2="15" />
            </svg>
          </div>
        </div>
        <span class="text-2xl font-bold font-mono text-rose-400 tabular-nums">{{
          statusCounts.rejected || 0
        }}</span>
      </div>
    </div>

    <!-- Revenue Trend Chart -->
    <div
      class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm mb-6"
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
          class="text-blue-500"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        Daily Revenue Trend
      </h3>
      <div v-if="loadingChart" class="h-64 flex items-center justify-center">
        <svg
          class="animate-spin h-6 w-6 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
      <div v-else class="h-64 relative w-full pt-2">
        <LineChart
          v-if="trendChartData"
          :data="trendChartData"
          :options="chartOptions"
        />
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm"
        >
          No revenue data available
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div
      class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex flex-col gap-4"
    >
      <h3
        class="text-sm font-semibold text-slate-300 border-b border-slate-700 pb-2 mb-2 flex items-center gap-2"
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
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <line x1="3" x2="21" y1="9" y2="9" />
          <line x1="9" x2="9" y1="21" y2="9" />
        </svg>
        Order Transactions Log
      </h3>
      <DataTable
        :columns="columns"
        :fetch-fn="adminDataService.getOrders"
        :extra-filters="activeFilters"
        search-placeholder="Search by SKU, venue ID..."
        default-sort="created_at"
      >
        <template #filters>
          <select
            v-model="statusFilter"
            class="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            @change="updateFilters"
          >
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="pending_review">Pending Review</option>
          </select>
        </template>
      </DataTable>
    </div>
  </div>
</template>

<script setup>
import {
	CategoryScale,
	Chart as ChartJS,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
} from "chart.js";
import { computed, onMounted, ref } from "vue";
import { Line as LineChart } from "vue-chartjs";
import { adminDataService } from "../../services/adminDataService";
import DataTable from "./DataTable.vue";

ChartJS.register(
	CategoryScale,
	LinearScale,
	LineElement,
	PointElement,
	Title,
	Tooltip,
	Legend,
);

const statusFilter = ref("");
const activeFilters = ref({});
const statusCounts = ref({});
const trendData = ref([]);
const loadingChart = ref(false);

const updateFilters = () => {
	activeFilters.value = statusFilter.value
		? { status: statusFilter.value }
		: {};
};

const formatNumber = (val) => {
	const n = Number(val);
	return Number.isNaN(n) ? (val ?? "0") : n.toLocaleString("en-US");
};

const totalRevenue = computed(() => {
	return trendData.value.reduce(
		(sum, item) => sum + (Number(item.amount) || 0),
		0,
	);
});

const loadDashboardData = async () => {
	loadingChart.value = true;
	try {
		const [counts, trends] = await Promise.all([
			adminDataService.getOrderStatusBreakdown(),
			adminDataService.getOrderRevenueTrend(),
		]);
		statusCounts.value = counts || {};
		trendData.value = trends || [];
	} catch (err) {
		console.error("Failed loading order dashboard data:", err);
	} finally {
		loadingChart.value = false;
	}
};

onMounted(loadDashboardData);

// -- Trend Chart Configuration --
const trendChartData = computed(() => {
	if (!trendData.value || trendData.value.length === 0) return null;
	return {
		labels: trendData.value.map((item) => item.date),
		datasets: [
			{
				label: "Daily Revenue (฿)",
				backgroundColor: "rgba(59, 130, 246, 0.1)", // blue-500 transparent
				borderColor: "#3b82f6", // blue-500
				pointBackgroundColor: "#1e293b",
				pointBorderColor: "#3b82f6",
				pointHoverBackgroundColor: "#3b82f6",
				pointHoverBorderColor: "#fff",
				pointRadius: 4,
				pointHoverRadius: 6,
				borderWidth: 2,
				fill: true,
				tension: 0.3, // smooth curves
				data: trendData.value.map((item) => item.amount),
			},
		],
	};
});

const chartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: {
		legend: { display: false },
		tooltip: {
			backgroundColor: "rgba(15, 23, 42, 0.9)",
			titleColor: "#f1f5f9",
			bodyColor: "#cbd5e1",
			borderColor: "#334155",
			borderWidth: 1,
			padding: 10,
			callbacks: {
				label: (context) => `฿ ${context.raw.toLocaleString("en-US")}`,
			},
		},
	},
	scales: {
		y: {
			beginAtZero: true,
			grid: { color: "#334155", tickColor: "transparent" },
			ticks: {
				color: "#94a3b8",
				callback: (value) => `฿${value >= 1000 ? value / 1000 + "k" : value}`,
			},
			border: { display: false },
		},
		x: {
			grid: { display: false },
			ticks: { color: "#94a3b8" },
			border: { display: false },
		},
	},
	interaction: {
		mode: "index",
		intersect: false,
	},
};

const columns = [
	{ key: "id", label: "Order ID", width: "120px" },
	{ key: "sku", label: "SKU", width: "100px" },
	{
		key: "status",
		label: "Status",
		width: "120px",
		render: (v) => {
			const styles = {
				paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
				pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
				rejected: "bg-rose-500/10 text-rose-400 border-rose-500/20",
				pending_review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
			};
			const styleCss =
				styles[v] || "bg-slate-700/50 text-slate-300 border-slate-600";
			const label = (v || "Unknown").replace("_", " ").toUpperCase();
			return `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider inline-flex items-center justify-center border ${styleCss}">${label}</span>`;
		},
	},
	{ key: "amount", label: "Amount", type: "currency", width: "100px" },
	{ key: "venue_id", label: "Venue", width: "130px" },
	{ key: "visitor_id", label: "Visitor", width: "130px" },
	{
		key: "slip_url",
		label: "Slip",
		width: "80px",
		render: (v) =>
			v
				? `<a href="${v}" target="_blank" class="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>View</a>`
				: `<span class="text-slate-500">—</span>`,
	},
	{ key: "metadata", label: "Metadata", type: "json", width: "100px" },
	{ key: "created_at", label: "Created", type: "date", width: "140px" },
	{ key: "updated_at", label: "Updated", type: "date", width: "140px" },
];
</script>
