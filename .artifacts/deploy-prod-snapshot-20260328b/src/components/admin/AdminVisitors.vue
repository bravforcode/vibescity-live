<template>
  <div class="admin-visitors space-y-6 text-slate-200">
    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Geo Distribution Chart -->
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
            class="text-blue-400"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
          Visitors by Country
        </h3>

        <div v-if="loadingCharts" class="h-64 flex items-center justify-center">
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
          <Bar v-if="geoChartData" :data="geoChartData" :options="barOptions" />
          <div
            v-else
            class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm"
          >
            No location data available
          </div>
        </div>
      </div>

      <!-- Device Distribution Chart -->
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
            class="text-emerald-400"
          >
            <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
            <path d="M12 18h.01" />
          </svg>
          Device Types
        </h3>

        <div v-if="loadingCharts" class="h-64 flex items-center justify-center">
          <svg
            class="animate-spin h-6 w-6 text-emerald-500"
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
        <div v-else class="h-64 relative w-full pb-4 flex justify-center">
          <Doughnut
            v-if="deviceChartData"
            :data="deviceChartData"
            :options="doughnutOptions"
          />
          <div
            v-else
            class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm"
          >
            No device data available
          </div>
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Visitor Sessions Log
      </h3>
      <DataTable
        :columns="columns"
        :fetch-fn="adminDataService.getVisitorSessions"
        search-placeholder="Search by visitor ID, country, city, device..."
        default-sort="created_at"
      />
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
import DataTable from "./DataTable.vue";

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	Title,
	Tooltip,
	Legend,
	ArcElement,
);

const loadingCharts = ref(false);
const geoData = ref([]);
const deviceData = ref([]);

const columns = [
	{ key: "visitor_id", label: "Visitor ID", width: "180px" },
	{ key: "user_id", label: "User ID", width: "120px" },
	{ key: "country", label: "Country", width: "80px" },
	{ key: "city", label: "City", width: "100px" },
	{ key: "region", label: "Region", width: "100px" },
	{ key: "device_type", label: "Device", width: "80px" },
	{ key: "browser", label: "Browser", width: "80px" },
	{ key: "os", label: "OS", width: "80px" },
	{ key: "referrer", label: "Referrer", width: "150px" },
	{ key: "utm_source", label: "UTM Source", width: "100px" },
	{ key: "page_views", label: "Pages", type: "number", width: "60px" },
	{
		key: "duration_seconds",
		label: "Duration (s)",
		type: "number",
		width: "90px",
	},
	{ key: "created_at", label: "Started", type: "date", width: "130px" },
	{ key: "last_seen_at", label: "Last Seen", type: "date", width: "130px" },
];

const fetchChartData = async () => {
	loadingCharts.value = true;
	try {
		const [geo, dev] = await Promise.all([
			adminDataService.getVisitorGeoDistribution(),
			adminDataService.getVisitorDeviceDistribution(),
		]);
		geoData.value = geo;
		deviceData.value = dev;
	} catch (err) {
		console.error("Failed to load visitor charts", err);
	} finally {
		loadingCharts.value = false;
	}
};

onMounted(() => {
	fetchChartData();
});

// -- Geo Chart Configuration --
const geoChartData = computed(() => {
	if (!geoData.value || geoData.value.length === 0) return null;
	const top10 = geoData.value.slice(0, 10);
	return {
		labels: top10.map((item) => item.label),
		datasets: [
			{
				label: "Sessions",
				backgroundColor: "#60a5fa", // blue-400
				borderColor: "#3b82f6", // blue-500
				borderWidth: 1,
				borderRadius: 4,
				data: top10.map((item) => item.value),
			},
		],
	};
});

const barOptions = {
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
		},
	},
	scales: {
		y: {
			beginAtZero: true,
			grid: { color: "#334155" },
			ticks: { color: "#94a3b8" },
		},
		x: {
			grid: { display: false },
			ticks: { color: "#94a3b8" },
		},
	},
};

// -- Device Chart Configuration --
const deviceChartData = computed(() => {
	if (!deviceData.value || deviceData.value.length === 0) return null;
	const labels = deviceData.value.map((item) => item.label);
	const dataVals = deviceData.value.map((item) => item.value);

	const bgColors = labels.map((label) => {
		const lower = label.toLowerCase();
		if (lower.includes("mobile")) return "#34d399"; // emerald-400
		if (lower.includes("desktop")) return "#3b82f6"; // blue-500
		if (lower.includes("tablet")) return "#f472b6"; // pink-400
		return "#94a3b8"; // slate-400
	});

	return {
		labels,
		datasets: [
			{
				data: dataVals,
				backgroundColor: bgColors,
				borderWidth: 2,
				borderColor: "#1e293b", // matches background slate-800
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
				color: "#cbd5e1",
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
</script>
