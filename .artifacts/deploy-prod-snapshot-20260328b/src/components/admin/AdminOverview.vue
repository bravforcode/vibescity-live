<template>
  <div class="admin-overview w-full h-full text-slate-200">
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center p-12 text-slate-400"
    >
      <svg
        class="animate-spin h-8 w-8 text-blue-500 mb-4"
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
      Loading KPI Data...
    </div>

    <div
      v-else-if="error"
      class="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-6 rounded-xl flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lucide lucide-alert-circle"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
        <span>{{ error }}</span>
      </div>
      <button
        @click="fetchKPIs"
        class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-600"
      >
        Retry
      </button>
    </div>

    <div v-else class="space-y-6">
      <!-- KPI Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          v-for="(kpi, idx) in kpis"
          :key="idx"
          class="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col shadow-sm"
        >
          <div class="flex items-center justify-between mb-2">
            <span
              class="text-xs font-semibold text-slate-400 uppercase tracking-wider"
              >{{ kpi.label }}</span
            >
            <SafeHtml class="text-blue-400 opacity-80" :content="kpi.icon" />
          </div>
          <div
            class="text-2xl font-bold text-white tabular-nums tracking-tight"
          >
            {{ kpi.formatted }}
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Categories Chart -->
        <div
          class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
        >
          <h3
            class="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-slate-700"
          >
            Venues by Category (Top 10)
          </h3>
          <div class="h-64 relative w-full">
            <Bar
              v-if="categoryChartData"
              :data="categoryChartData"
              :options="chartOptions"
            />
            <div
              v-else
              class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm"
            >
              No data available
            </div>
          </div>
        </div>

        <!-- Orders Breakdown Chart -->
        <div
          class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm"
        >
          <h3
            class="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-slate-700"
          >
            Order Status Breakdown
          </h3>
          <div class="h-64 relative w-full flex justify-center pb-4">
            <Doughnut
              v-if="orderChartData"
              :data="orderChartData"
              :options="doughnutOptions"
            />
            <div
              v-else
              class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm"
            >
              No data available
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Legend,
	LinearScale,
	Title,
	Tooltip,
} from "chart.js";
import { computed, onMounted, ref } from "vue";
import { Bar, Doughnut } from "vue-chartjs";
import { adminDataService } from "../../services/adminDataService";
import SafeHtml from "../ui/SafeHtml.vue";

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	Title,
	Tooltip,
	Legend,
	ArcElement,
);

const loading = ref(false);
const error = ref(null);
const data = ref(null);
const categoryData = ref([]);
const orderData = ref({});

const kpis = computed(() => {
	if (!data.value) return [];
	const d = data.value;
	return [
		{
			label: "Total Venues",
			formatted: d.venues.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
		},
		{
			label: "Visitor Sessions",
			formatted: d.visitors.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
		},
		{
			label: "Total Orders",
			formatted: d.orders.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
		},
		{
			label: "Total Revenue",
			formatted: `฿${d.totalRevenue.toLocaleString()}`,
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
		},
		{
			label: "Total Reviews",
			formatted: d.reviews.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
		},
		{
			label: "Local Ad Impressions",
			formatted: d.ads.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>',
		},
		{
			label: "Coins Distributed",
			formatted: d.totalCoins.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>',
		},
		{
			label: "Active Participants",
			formatted: d.gamificationUsers.toLocaleString(),
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M19 16v6"/><path d="M22 19h-6"/><circle cx="10" cy="10" r="7"/></svg>',
		},
	];
});

// Chart computed properties
const categoryChartData = computed(() => {
	if (!categoryData.value || categoryData.value.length === 0) return null;
	const top10 = categoryData.value.slice(0, 10);
	return {
		labels: top10.map((item) => item.label),
		datasets: [
			{
				label: "Venues",
				backgroundColor: "#3b82f6", // blue-500
				borderColor: "#2563eb", // blue-600
				borderWidth: 1,
				borderRadius: 4,
				data: top10.map((item) => item.value),
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
			backgroundColor: "rgba(15, 23, 42, 0.9)", // slate-900
			titleColor: "#f1f5f9",
			bodyColor: "#cbd5e1",
			borderColor: "#334155",
			borderWidth: 1,
			padding: 10,
		},
	},
	scales: {
		y: {
			beginAtZero: true,
			grid: { color: "#334155" }, // slate-700
			ticks: { color: "#94a3b8" }, // slate-400
		},
		x: {
			grid: { display: false },
			ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 45 },
		},
	},
};

const orderChartData = computed(() => {
	if (!orderData.value || Object.keys(orderData.value).length === 0)
		return null;
	const labels = Object.keys(orderData.value);
	const dataVals = Object.values(orderData.value);

	// Custom colors based on status (assuming standard statuses)
	const bgColors = labels.map((status) => {
		if (status === "paid" || status === "completed") return "#10b981"; // emerald-500
		if (status === "pending") return "#f59e0b"; // amber-500
		if (status === "rejected" || status === "failed" || status === "cancelled")
			return "#ef4444"; // red-500
		return "#64748b"; // slate-500 fallback
	});

	return {
		labels,
		datasets: [
			{
				data: dataVals,
				backgroundColor: bgColors,
				borderWidth: 2,
				borderColor: "#1e293b", // matches background slate-800 to create gaps
			},
		],
	};
});

const doughnutOptions = {
	responsive: true,
	maintainAspectRatio: false,
	cutout: "70%",
	plugins: {
		legend: {
			position: "right",
			labels: {
				color: "#cbd5e1", // slate-300
				padding: 20,
				usePointStyle: true,
			},
		},
		tooltip: {
			backgroundColor: "rgba(15, 23, 42, 0.9)",
			titleColor: "#f1f5f9",
			bodyColor: "#cbd5e1",
			borderColor: "#334155",
			borderWidth: 1,
			padding: 10,
		},
	},
};

const fetchKPIs = async () => {
	loading.value = true;
	error.value = null;
	try {
		const [kpiData, catData, orderStatusData] = await Promise.all([
			adminDataService.getOverviewKPIs(),
			adminDataService.getVenuesByCategory(),
			adminDataService.getOrderStatusBreakdown(),
		]);
		data.value = kpiData;
		categoryData.value = catData;
		orderData.value = orderStatusData;
	} catch (e) {
		error.value = e.message;
	} finally {
		loading.value = false;
	}
};

onMounted(fetchKPIs);
</script>
