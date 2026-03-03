<template>
  <div class="anonymous-analytics">
    <!-- Analytics Dashboard Header -->
    <div class="analytics-header">
      <h1>{{ $t("auto.k_da2e030f") }}</h1>
      <div class="header-controls">
        <select v-model="selectedTimeRange" @change="refreshAnalytics">
          <option value="1h">{{ $t("auto.k_b465e4d5") }}</option>
          <option value="24h">{{ $t("auto.k_6f094336") }}</option>
          <option value="7d">{{ $t("auto.k_b58d8d6f") }}</option>
          <option value="30d">{{ $t("auto.k_4dcf4313") }}</option>
        </select>
        <button @click="refreshAnalytics" class="refresh-btn" :disabled="isLoading"> {{ $t("auto.k_970c2597") }} </button>
        <button @click="exportData" class="export-btn"> {{ $t("auto.k_93b2afe9") }} </button>
      </div>
    </div>

    <!-- Real-time Overview -->
    <section class="overview-section">
      <h2>{{ $t("auto.k_77bca941") }}</h2>
      <div class="overview-grid">
        <div class="overview-card">
          <div class="card-icon">👥</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_917fd5d4") }}</div>
            <div class="card-value">{{ overviewData.active_sessions?.toLocaleString() || '0' }}</div>
            <div class="card-change" :class="getChangeClass(overviewData.session_change)">
              {{ formatChange(overviewData.session_change) }}
            </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">👁️</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_295662aa") }}</div>
            <div class="card-value">{{ overviewData.total_page_views?.toLocaleString() || '0' }}</div>
            <div class="card-change" :class="getChangeClass(overviewData.page_view_change)">
              {{ formatChange(overviewData.page_view_change) }}
            </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">🆕</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_de0efc79") }}</div>
            <div class="card-value">{{ overviewData.unique_visitors?.toLocaleString() || '0' }}</div>
            <div class="card-change" :class="getChangeClass(overviewData.visitor_change)">
              {{ formatChange(overviewData.visitor_change) }}
            </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">⏱️</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_892d8d69") }}</div>
            <div class="card-value">{{ formatDuration(overviewData.avg_session_duration) }}</div>
            <div class="card-change" :class="getChangeClass(overviewData.duration_change)">
              {{ formatChange(overviewData.duration_change) }}
            </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">📈</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_312d3185") }}</div>
            <div class="card-value">{{ formatPercentage(overviewData.conversion_rate) }}</div>
            <div class="card-change" :class="getChangeClass(overviewData.conversion_change)">
              {{ formatChange(overviewData.conversion_change) }}
            </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">🏃</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_6eeb3cd") }}</div>
            <div class="card-value">{{ formatPercentage(overviewData.bounce_rate) }}</div>
            <div class="card-change" :class="getChangeClass(overviewData.bounce_change, true)">
              {{ formatChange(overviewData.bounce_change, true) }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Geographic Distribution -->
    <section class="geo-section">
      <h2>{{ $t("auto.k_e8c07369") }}</h2>
      <div class="geo-grid">
        <div class="geo-map">
          <canvas ref="worldMapChart"></canvas>
        </div>
        <div class="geo-stats">
          <h3>{{ $t("auto.k_b23e610e") }}</h3>
          <div class="country-list">
            <div v-for="(country, index) in geoData.top_countries" :key="country.code" 
                 class="country-item">
              <div class="country-rank">{{ index + 1 }}</div>
              <div class="country-info">
                <div class="country-name">{{ country.name }}</div>
                <div class="country-stats">
                  <span class="visitors">{{ country.visitors.toLocaleString() }} visitors</span>
                  <span class="percentage">{{ formatPercentage(country.percentage) }}</span>
                </div>
              </div>
              <div class="country-bar">
                <div class="bar-fill" :style="{ width: country.percentage + '%' }"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- User Behavior Analytics -->
    <section class="behavior-section">
      <h2>{{ $t("auto.k_7d5448e4") }}</h2>
      <div class="behavior-grid">
        <div class="behavior-card">
          <h3>{{ $t("auto.k_98ba0e62") }}</h3>
          <canvas ref="navigationChart"></canvas>
        </div>
        
        <div class="behavior-card">
          <h3>{{ $t("auto.k_a42620da") }}</h3>
          <div class="heatmap-container">
            <div class="heatmap-grid">
              <div v-for="(hour, index) in engagementHeatmap" :key="index" 
                   class="heatmap-cell" :class="getHeatmapClass(hour.value)">
                <div class="hour-label">{{ hour.hour }}:00</div>
                <div class="activity-level">{{ hour.value.toFixed(1) }}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="behavior-card">
          <h3>{{ $t("auto.k_12ebc7cf") }}</h3>
          <canvas ref="deviceChart"></canvas>
        </div>
        
        <div class="behavior-card">
          <h3>{{ $t("auto.k_31902e70") }}</h3>
          <canvas ref="browserChart"></canvas>
        </div>
      </div>
    </section>

    <!-- Conversion Funnel -->
    <section class="funnel-section">
      <h2>{{ $t("auto.k_92fc30b0") }}</h2>
      <div class="funnel-container">
        <div class="funnel-steps">
          <div v-for="(step, index) in funnelData" :key="step.step_id" 
               class="funnel-step" :class="{ completed: step.completed }">
            <div class="step-header">
              <div class="step-number">{{ index + 1 }}</div>
              <div class="step-name">{{ step.step_name }}</div>
              <div class="step-count">{{ step.session_count.toLocaleString() }}</div>
            </div>
            <div class="step-bar">
              <div class="bar-fill" :style="{ width: step.conversion_rate + '%' }"></div>
            </div>
            <div class="step-metrics">
              <span class="conversion-rate">{{ formatPercentage(step.conversion_rate) }}</span>
              <span class="drop-off" v-if="step.drop_off_rate > 0">
                -{{ formatPercentage(step.drop_off_rate) }} drop-off
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Real-time Session Feed -->
    <section class="sessions-section">
      <h2>{{ $t("auto.k_2f84824a") }}</h2>
      <div class="sessions-controls">
        <select v-model="sessionFilter">
          <option value="all">{{ $t("auto.k_861017c1") }}</option>
          <option value="active">{{ $t("auto.k_6250d94f") }}</option>
          <option value="conversions">{{ $t("auto.k_b561368") }}</option>
          <option value="high-value">{{ $t("auto.k_ff4eb4fc") }}</option>
        </select>
        <div class="session-count">
          {{ filteredSessions.length }} sessions
        </div>
      </div>
      
      <div class="sessions-feed">
        <div v-for="session in filteredSessions.slice(0, 20)" :key="session.session_id" 
             class="session-item" :class="getSessionClass(session)">
          <div class="session-header">
            <div class="session-info">
              <div class="session-id">{{ session.session_id.substring(0, 8) }}...</div>
              <div class="session-time">{{ formatTime(session.created_at) }}</div>
            </div>
            <div class="session-location">
              <span class="country-flag">{{ getCountryFlag(session.ip_info.country) }}</span>
              <span class="country-name">{{ session.ip_info.country || 'Unknown' }}</span>
            </div>
            <div class="session-device">
              <span class="device-icon">{{ getDeviceIcon(session.device_info.device_type) }}</span>
            </div>
          </div>
          
          <div class="session-metrics">
            <div class="metric">
              <span class="metric-label">{{ $t("auto.k_cb80f35") }}</span>
              <span class="metric-value">{{ formatDuration(session.duration) }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">{{ $t("auto.k_80919d9f") }}</span>
              <span class="metric-value">{{ session.pages_visited }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">{{ $t("auto.k_142dbe08") }}</span>
              <span class="metric-value">{{ session.conversions }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">{{ $t("auto.k_d70f5533") }}</span>
              <span class="metric-value security-score" :class="getSecurityClass(session.security_score)">
                {{ formatSecurityScore(session.security_score) }}
              </span>
            </div>
          </div>
          
          <div class="session-path" v-if="session.page_path">
            <div class="path-label">{{ $t("auto.k_fef99604") }}</div>
            <div class="path-steps">
              <span v-for="(page, index) in session.page_path.slice(0, 5)" :key="index" 
                    class="path-step">{{ page }}</span>
              <span v-if="session.page_path.length > 5" class="path-more">...</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Privacy & Compliance -->
    <section class="privacy-section">
      <h2>{{ $t("auto.k_45954f63") }}</h2>
      <div class="privacy-grid">
        <div class="privacy-card">
          <h3>{{ $t("auto.k_291db0df") }}</h3>
          <div class="privacy-info">
            <div class="info-item">
              <span class="info-label">{{ $t("auto.k_fd0d0980") }}</span>
              <span class="info-value compliant">{{ $t("auto.k_9a29a01") }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t("auto.k_4b4e30e") }}</span>
              <span class="info-value compliant">{{ $t("auto.k_257c538a") }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t("auto.k_4f327f0a") }}</span>
              <span class="info-value compliant">{{ $t("auto.k_c7c356eb") }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t("auto.k_4227a6de") }}</span>
              <span class="info-value compliant">{{ $t("auto.k_9a29a01") }}</span>
            </div>
          </div>
        </div>
        
        <div class="privacy-card">
          <h3>{{ $t("auto.k_8eed04e7") }}</h3>
          <canvas ref="retentionChart"></canvas>
        </div>
        
        <div class="privacy-card">
          <h3>{{ $t("auto.k_d75ba9bc") }}</h3>
          <div class="consent-stats">
            <div class="consent-item">
              <span class="consent-type">Analytics</span>
              <div class="consent-bar">
                <div class="consent-fill analytics" :style="{ width: consentData.analytics + '%' }"></div>
              </div>
              <span class="consent-percentage">{{ consentData.analytics }}%</span>
            </div>
            <div class="consent-item">
              <span class="consent-type">Marketing</span>
              <div class="consent-bar">
                <div class="consent-fill marketing" :style="{ width: consentData.marketing + '%' }"></div>
              </div>
              <span class="consent-percentage">{{ consentData.marketing }}%</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useQuery } from "@tanstack/vue-query";
import Chart from "chart.js/auto";
import { computed, onMounted, onUnmounted, ref } from "vue";

// Reactive data
const isLoading = ref(false);
const selectedTimeRange = ref("24h");
const sessionFilter = ref("all");

const overviewData = ref({
	active_sessions: 0,
	total_page_views: 0,
	unique_visitors: 0,
	avg_session_duration: 0,
	conversion_rate: 0,
	bounce_rate: 0,
	session_change: 0,
	page_view_change: 0,
	visitor_change: 0,
	duration_change: 0,
	conversion_change: 0,
	bounce_change: 0,
});

const geoData = ref({
	total_unique_ips: 0,
	top_countries: [],
});

const engagementHeatmap = ref([]);
const funnelData = ref([]);
const liveSessions = ref([]);
const consentData = ref({
	analytics: 95,
	marketing: 25,
});

// Chart instances
let worldMapChart = null;
const navigationChart = null;
let deviceChart = null;
let browserChart = null;
let retentionChart = null;

// Computed properties
const filteredSessions = computed(() => {
	let sessions = liveSessions.value;

	if (sessionFilter.value === "active") {
		sessions = sessions.filter((s) => s.status === "active");
	} else if (sessionFilter.value === "conversions") {
		sessions = sessions.filter((s) => s.conversions > 0);
	} else if (sessionFilter.value === "high-value") {
		sessions = sessions.filter((s) => s.session_value > 100);
	}

	return sessions.sort((a, b) => b.created_at - a.created_at);
});

// Methods
const refreshAnalytics = async () => {
	isLoading.value = true;

	try {
		// Fetch overview data
		const overviewResponse = await fetch(
			`/api/v1/sessions/analytics/overview?time_range=${selectedTimeRange.value}`,
		);
		overviewData.value = await overviewResponse.json();

		// Fetch geo data
		const geoResponse = await fetch(
			`/api/v1/sessions/analytics/geo-distribution?time_range=${selectedTimeRange.value}`,
		);
		const geoResult = await geoResponse.json();
		geoData.value = geoResult.geo_distribution;

		// Fetch live sessions
		const sessionsResponse = await fetch("/api/v1/sessions/live");
		liveSessions.value = await sessionsResponse.json();

		// Update charts
		updateCharts();
	} catch (error) {
		console.error("Failed to refresh analytics:", error);
	} finally {
		isLoading.value = false;
	}
};

const formatChange = (change, inverse = false) => {
	if (!change) return "0%";

	const sign = inverse ? (change < 0 ? "+" : "-") : change > 0 ? "+" : "-";
	return `${sign}${Math.abs(change).toFixed(1)}%`;
};

const formatPercentage = (value) => {
	return `${(value || 0).toFixed(1)}%`;
};

const formatDuration = (seconds) => {
	if (!seconds) return "0s";

	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	} else if (minutes > 0) {
		return `${minutes}m ${secs}s`;
	} else {
		return `${secs}s`;
	}
};

const formatTime = (timestamp) => {
	const now = new Date();
	const time = new Date(timestamp);
	const diff = now - time;

	if (diff < 60000) {
		// Less than 1 minute
		return "Just now";
	} else if (diff < 3600000) {
		// Less than 1 hour
		return `${Math.floor(diff / 60000)}m ago`;
	} else if (diff < 86400000) {
		// Less than 1 day
		return `${Math.floor(diff / 3600000)}h ago`;
	} else {
		return time.toLocaleDateString();
	}
};

const getChangeClass = (change, inverse = false) => {
	if (!change) return "neutral";

	const isPositive = inverse ? change < 0 : change > 0;
	return isPositive ? "positive" : "negative";
};

const getCountryFlag = (country) => {
	const flags = {
		US: "🇺🇸",
		GB: "🇬🇧",
		CA: "🇨🇦",
		AU: "🇦🇺",
		DE: "🇩🇪",
		FR: "🇫🇷",
		JP: "🇯🇵",
		IN: "🇮🇳",
		BR: "🇧🇷",
	};
	return flags[country] || "🌍";
};

const getDeviceIcon = (deviceType) => {
	const icons = {
		desktop: "🖥️",
		mobile: "📱",
		tablet: "📱",
		bot: "🤖",
	};
	return icons[deviceType] || "💻";
};

const getSessionClass = (session) => {
	const classes = [];

	if (session.status === "active") {
		classes.push("active");
	} else if (session.status === "suspicious") {
		classes.push("suspicious");
	}

	if (session.conversions > 0) {
		classes.push("conversion");
	}

	if (session.security_score < 0.5) {
		classes.push("low-security");
	}

	return classes.join(" ");
};

const getSecurityClass = (score) => {
	if (score >= 0.8) return "high";
	if (score >= 0.6) return "medium";
	if (score >= 0.4) return "low";
	return "critical";
};

const formatSecurityScore = (score) => {
	return `${(score * 100).toFixed(0)}%`;
};

const getHeatmapClass = (value) => {
	if (value >= 8) return "very-high";
	if (value >= 6) return "high";
	if (value >= 4) return "medium";
	if (value >= 2) return "low";
	return "very-low";
};

const exportData = () => {
	const data = {
		overview: overviewData.value,
		geo_distribution: geoData.value,
		sessions: liveSessions.value,
		timestamp: new Date().toISOString(),
	};

	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `analytics-export-${new Date().toISOString().split("T")[0]}.json`;
	a.click();
	URL.revokeObjectURL(url);
};

const initCharts = () => {
	// World Map Chart
	const worldMapCtx = document.querySelector('[ref="worldMapChart"]');
	if (worldMapCtx) {
		worldMapChart = new Chart(worldMapCtx, {
			type: "bubble",
			data: {
				datasets: [
					{
						label: "Sessions by Country",
						data: [],
						backgroundColor: "rgba(59, 130, 246, 0.6)",
						borderColor: "rgba(59, 130, 246, 1)",
					},
				],
			},
			options: {
				responsive: true,
				scales: {
					x: {
						type: "linear",
						position: "bottom",
						title: {
							display: true,
							text: "Longitude",
						},
					},
					y: {
						type: "linear",
						title: {
							display: true,
							text: "Latitude",
						},
					},
				},
			},
		});
	}

	// Device Distribution Chart
	const deviceCtx = document.querySelector('[ref="deviceChart"]');
	if (deviceCtx) {
		deviceChart = new Chart(deviceCtx, {
			type: "doughnut",
			data: {
				labels: ["Desktop", "Mobile", "Tablet"],
				datasets: [
					{
						data: [65, 30, 5],
						backgroundColor: [
							"rgba(59, 130, 246, 0.8)",
							"rgba(34, 197, 94, 0.8)",
							"rgba(251, 146, 60, 0.8)",
						],
					},
				],
			},
			options: {
				responsive: true,
				plugins: {
					legend: {
						position: "bottom",
					},
				},
			},
		});
	}

	// Browser Usage Chart
	const browserCtx = document.querySelector('[ref="browserChart"]');
	if (browserCtx) {
		browserChart = new Chart(browserCtx, {
			type: "bar",
			data: {
				labels: ["Chrome", "Firefox", "Safari", "Edge", "Other"],
				datasets: [
					{
						label: "Usage %",
						data: [65, 15, 10, 7, 3],
						backgroundColor: "rgba(59, 130, 246, 0.8)",
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

	// Data Retention Chart
	const retentionCtx = document.querySelector('[ref="retentionChart"]');
	if (retentionCtx) {
		retentionChart = new Chart(retentionCtx, {
			type: "line",
			data: {
				labels: ["Day 1", "Day 7", "Day 14", "Day 30"],
				datasets: [
					{
						label: "Data Retention %",
						data: [100, 85, 70, 30],
						borderColor: "rgba(239, 68, 68, 1)",
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
						max: 100,
						title: {
							display: true,
							text: "Retention (%)",
						},
					},
				},
			},
		});
	}
};

const updateCharts = () => {
	// Update world map with geo data
	if (worldMapChart && geoData.value.top_countries) {
		const mapData = geoData.value.top_countries.map((country) => ({
			x: country.longitude || 0,
			y: country.latitude || 0,
			r: Math.sqrt(country.visitors) * 2,
			label: country.name,
		}));

		worldMapChart.data.datasets[0].data = mapData;
		worldMapChart.update();
	}

	// Generate engagement heatmap data
	engagementHeatmap.value = [];
	for (let hour = 0; hour < 24; hour++) {
		// Simulate data - in production, fetch from API
		const value = Math.random() * 10;
		engagementHeatmap.value.push({
			hour,
			value,
		});
	}

	// Generate funnel data
	funnelData.value = [
		{
			step_id: "landing",
			step_name: "Landing Page",
			step_order: 1,
			session_count: 1000,
			completed: true,
			conversion_rate: 100,
			drop_off_rate: 0,
		},
		{
			step_id: "product_view",
			step_name: "Product View",
			step_order: 2,
			session_count: 750,
			completed: true,
			conversion_rate: 75,
			drop_off_rate: 25,
		},
		{
			step_id: "add_to_cart",
			step_name: "Add to Cart",
			step_order: 3,
			session_count: 300,
			completed: true,
			conversion_rate: 30,
			drop_off_rate: 60,
		},
		{
			step_id: "checkout",
			step_name: "Checkout",
			step_order: 4,
			session_count: 150,
			completed: true,
			conversion_rate: 15,
			drop_off_rate: 50,
		},
		{
			step_id: "purchase",
			step_name: "Purchase",
			step_order: 5,
			session_count: 50,
			completed: true,
			conversion_rate: 5,
			drop_off_rate: 66.7,
		},
	];
};

// Lifecycle hooks
onMounted(() => {
	refreshAnalytics();
	initCharts();

	// Set up real-time updates
	const interval = setInterval(refreshAnalytics, 30000); // Update every 30 seconds

	onUnmounted(() => {
		clearInterval(interval);

		// Destroy charts
		if (worldMapChart) worldMapChart.destroy();
		if (navigationChart) navigationChart.destroy();
		if (deviceChart) deviceChart.destroy();
		if (browserChart) browserChart.destroy();
		if (retentionChart) retentionChart.destroy();
	});
});
</script>

<style scoped>
.anonymous-analytics {
  padding: 2rem;
  max-width: 1600px;
  margin: 0 auto;
  background: #f8fafc;
  min-height: 100vh;
}

.analytics-header {
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

.refresh-btn, .export-btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.refresh-btn:hover, .export-btn:hover {
  background: #2563eb;
}

.overview-section, .geo-section, .behavior-section, .funnel-section, .sessions-section, .privacy-section {
  margin-bottom: 2rem;
}

.overview-section h2, .geo-section h2, .behavior-section h2, .funnel-section h2, .sessions-section h2, .privacy-section h2 {
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
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.card-change {
  font-size: 0.75rem;
  font-weight: 500;
}

.card-change.positive {
  color: #22c55e;
}

.card-change.negative {
  color: #ef4444;
}

.card-change.neutral {
  color: #6b7280;
}

.geo-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

.geo-map {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  min-height: 400px;
}

.geo-stats {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}

.geo-stats h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.country-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.country-item {
  display: grid;
  grid-template-columns: 30px 1fr 60px;
  gap: 0.5rem;
  align-items: center;
}

.country-rank {
  font-weight: 600;
  color: #6b7280;
}

.country-name {
  font-weight: 500;
  color: #1f2937;
}

.country-stats {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
}

.visitors {
  color: #1f2937;
}

.percentage {
  color: #6b7280;
}

.country-bar {
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}

.behavior-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1.5rem;
}

.behavior-card {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}

.behavior-card h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.heatmap-container {
  margin-top: 1rem;
}

.heatmap-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.25rem;
}

.heatmap-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.heatmap-cell.very-high {
  background: #dc2626;
  color: white;
}

.heatmap-cell.high {
  background: #f97316;
  color: white;
}

.heatmap-cell.medium {
  background: #f59e0b;
  color: #1f2937;
}

.heatmap-cell.low {
  background: #84cc16;
  color: white;
}

.heatmap-cell.very-low {
  background: #e5e7eb;
  color: #6b7280;
}

.hour-label {
  font-size: 0.625rem;
  margin-bottom: 0.25rem;
}

.activity-level {
  font-weight: 600;
}

.funnel-container {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 2rem;
}

.funnel-steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.funnel-step {
  position: relative;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
}

.funnel-step.completed {
  border-color: #22c55e;
  background: #f0fdf4;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: #3b82f6;
  color: white;
  border-radius: 50%;
  font-weight: 600;
  margin-right: 1rem;
}

.step-name {
  font-weight: 600;
  color: #1f2937;
  flex: 1;
}

.step-count {
  font-weight: 500;
  color: #6b7280;
}

.step-bar {
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.step-bar .bar-fill {
  height: 100%;
  background: #22c55e;
  transition: width 0.3s ease;
}

.step-metrics {
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
}

.conversion-rate {
  color: #22c55e;
  font-weight: 600;
}

.drop-off {
  color: #ef4444;
}

.sessions-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.session-count {
  font-size: 0.875rem;
  color: #6b7280;
}

.sessions-feed {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 600px;
  overflow-y: auto;
}

.session-item {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
  border-left: 4px solid #e5e7eb;
}

.session-item.active {
  border-left-color: #22c55e;
}

.session-item.suspicious {
  border-left-color: #ef4444;
}

.session-item.conversion {
  border-left-color: #f59e0b;
}

.session-item.low-security {
  border-left-color: #ef4444;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.session-info {
  flex: 1;
}

.session-id {
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.session-time {
  font-size: 0.875rem;
  color: #6b7280;
}

.session-location {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.country-flag {
  font-size: 1.25rem;
}

.country-name {
  font-weight: 500;
  color: #1f2937;
}

.session-device {
  font-size: 1.25rem;
}

.session-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.metric {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.metric-value {
  font-weight: 600;
  color: #1f2937;
}

.metric-value.security-score.high {
  color: #22c55e;
}

.metric-value.security-score.medium {
  color: #f59e0b;
}

.metric-value.security-score.low {
  color: #f97316;
}

.metric-value.security-score.critical {
  color: #ef4444;
}

.session-path {
  border-top: 1px solid #e5e7eb;
  padding-top: 1rem;
}

.path-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
}

.path-steps {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.path-step {
  background: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: #1f2937;
}

.path-more {
  color: #6b7280;
  font-style: italic;
}

.privacy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
}

.privacy-card {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}

.privacy-card h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.privacy-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.info-value.compliant {
  color: #22c55e;
  font-weight: 600;
}

.consent-stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.consent-item {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.consent-type {
  font-size: 0.875rem;
  color: #1f2937;
  min-width: 80px;
}

.consent-bar {
  flex: 1;
  height: 8px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}

.consent-fill.analytics {
  background: #22c55e;
}

.consent-fill.marketing {
  background: #f59e0b;
}

.consent-percentage {
  font-size: 0.875rem;
  color: #6b7280;
  min-width: 40px;
}
</style>
