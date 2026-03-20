<template>
  <div class="performance-dashboard">
    <div class="dashboard-header">
      <h2>{{ $t("auto.k_f8b1115d") }}</h2>
      <div class="time-controls">
        <select id="perfTimeRange" v-model="timeRange" @change="refreshData" :aria-label="$t('auto.k_time_range')">
          <option value="1h">{{ $t("auto.k_b465e4d5") }}</option>
          <option value="24h">{{ $t("auto.k_6f094336") }}</option>
          <option value="7d">{{ $t("auto.k_b58d8d6f") }}</option>
          <option value="30d">{{ $t("auto.k_4dcf4313") }}</option>
        </select>
        <button @click="refreshData" class="refresh-btn"> {{ $t("auto.k_970c2597") }} </button>
      </div>
    </div>

    <!-- Frontend Metrics -->
    <section class="metrics-section">
      <h3>{{ $t("auto.k_cfdbf4f5") }}</h3>
      <div class="metrics-grid">
        <div class="metric-card" :class="getMetricClass(metrics.lighthouse_performance)">
          <div class="metric-value">{{ (metrics.lighthouse_performance * 100).toFixed(0) }}</div>
          <div class="metric-label">{{ $t("auto.k_e9ae5057") }}</div>
          <div class="metric-trend" :class="metrics.lighthouse_performance_trend">
            {{ getTrendIcon(metrics.lighthouse_performance_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.bundle_size, true)">
          <div class="metric-value">{{ formatBytes(metrics.bundle_size) }}</div>
          <div class="metric-label">{{ $t("auto.k_c51ba556") }}</div>
          <div class="metric-trend" :class="metrics.bundle_size_trend">
            {{ getTrendIcon(metrics.bundle_size_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.fcp, true)">
          <div class="metric-value">{{ metrics.fcp.toFixed(1) }}s</div>
          <div class="metric-label">{{ $t("auto.k_67bd70db") }}</div>
          <div class="metric-trend" :class="metrics.fcp_trend">
            {{ getTrendIcon(metrics.fcp_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.lcp, true)">
          <div class="metric-value">{{ metrics.lcp.toFixed(1) }}s</div>
          <div class="metric-label">{{ $t("auto.k_88a4619") }}</div>
          <div class="metric-trend" :class="metrics.lcp_trend">
            {{ getTrendIcon(metrics.lcp_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.cls)">
          <div class="metric-value">{{ metrics.cls.toFixed(3) }}</div>
          <div class="metric-label">{{ $t("auto.k_fe9f50dc") }}</div>
          <div class="metric-trend" :class="metrics.cls_trend">
            {{ getTrendIcon(metrics.cls_trend) }}
          </div>
        </div>
      </div>
    </section>

    <!-- Backend Metrics -->
    <section class="metrics-section">
      <h3>{{ $t("auto.k_7482f2af") }}</h3>
      <div class="metrics-grid">
        <div class="metric-card" :class="getMetricClass(metrics.api_response_time, true)">
          <div class="metric-value">{{ metrics.api_response_time.toFixed(0) }}ms</div>
          <div class="metric-label">{{ $t("auto.k_cc7f490c") }}</div>
          <div class="metric-trend" :class="metrics.api_response_time_trend">
            {{ getTrendIcon(metrics.api_response_time_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.db_query_time, true)">
          <div class="metric-value">{{ metrics.db_query_time.toFixed(0) }}ms</div>
          <div class="metric-label">{{ $t("auto.k_d8110587") }}</div>
          <div class="metric-trend" :class="metrics.db_query_time_trend">
            {{ getTrendIcon(metrics.db_query_time_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.cache_hit_rate)">
          <div class="metric-value">{{ (metrics.cache_hit_rate * 100).toFixed(1) }}%</div>
          <div class="metric-label">{{ $t("auto.k_fd14f1c2") }}</div>
          <div class="metric-trend" :class="metrics.cache_hit_rate_trend">
            {{ getTrendIcon(metrics.cache_hit_rate_trend) }}
          </div>
        </div>
        
        <div class="metric-card" :class="getMetricClass(metrics.error_rate, true)">
          <div class="metric-value">{{ (metrics.error_rate * 100).toFixed(2) }}%</div>
          <div class="metric-label">{{ $t("auto.k_2799c7a9") }}</div>
          <div class="metric-trend" :class="metrics.error_rate_trend">
            {{ getTrendIcon(metrics.error_rate_trend) }}
          </div>
        </div>
      </div>
    </section>

    <!-- Real-time Charts -->
    <section class="charts-section">
      <h3>{{ $t("auto.k_7447d148") }}</h3>
      <div class="charts-grid">
        <div class="chart-container">
          <h4>{{ $t("auto.k_1caad0b4") }}</h4>
          <canvas ref="responseTimeChart"></canvas>
        </div>
        <div class="chart-container">
          <h4>{{ $t("auto.k_d00b9582") }}</h4>
          <canvas ref="bundleSizeChart"></canvas>
        </div>
      </div>
    </section>

    <!-- Alerts -->
    <section class="alerts-section" v-if="alerts.length > 0">
      <h3>{{ $t("auto.k_ba92d8b9") }}</h3>
      <div class="alerts-list">
        <div 
          v-for="alert in alerts" 
          :key="alert.id"
          class="alert-item"
          :class="alert.severity"
        >
          <div class="alert-icon">{{ getAlertIcon(alert.severity) }}</div>
          <div class="alert-content">
            <div class="alert-title">{{ alert.title }}</div>
            <div class="alert-description">{{ alert.description }}</div>
            <div class="alert-time">{{ formatTime(alert.timestamp) }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useQuery } from "@tanstack/vue-query";
import Chart from "chart.js/auto";
import { onMounted, onUnmounted, ref } from "vue";

const timeRange = ref("24h");
const ws = ref(null);

// Metrics data
const metrics = ref({
	lighthouse_performance: 0.95,
	bundle_size: 350000,
	fcp: 1.2,
	lcp: 2.1,
	cls: 0.08,
	api_response_time: 150,
	db_query_time: 45,
	cache_hit_rate: 0.92,
	error_rate: 0.001,
	// Trends
	lighthouse_performance_trend: "stable",
	bundle_size_trend: "improving",
	fcp_trend: "stable",
	lcp_trend: "improving",
	cls_trend: "stable",
	api_response_time_trend: "improving",
	db_query_time_trend: "stable",
	cache_hit_rate_trend: "improving",
	error_rate_trend: "stable",
});

const alerts = ref([
	{
		id: 1,
		severity: "warning",
		title: "Bundle Size Increase",
		description: "Bundle size increased by 15KB in latest deployment",
		timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
	},
]);

// Chart instances
let responseTimeChart = null;
let bundleSizeChart = null;

// Real-time WebSocket connection
const connectWebSocket = () => {
	ws.value = new WebSocket(`${import.meta.env.VITE_WS_URL}/performance`);

	ws.value.onmessage = (event) => {
		const data = JSON.parse(event.data);
		if (data.type === "metrics_update") {
			updateMetrics(data.metrics);
		} else if (data.type === "alert") {
			alerts.value.unshift(data.alert);
		}
	};

	ws.value.onclose = () => {
		setTimeout(connectWebSocket, 5000);
	};
};

const updateMetrics = (newMetrics) => {
	Object.assign(metrics.value, newMetrics);
	updateCharts();
};

const refreshData = async () => {
	try {
		const response = await fetch(
			`/api/performance/metrics?range=${timeRange.value}`,
		);
		const data = await response.json();
		metrics.value = data.metrics;
		alerts.value = data.alerts;
		updateCharts();
	} catch (error) {
		console.error("Failed to refresh metrics:", error);
	}
};

const getMetricClass = (value, isLowerBetter = false) => {
	const thresholds = {
		lighthouse_performance: { good: 0.9, warning: 0.8 },
		bundle_size: { good: 300000, warning: 500000 },
		fcp: { good: 1.5, warning: 2.5 },
		lcp: { good: 2.5, warning: 4.0 },
		cls: { good: 0.1, warning: 0.25 },
		api_response_time: { good: 100, warning: 200 },
		db_query_time: { good: 50, warning: 100 },
		cache_hit_rate: { good: 0.9, warning: 0.8 },
		error_rate: { good: 0.001, warning: 0.01 },
	};

	const metric = Object.keys(thresholds).find(
		(key) => metrics.value[key] === value,
	);
	if (!metric) return "neutral";

	const threshold = thresholds[metric];
	if (isLowerBetter) {
		if (value <= threshold.good) return "good";
		if (value <= threshold.warning) return "warning";
		return "critical";
	} else {
		if (value >= threshold.good) return "good";
		if (value >= threshold.warning) return "warning";
		return "critical";
	}
};

const getTrendIcon = (trend) => {
	const icons = {
		improving: "📈",
		declining: "📉",
		stable: "➡️",
	};
	return icons[trend] || "➡️";
};

const getAlertIcon = (severity) => {
	const icons = {
		critical: "🚨",
		warning: "⚠️",
		info: "ℹ️",
	};
	return icons[severity] || "ℹ️";
};

const formatBytes = (bytes) => {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const formatTime = (timestamp) => {
	const now = new Date();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);

	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	return timestamp.toLocaleDateString();
};

const initCharts = () => {
	// Response Time Chart
	const responseTimeCtx = document.querySelector('[ref="responseTimeChart"]');
	if (responseTimeCtx) {
		responseTimeChart = new Chart(responseTimeCtx, {
			type: "line",
			data: {
				labels: [],
				datasets: [
					{
						label: "API Response Time (ms)",
						data: [],
						borderColor: "rgb(59, 130, 246)",
						backgroundColor: "rgba(59, 130, 246, 0.1)",
						tension: 0.4,
					},
				],
			},
			options: {
				responsive: true,
				scales: {
					y: {
						beginAtZero: true,
						title: {
							display: true,
							text: "Response Time (ms)",
						},
					},
				},
			},
		});
	}

	// Bundle Size Chart
	const bundleSizeCtx = document.querySelector('[ref="bundleSizeChart"]');
	if (bundleSizeCtx) {
		bundleSizeChart = new Chart(bundleSizeCtx, {
			type: "line",
			data: {
				labels: [],
				datasets: [
					{
						label: "Bundle Size (KB)",
						data: [],
						borderColor: "rgb(34, 197, 94)",
						backgroundColor: "rgba(34, 197, 94, 0.1)",
						tension: 0.4,
					},
				],
			},
			options: {
				responsive: true,
				scales: {
					y: {
						beginAtZero: false,
						title: {
							display: true,
							text: "Bundle Size (KB)",
						},
					},
				},
			},
		});
	}
};

const updateCharts = () => {
	// Update chart data with recent metrics
	// This would be populated with historical data from the API
};

onMounted(() => {
	refreshData();
	initCharts();
	connectWebSocket();
});

onUnmounted(() => {
	if (ws.value) {
		ws.value.close();
	}
	if (responseTimeChart) {
		responseTimeChart.destroy();
	}
	if (bundleSizeChart) {
		bundleSizeChart.destroy();
	}
});
</script>

<style scoped>
.performance-dashboard {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.time-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.refresh-btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
}

.metrics-section {
  margin-bottom: 3rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.metric-card {
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  text-align: center;
  position: relative;
}

.metric-card.good {
  border-color: #22c55e;
  background: #f0fdf4;
}

.metric-card.warning {
  border-color: #f59e0b;
  background: #fffbeb;
}

.metric-card.critical {
  border-color: #ef4444;
  background: #fef2f2;
}

.metric-value {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.metric-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.metric-trend {
  position: absolute;
  top: 1rem;
  right: 1rem;
  font-size: 1.25rem;
}

.charts-section {
  margin-bottom: 3rem;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-top: 1rem;
}

.chart-container {
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}

.alerts-section {
  margin-bottom: 2rem;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.alert-item {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-radius: 0.5rem;
  border-left: 4px solid;
}

.alert-item.critical {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.alert-item.warning {
  border-left-color: #f59e0b;
  background: #fffbeb;
}

.alert-item.info {
  border-left-color: #3b82f6;
  background: #eff6ff;
}

.alert-icon {
  font-size: 1.5rem;
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.alert-description {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
}

.alert-time {
  color: #9ca3af;
  font-size: 0.75rem;
}
</style>
