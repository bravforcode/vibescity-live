<template>
  <div class="system-health-dashboard">
    <div class="dashboard-header">
      <h1>{{ $t("auto.k_25316332") }}</h1>
      <div class="header-controls">
        <select
          v-model="selectedTimeRange"
          aria-label="System health time range"
          @change="refreshData"
        >
          <option value="1h">{{ $t("auto.k_b465e4d5") }}</option>
          <option value="6h">{{ $t("auto.k_c36b5d64") }}</option>
          <option value="24h">{{ $t("auto.k_6f094336") }}</option>
          <option value="7d">{{ $t("auto.k_b58d8d6f") }}</option>
        </select>
        <button @click="refreshData" class="refresh-btn" :disabled="isLoading"> {{ $t("auto.k_970c2597") }} </button>
        <button @click="toggleAutoRefresh" class="auto-refresh-btn" :class="{ active: autoRefresh }"> {{ $t("auto.k_98fe0b73") }} {{ autoRefreshInterval }}s
        </button>
      </div>
    </div>

    <!-- System Overview -->
    <section class="overview-section">
      <h2>{{ $t("auto.k_f6f0e166") }}</h2>
      <div class="overview-grid">
        <div class="overview-card" :class="getHealthClass(systemHealth.overall_health)">
          <div class="card-icon">🏥</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_eb9ed6ac") }}</div>
            <div class="card-value">{{ systemHealth.overall_health }}</div>
            <div class="card-subtitle">{{ systemHealth.health_score }}/100</div>
          </div>
        </div>
        
        <div class="overview-card" :class="getStatusClass(systemHealth.metrics_collection)">
          <div class="card-icon">📈</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_92b96c72") }}</div>
            <div class="card-value">{{ systemHealth.metrics_collection }}</div>
            <div class="card-subtitle">{{ systemHealth.last_metrics_run }}</div>
          </div>
        </div>
        
        <div class="overview-card" :class="getStatusClass(systemHealth.security_scanning)">
          <div class="card-icon">🔒</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_52c5840a") }}</div>
            <div class="card-value">{{ systemHealth.security_scanning }}</div>
            <div class="card-subtitle">{{ systemHealth.last_security_scan }}</div>
          </div>
        </div>
        
        <div class="overview-card" :class="getStatusClass(systemHealth.alerting_system)">
          <div class="card-icon">🚨</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_6416e5c") }}</div>
            <div class="card-value">{{ systemHealth.alerting_system }}</div>
            <div class="card-subtitle">{{ systemHealth.active_alerts }} active</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Component Health -->
    <section class="components-section">
      <h2>{{ $t("auto.k_b19eaad4") }}</h2>
      <div class="components-grid">
        <div v-for="component in componentHealth" :key="component.name" 
             class="component-card" :class="getHealthClass(component.health)">
          <div class="component-header">
            <div class="component-icon">{{ component.icon }}</div>
            <div class="component-info">
              <h3>{{ component.name }}</h3>
              <span class="component-status">{{ component.health }}</span>
            </div>
            <div class="component-actions">
              <button @click="viewComponentDetails(component)" class="details-btn"> {{ $t("auto.k_64c7ce3b") }} </button>
            </div>
          </div>
          
          <div class="component-metrics">
            <div class="metric-row">
              <span class="metric-label">{{ $t("auto.k_ff55f4f9") }}</span>
              <span class="metric-value">{{ component.uptime }}%</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">{{ $t("auto.k_96009e73") }}</span>
              <span class="metric-value">{{ component.avg_response_time }}ms</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">{{ $t("auto.k_17043838") }}</span>
              <span class="metric-value">{{ component.success_rate }}%</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">{{ $t("auto.k_1c68f2d5") }}</span>
              <span class="metric-value">{{ formatTime(component.last_check) }}</span>
            </div>
          </div>
          
          <div class="component-issues" v-if="component.issues.length > 0">
            <h4>{{ $t("auto.k_9793083c") }}</h4>
            <div class="issues-list">
              <div v-for="issue in component.issues.slice(0, 3)" :key="issue.id" 
                   class="issue-item" :class="issue.severity">
                <span class="issue-time">{{ formatTime(issue.timestamp) }}</span>
                <span class="issue-message">{{ issue.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Performance Metrics -->
    <section class="performance-section">
      <h2>{{ $t("auto.k_884e233") }}</h2>
      <div class="performance-grid">
        <div class="performance-card">
          <h3>{{ $t("auto.k_e7e6a945") }}</h3>
          <canvas ref="responseTimeChart"></canvas>
        </div>
        
        <div class="performance-card">
          <h3>{{ $t("auto.k_f35576e") }}</h3>
          <canvas ref="throughputChart"></canvas>
        </div>
        
        <div class="performance-card">
          <h3>{{ $t("auto.k_31159c2e") }}</h3>
          <canvas ref="errorRateChart"></canvas>
        </div>
        
        <div class="performance-card">
          <h3>{{ $t("auto.k_7f366cfe") }}</h3>
          <canvas ref="resourceChart"></canvas>
        </div>
      </div>
    </section>

    <!-- Recent Alerts -->
    <section class="alerts-section">
      <h2>{{ $t("auto.k_14bbb352") }}</h2>
      <div class="alerts-controls">
        <select v-model="alertFilter" aria-label="Alert filter">
          <option value="all">{{ $t("auto.k_7a0f3b7b") }}</option>
          <option value="critical">{{ $t("auto.k_8fb4e6aa") }}</option>
          <option value="warning">{{ $t("auto.k_d04eb096") }}</option>
          <option value="resolved">Resolved</option>
        </select>
        <button @click="clearResolvedAlerts" class="clear-btn"> {{ $t("auto.k_89fe5613") }} </button>
      </div>
      
      <div class="alerts-list">
        <div v-for="alert in filteredAlerts" :key="alert.id" 
             class="alert-item" :class="[alert.severity, { resolved: alert.resolved }]">
          <div class="alert-header">
            <div class="alert-icon">{{ getAlertIcon(alert.severity) }}</div>
            <div class="alert-info">
              <h4>{{ alert.title }}</h4>
              <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
            </div>
            <div class="alert-actions">
              <button v-if="!alert.resolved" @click="resolveAlert(alert.id)" class="resolve-btn"> {{ $t("auto.k_9ad15ec") }} </button>
              <button @click="viewAlertDetails(alert)" class="details-btn"> {{ $t("auto.k_64c7ce3b") }} </button>
            </div>
          </div>
          
          <div class="alert-content">
            <p>{{ alert.description }}</p>
            <div class="alert-metrics">
              <span class="metric">{{ $t("auto.k_43021381") }} {{ alert.metric_name }}</span>
              <span class="metric">{{ $t("auto.k_c44d78f0") }} {{ alert.current_value }}</span>
              <span class="metric">{{ $t("auto.k_af642e06") }} {{ alert.threshold }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- System Logs -->
    <section class="logs-section">
      <h2>{{ $t("auto.k_6c77b18d") }}</h2>
      <div class="logs-controls">
        <select v-model="logLevel" aria-label="Log level filter">
          <option value="all">{{ $t("auto.k_ec55df33") }}</option>
          <option value="error">{{ $t("auto.k_7acd9a94") }}</option>
          <option value="warning">{{ $t("auto.k_d04eb096") }}</option>
          <option value="info">{{ $t("auto.k_9af5e2c1") }}</option>
        </select>
        <button @click="exportLogs" class="export-btn"> {{ $t("auto.k_fd901942") }} </button>
      </div>
      
      <div class="logs-container">
        <div v-for="log in filteredLogs" :key="log.id" 
             class="log-item" :class="log.level">
          <span class="log-time">{{ formatTime(log.timestamp) }}</span>
          <span class="log-level">{{ log.level.toUpperCase() }}</span>
          <span class="log-component">{{ log.component }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
      </div>
    </section>

    <!-- Component Details Modal -->
    <div v-if="selectedComponent" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ selectedComponent.icon }} {{ selectedComponent.name }} Details</h3>
          <button @click="closeModal" class="close-btn">✖️</button>
        </div>
        
        <div class="modal-body">
          <div class="detail-section">
            <h4>{{ $t("auto.k_817ba82d") }}</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_ca77496f") }}</span>
                <span class="detail-value" :class="selectedComponent.health">{{ selectedComponent.health }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_f310d15") }}</span>
                <span class="detail-value">{{ selectedComponent.health_score }}/100</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_ff55f4f9") }}</span>
                <span class="detail-value">{{ selectedComponent.uptime }}%</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_1c68f2d5") }}</span>
                <span class="detail-value">{{ formatTime(selectedComponent.last_check) }}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h4>{{ $t("auto.k_a5aa50b0") }}</h4>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_3cce0f67") }}</span>
                <span class="detail-value">{{ selectedComponent.avg_response_time }}ms</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_17043838") }}</span>
                <span class="detail-value">{{ selectedComponent.success_rate }}%</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_daace2bf") }}</span>
                <span class="detail-value">{{ selectedComponent.throughput }}/s</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">{{ $t("auto.k_ea152c69") }}</span>
                <span class="detail-value">{{ selectedComponent.error_rate }}%</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section" v-if="selectedComponent.issues.length > 0">
            <h4>{{ $t("auto.k_44c5ec6e") }}</h4>
            <div class="issues-list">
              <div v-for="issue in selectedComponent.issues" :key="issue.id" 
                   class="issue-item" :class="issue.severity">
                <div class="issue-header">
                  <span class="issue-time">{{ formatTime(issue.timestamp) }}</span>
                  <span class="issue-severity">{{ issue.severity.toUpperCase() }}</span>
                </div>
                <div class="issue-message">{{ issue.message }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useQuery } from "@tanstack/vue-query";
import Chart from "chart.js/auto";
import { computed, onMounted, onUnmounted, ref } from "vue";

// Reactive data
const isLoading = ref(false);
const selectedTimeRange = ref("24h");
const autoRefresh = ref(true);
const autoRefreshInterval = ref(30);
const refreshTimer = ref(null);

const systemHealth = ref({
	overall_health: "healthy",
	health_score: 95,
	metrics_collection: "operational",
	security_scanning: "operational",
	alerting_system: "operational",
	last_metrics_run: "2 minutes ago",
	last_security_scan: "1 hour ago",
	active_alerts: 2,
});

const componentHealth = ref([
	{
		name: "Metrics Collector",
		icon: "📈",
		health: "healthy",
		health_score: 98,
		uptime: 99.9,
		avg_response_time: 45,
		success_rate: 99.5,
		throughput: 120,
		error_rate: 0.5,
		last_check: new Date(Date.now() - 2 * 60 * 1000),
		issues: [],
	},
	{
		name: "Security Validator",
		icon: "🔒",
		health: "healthy",
		health_score: 92,
		uptime: 99.7,
		avg_response_time: 120,
		success_rate: 98.2,
		throughput: 15,
		error_rate: 1.8,
		last_check: new Date(Date.now() - 5 * 60 * 1000),
		issues: [],
	},
	{
		name: "Alerting System",
		icon: "🚨",
		health: "degraded",
		health_score: 85,
		uptime: 98.5,
		avg_response_time: 250,
		success_rate: 95.0,
		throughput: 45,
		error_rate: 5.0,
		last_check: new Date(Date.now() - 1 * 60 * 1000),
		issues: [
			{
				id: 1,
				severity: "warning",
				timestamp: new Date(Date.now() - 30 * 60 * 1000),
				message: "High response time detected for email alerts",
			},
		],
	},
	{
		name: "Thai Summary Generator",
		icon: "📝",
		health: "healthy",
		health_score: 96,
		uptime: 99.8,
		avg_response_time: 15,
		success_rate: 99.8,
		throughput: 200,
		error_rate: 0.2,
		last_check: new Date(Date.now() - 3 * 60 * 1000),
		issues: [],
	},
]);

const alerts = ref([
	{
		id: 1,
		severity: "warning",
		title: "Alerting System Response Time",
		description: "Average response time exceeded threshold of 200ms",
		metric_name: "alert_response_time",
		current_value: 250,
		threshold: 200,
		timestamp: new Date(Date.now() - 30 * 60 * 1000),
		resolved: false,
	},
	{
		id: 2,
		severity: "critical",
		title: "Security Scan Failure",
		description: "Security validation failed for backend component",
		metric_name: "security_scan_status",
		current_value: 1,
		threshold: 0,
		timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
		resolved: false,
	},
]);

const logs = ref([
	{
		id: 1,
		level: "info",
		component: "MetricsCollector",
		message: "Metrics collection completed successfully",
		timestamp: new Date(Date.now() - 2 * 60 * 1000),
	},
	{
		id: 2,
		level: "warning",
		component: "AlertingSystem",
		message: "High response time detected: 250ms",
		timestamp: new Date(Date.now() - 30 * 60 * 1000),
	},
	{
		id: 3,
		level: "error",
		component: "SecurityValidator",
		message: "Security scan failed for backend",
		timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
	},
]);

const selectedComponent = ref(null);
const alertFilter = ref("all");
const logLevel = ref("all");

// Computed properties
const filteredAlerts = computed(() => {
	let filtered = alerts.value;

	if (alertFilter.value === "critical") {
		filtered = filtered.filter((alert) => alert.severity === "critical");
	} else if (alertFilter.value === "warning") {
		filtered = filtered.filter((alert) => alert.severity === "warning");
	} else if (alertFilter.value === "resolved") {
		filtered = filtered.filter((alert) => alert.resolved);
	}

	return filtered.sort((a, b) => b.timestamp - a.timestamp);
});

const filteredLogs = computed(() => {
	let filtered = logs.value;

	if (logLevel.value === "error") {
		filtered = filtered.filter((log) => log.level === "error");
	} else if (logLevel.value === "warning") {
		filtered = filtered.filter((log) => log.level === "warning");
	} else if (logLevel.value === "info") {
		filtered = filtered.filter((log) => log.level === "info");
	}

	return filtered.sort((a, b) => b.timestamp - a.timestamp);
});

// Chart instances
let responseTimeChart = null;
let throughputChart = null;
let errorRateChart = null;
let resourceChart = null;

// Methods
const refreshData = async () => {
	isLoading.value = true;

	try {
		// Fetch system health data
		const response = await fetch("/api/system/health");
		const data = await response.json();

		// Update system health
		systemHealth.value = { ...systemHealth.value, ...data.system_health };

		// Update component health
		componentHealth.value = data.component_health || componentHealth.value;

		// Update alerts
		alerts.value = data.alerts || alerts.value;

		// Update logs
		logs.value = data.logs || logs.value;

		// Update charts
		updateCharts();
	} catch (error) {
		console.error("Failed to refresh data:", error);
	} finally {
		isLoading.value = false;
	}
};

const toggleAutoRefresh = () => {
	autoRefresh.value = !autoRefresh.value;

	if (autoRefresh.value) {
		startAutoRefresh();
	} else {
		stopAutoRefresh();
	}
};

const startAutoRefresh = () => {
	refreshTimer.value = setInterval(
		refreshData,
		autoRefreshInterval.value * 1000,
	);
};

const stopAutoRefresh = () => {
	if (refreshTimer.value) {
		clearInterval(refreshTimer.value);
		refreshTimer.value = null;
	}
};

const getHealthClass = (health) => {
	const classes = {
		healthy: "status-healthy",
		degraded: "status-degraded",
		unhealthy: "status-unhealthy",
	};
	return classes[health] || "status-unknown";
};

const getStatusClass = (status) => {
	const classes = {
		operational: "status-healthy",
		degraded: "status-degraded",
		failed: "status-unhealthy",
	};
	return classes[status] || "status-unknown";
};

const getAlertIcon = (severity) => {
	const icons = {
		critical: "🚨",
		warning: "⚠️",
		info: "ℹ️",
	};
	return icons[severity] || "ℹ️";
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

const viewComponentDetails = (component) => {
	selectedComponent.value = component;
};

const closeModal = () => {
	selectedComponent.value = null;
};

const resolveAlert = async (alertId) => {
	try {
		await fetch(`/api/alerts/${alertId}/resolve`, { method: "POST" });

		// Update local state
		const alert = alerts.value.find((a) => a.id === alertId);
		if (alert) {
			alert.resolved = true;
			alert.resolved_at = new Date();
		}
	} catch (error) {
		console.error("Failed to resolve alert:", error);
	}
};

const clearResolvedAlerts = () => {
	alerts.value = alerts.value.filter((alert) => !alert.resolved);
};

const viewAlertDetails = (alert) => {
	// Implementation for alert details modal
	console.log("View alert details:", alert);
};

const exportLogs = () => {
	const logData = filteredLogs.value.map((log) => ({
		timestamp: log.timestamp.toISOString(),
		level: log.level,
		component: log.component,
		message: log.message,
	}));

	const blob = new Blob([JSON.stringify(logData, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `system-logs-${new Date().toISOString().split("T")[0]}.json`;
	a.click();
	URL.revokeObjectURL(url);
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
						label: "Response Time (ms)",
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

	// Throughput Chart
	const throughputCtx = document.querySelector('[ref="throughputChart"]');
	if (throughputCtx) {
		throughputChart = new Chart(throughputCtx, {
			type: "line",
			data: {
				labels: [],
				datasets: [
					{
						label: "Throughput (req/s)",
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
						beginAtZero: true,
						title: {
							display: true,
							text: "Throughput (req/s)",
						},
					},
				},
			},
		});
	}

	// Error Rate Chart
	const errorRateCtx = document.querySelector('[ref="errorRateChart"]');
	if (errorRateCtx) {
		errorRateChart = new Chart(errorRateCtx, {
			type: "line",
			data: {
				labels: [],
				datasets: [
					{
						label: "Error Rate (%)",
						data: [],
						borderColor: "rgb(239, 68, 68)",
						backgroundColor: "rgba(239, 68, 68, 0.1)",
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
							text: "Error Rate (%)",
						},
					},
				},
			},
		});
	}

	// Resource Usage Chart
	const resourceCtx = document.querySelector('[ref="resourceChart"]');
	if (resourceCtx) {
		resourceChart = new Chart(resourceCtx, {
			type: "line",
			data: {
				labels: [],
				datasets: [
					{
						label: "CPU Usage (%)",
						data: [],
						borderColor: "rgb(168, 85, 247)",
						backgroundColor: "rgba(168, 85, 247, 0.1)",
						tension: 0.4,
					},
					{
						label: "Memory Usage (%)",
						data: [],
						borderColor: "rgb(251, 146, 60)",
						backgroundColor: "rgba(251, 146, 60, 0.1)",
						tension: 0.4,
					},
				],
			},
			options: {
				responsive: true,
				scales: {
					y: {
						beginAtZero: true,
						max: 100,
						title: {
							display: true,
							text: "Usage (%)",
						},
					},
				},
			},
		});
	}
};

const updateCharts = () => {
	// Update chart data with recent metrics
	// This would be populated with actual data from the API

	// Generate sample data for demonstration
	const now = new Date();
	const labels = [];
	const responseTimeData = [];
	const throughputData = [];
	const errorRateData = [];
	const cpuData = [];
	const memoryData = [];

	for (let i = 23; i >= 0; i--) {
		const time = new Date(now - i * 60 * 60 * 1000);
		labels.push(time.toLocaleTimeString());

		// Sample data with some randomness
		responseTimeData.push(45 + Math.random() * 20);
		throughputData.push(120 + Math.random() * 30);
		errorRateData.push(0.5 + Math.random() * 2);
		cpuData.push(30 + Math.random() * 40);
		memoryData.push(40 + Math.random() * 30);
	}

	// Update charts
	if (responseTimeChart) {
		responseTimeChart.data.labels = labels;
		responseTimeChart.data.datasets[0].data = responseTimeData;
		responseTimeChart.update();
	}

	if (throughputChart) {
		throughputChart.data.labels = labels;
		throughputChart.data.datasets[0].data = throughputData;
		throughputChart.update();
	}

	if (errorRateChart) {
		errorRateChart.data.labels = labels;
		errorRateChart.data.datasets[0].data = errorRateData;
		errorRateChart.update();
	}

	if (resourceChart) {
		resourceChart.data.labels = labels;
		resourceChart.data.datasets[0].data = cpuData;
		resourceChart.data.datasets[1].data = memoryData;
		resourceChart.update();
	}
};

// Lifecycle hooks
onMounted(() => {
	refreshData();
	initCharts();

	if (autoRefresh.value) {
		startAutoRefresh();
	}
});

onUnmounted(() => {
	stopAutoRefresh();

	// Destroy charts
	if (responseTimeChart) responseTimeChart.destroy();
	if (throughputChart) throughputChart.destroy();
	if (errorRateChart) errorRateChart.destroy();
	if (resourceChart) resourceChart.destroy();
});
</script>

<style scoped>
.system-health-dashboard {
  padding: 2rem;
  max-width: 1600px;
  margin: 0 auto;
  background: #f8fafc;
  min-height: 100vh;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.refresh-btn, .auto-refresh-btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.refresh-btn:hover, .auto-refresh-btn:hover {
  background: #2563eb;
}

.auto-refresh-btn.active {
  background: #10b981;
}

.auto-refresh-btn.active:hover {
  background: #059669;
}

.overview-section, .components-section, .performance-section, .alerts-section, .logs-section {
  margin-bottom: 2rem;
}

.overview-section h2, .components-section h2, .performance-section h2, .alerts-section h2, .logs-section h2 {
  margin-bottom: 1rem;
  color: #1f2937;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.overview-card {
  display: flex;
  align-items: center;
  padding: 1.5rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #e5e7eb;
}

.overview-card.status-healthy {
  border-left-color: #22c55e;
}

.overview-card.status-degraded {
  border-left-color: #f59e0b;
}

.overview-card.status-unhealthy {
  border-left-color: #ef4444;
}

.card-icon {
  font-size: 2rem;
  margin-right: 1rem;
}

.card-title {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.card-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}

.card-subtitle {
  font-size: 0.75rem;
  color: #9ca3af;
}

.components-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
}

.component-card {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.component-card.status-healthy {
  border-left: 4px solid #22c55e;
}

.component-card.status-degraded {
  border-left: 4px solid #f59e0b;
}

.component-card.status-unhealthy {
  border-left: 4px solid #ef4444;
}

.component-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.component-icon {
  font-size: 1.5rem;
  margin-right: 0.75rem;
}

.component-info {
  flex: 1;
}

.component-info h3 {
  margin: 0;
  font-size: 1rem;
  color: #1f2937;
}

.component-status {
  font-size: 0.875rem;
  color: #6b7280;
}

.component-actions {
  display: flex;
  gap: 0.5rem;
}

.details-btn {
  padding: 0.25rem 0.5rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.component-metrics {
  padding: 1rem;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.metric-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
}

.component-issues {
  padding: 1rem;
  border-top: 1px solid #e5e7eb;
}

.component-issues h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  color: #1f2937;
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.issue-item {
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.issue-item.warning {
  background: #fef3c7;
  color: #92400e;
}

.issue-item.error {
  background: #fef2f2;
  color: #991b1b;
}

.issue-time {
  font-weight: 500;
}

.performance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
}

.performance-card {
  background: white;
  padding: 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.performance-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #1f2937;
}

.alerts-controls, .logs-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.clear-btn, .export-btn {
  padding: 0.5rem 1rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
}

.export-btn {
  background: #3b82f6;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.alert-item {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.alert-item.critical {
  border-left: 4px solid #ef4444;
}

.alert-item.warning {
  border-left: 4px solid #f59e0b;
}

.alert-item.resolved {
  opacity: 0.6;
}

.alert-header {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.alert-icon {
  font-size: 1.25rem;
  margin-right: 0.75rem;
}

.alert-info {
  flex: 1;
}

.alert-info h4 {
  margin: 0;
  font-size: 1rem;
  color: #1f2937;
}

.alert-time {
  font-size: 0.75rem;
  color: #6b7280;
}

.alert-actions {
  display: flex;
  gap: 0.5rem;
}

.resolve-btn {
  padding: 0.25rem 0.5rem;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.alert-content {
  padding: 1rem;
}

.alert-content p {
  margin: 0 0 0.5rem 0;
  color: #4b5563;
}

.alert-metrics {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.logs-container {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  max-height: 400px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  font-family: monospace;
  font-size: 0.875rem;
}

.log-item.error {
  background: #fef2f2;
  color: #991b1b;
}

.log-item.warning {
  background: #fef3c7;
  color: #92400e;
}

.log-item.info {
  background: #eff6ff;
  color: #1e40af;
}

.log-time {
  margin-right: 1rem;
  color: #6b7280;
}

.log-level {
  margin-right: 1rem;
  font-weight: 600;
  min-width: 60px;
}

.log-component {
  margin-right: 1rem;
  color: #6b7280;
  min-width: 120px;
}

.log-message {
  flex: 1;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  margin: 2rem;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  color: #1f2937;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: #6b7280;
}

.modal-body {
  padding: 1.5rem;
}

.detail-section {
  margin-bottom: 2rem;
}

.detail-section h4 {
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.detail-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1f2937;
}

.detail-value.healthy {
  color: #22c55e;
}

.detail-value.degraded {
  color: #f59e0b;
}

.detail-value.unhealthy {
  color: #ef4444;
}
</style>
