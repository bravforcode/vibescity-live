<template>
  <div class="admin-dashboard">
    <!-- Admin Header -->
    <div class="admin-header">
      <h1>{{ $t("auto.k_d527813") }}</h1>
      <div class="header-controls">
        <div class="admin-info">
          <span class="admin-name">{{ adminUser.username }}</span>
          <span class="admin-role">Administrator</span>
        </div>
        <button @click="logout" class="logout-btn"> {{ $t("auto.k_b5c96afc") }} </button>
      </div>
    </div>

    <!-- System Status -->
    <section class="status-section">
      <h2>{{ $t("auto.k_f25f5d03") }}</h2>
      <div class="status-grid">
        <div class="status-card" :class="getStatusClass(systemHealth.redis_connected)">
          <div class="status-icon">🗄️</div>
          <div class="status-content">
            <div class="status-title">{{ $t("auto.k_5c7e3931") }}</div>
            <div class="status-value">{{ systemHealth.redis_connected ? 'Connected' : 'Disconnected' }}</div>
          </div>
        </div>
        
        <div class="status-card" :class="getStatusClass(systemHealth.google_sheets_connected)">
          <div class="status-icon">📊</div>
          <div class="status-content">
            <div class="status-title">{{ $t("auto.k_2e4a4c5a") }}</div>
            <div class="status-value">{{ systemHealth.google_sheets_connected ? 'Connected' : 'Disconnected' }}</div>
          </div>
        </div>
        
        <div class="status-card">
          <div class="status-icon">🔄</div>
          <div class="status-content">
            <div class="status-title">{{ $t("auto.k_225271d9") }}</div>
            <div class="status-value">{{ systemHealth.auto_sync_running ? 'Running' : 'Stopped' }}</div>
          </div>
        </div>
        
        <div class="status-card">
          <div class="status-icon">📈</div>
          <div class="status-content">
            <div class="status-title">{{ $t("auto.k_cfef954c") }}</div>
            <div class="status-value">{{ formatTime(systemHealth.last_sync) }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Data Overview -->
    <section class="overview-section">
      <h2>{{ $t("auto.k_9e3ac1bb") }}</h2>
      <div class="overview-grid">
        <div class="overview-card">
          <div class="card-icon">👥</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_942a80a6") }}</div>
            <div class="card-value">{{ dashboardData.total_sessions?.toLocaleString() || '0' }}</div>
            <div class="card-change positive">
              +{{ dashboardData.session_change || 0 }}{{ $t("auto.k_87717121") }} </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">🆕</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_de0efc79") }}</div>
            <div class="card-value">{{ dashboardData.unique_visitors?.toLocaleString() || '0' }}</div>
            <div class="card-change positive">
              +{{ dashboardData.visitor_change || 0 }}{{ $t("auto.k_87717121") }} </div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">⏱️</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_892d8d69") }}</div>
            <div class="card-value">{{ formatDuration(dashboardData.avg_session_duration) }}</div>
          </div>
        </div>
        
        <div class="overview-card">
          <div class="card-icon">📊</div>
          <div class="card-content">
            <div class="card-title">{{ $t("auto.k_8eed04e7") }}</div>
            <div class="card-value">{{ dashboardData.data_retention_days }} days</div>
            <div class="card-change neutral"> {{ $t("auto.k_6ceb3a92") }} </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Geographic Distribution -->
    <section class="geo-section">
      <h2>{{ $t("auto.k_e8c07369") }}</h2>
      <div class="geo-grid">
        <div class="geo-chart">
          <canvas ref="geoChart"></canvas>
        </div>
        <div class="geo-stats">
          <h3>{{ $t("auto.k_b23e610e") }}</h3>
          <div class="country-list">
            <div v-for="(country, index) in dashboardData.top_countries" :key="country.code" 
                 class="country-item">
              <div class="country-rank">{{ index + 1 }}</div>
              <div class="country-info">
                <div class="country-name">{{ country.name }}</div>
                <div class="country-stats">
                  <span class="sessions">{{ country.sessions.toLocaleString() }} sessions</span>
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

    <!-- Data Management -->
    <section class="management-section">
      <h2>{{ $t("auto.k_e42ca6ea") }}</h2>
      <div class="management-controls">
        <div class="control-group">
          <h3>{{ $t("auto.k_fe9d0c79") }}</h3>
          <div class="export-controls">
            <select v-model="exportConfig.data_type">
              <option value="sessions">Sessions</option>
              <option value="analytics">{{ $t("auto.k_de83d70f") }}</option>
              <option value="geo">{{ $t("auto.k_e261012a") }}</option>
              <option value="summary">{{ $t("auto.k_49af70f3") }}</option>
            </select>
            <select v-model="exportConfig.date_range">
              <option value="24h">{{ $t("auto.k_6f094336") }}</option>
              <option value="7d">{{ $t("auto.k_b58d8d6f") }}</option>
              <option value="30d">{{ $t("auto.k_4dcf4313") }}</option>
              <option value="">{{ $t("auto.k_f91f074d") }}</option>
            </select>
            <select v-model="exportConfig.format">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel</option>
            </select>
            <div class="checkbox-group">
              <label>
                <input :aria-label="$t('a11y.input_field')" type="checkbox" v-model="exportConfig.anonymize"> {{ $t("auto.k_faccfdc7") }} </label>
            </div>
            <button @click="exportData" class="export-btn" :disabled="isExporting">
              {{ isExporting ? 'Exporting...' : '📥 Export to Google Sheets' }}
            </button>
          </div>
        </div>
        
        <div class="control-group">
          <h3>{{ $t("auto.k_8eed04e7") }}</h3>
          <div class="retention-controls">
            <div class="retention-input">
              <label>{{ $t("auto.k_d5208a4e") }}</label>
              <input :aria-label="$t('a11y.input_field')" 
                type="number" 
                v-model="retentionConfig.retention_days" 
                min="1" 
                max="365"
                class="retention-input-field"
              >
            </div>
            <div class="retention-apply">
              <select v-model="retentionConfig.apply_to">
                <option value="all">{{ $t("auto.k_49fe66f4") }}</option>
                <option value="sessions">{{ $t("auto.k_6c3cadbe") }}</option>
                <option value="analytics">{{ $t("auto.k_169048ab") }}</option>
                <option value="geo">{{ $t("auto.k_1ec590b4") }}</option>
              </select>
            </div>
            <div class="retention-warning">
              <input :aria-label="$t('a11y.input_field')" type="checkbox" v-model="retentionConfig.confirm_action">
              <span>{{ $t("auto.k_522fc0fe") }}</span>
            </div>
            <button 
              @click="applyDataRetention" 
              class="retention-btn"
              :disabled="!retentionConfig.confirm_action || isProcessingRetention"
            >
              {{ isProcessingRetention ? 'Processing...' : '🗑️ Apply Retention Policy' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Google Sheets Configuration -->
    <section class="config-section">
      <h2>{{ $t("auto.k_b9b03596") }}</h2>
      <div class="config-controls">
        <div class="config-form">
          <div class="form-group">
            <label>{{ $t("auto.k_4b385d44") }}</label>
            <input :aria-label="$t('a11y.input_field')" 
              type="text" 
              v-model="sheetsConfig.spreadsheet_id" 
              :placeholder="$t('auto.k_6cbf65a5')"
              class="form-input"
            >
          </div>
          
          <div class="form-group">
            <label>{{ $t("auto.k_131e7dd3") }}</label>
            <input :aria-label="$t('a11y.input_field')" 
              type="text" 
              v-model="sheetsConfig.sheet_name" 
              :placeholder="$t('auto.k_36157502')"
              class="form-input"
            >
          </div>
          
          <div class="form-group">
            <label>{{ $t("auto.k_eac94859") }}</label>
            <div class="toggle-group">
              <label class="toggle-switch">
                <input :aria-label="$t('a11y.input_field')" type="checkbox" v-model="sheetsConfig.enable_auto_sync">
                <span class="toggle-slider"></span>
              </label>
              <span class="toggle-label">{{ sheetsConfig.enable_auto_sync ? 'Enabled' : 'Disabled' }}</span>
            </div>
          </div>
          
          <div class="form-group">
            <label>{{ $t("auto.k_8b8e1ed3") }}</label>
            <input :aria-label="$t('a11y.input_field')" 
              type="number" 
              v-model="sheetsConfig.sync_interval_minutes" 
              min="5" 
              max="1440"
              class="form-input"
            >
          </div>
          
          <div class="form-group">
            <label>{{ $t("auto.k_55691403") }}</label>
            <input :aria-label="$t('a11y.input_field')" 
              type="number" 
              v-model="sheetsConfig.data_retention_days" 
              min="1" 
              max="365"
              class="form-input"
            >
          </div>
          
          <div class="form-group">
            <label>{{ $t("auto.k_302dc2d1") }}</label>
            <div class="toggle-group">
              <label class="toggle-switch">
                <input :aria-label="$t('a11y.input_field')" type="checkbox" v-model="sheetsConfig.enable_anonymization">
                <span class="toggle-slider"></span>
              </label>
              <span class="toggle-label">{{ sheetsConfig.enable_anonymization ? 'Enabled' : 'Disabled' }}</span>
            </div>
          </div>
          
          <div class="form-actions">
            <button @click="testConnection" class="test-btn" :disabled="isTestingConnection">
              {{ isTestingConnection ? 'Testing...' : '🔗 Test Connection' }}
            </button>
            <button @click="saveConfig" class="save-btn" :disabled="isSavingConfig">
              {{ isSavingConfig ? 'Saving...' : '💾 Save Configuration' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Audit Log -->
    <section class="audit-section">
      <h2>{{ $t("auto.k_b2062f2c") }}</h2>
      <div class="audit-controls">
        <select v-model="auditFilter.event_type">
          <option value="">{{ $t("auto.k_bffe2d55") }}</option>
          <option value="admin_login">{{ $t("auto.k_6e2a0201") }}</option>
          <option value="admin_logout">{{ $t("auto.k_57b4e702") }}</option>
          <option value="data_export">{{ $t("auto.k_54eb826d") }}</option>
          <option value="config_update">{{ $t("auto.k_c6086e14") }}</option>
          <option value="data_retention">{{ $t("auto.k_8eed04e7") }}</option>
        </select>
        <button @click="refreshAuditLog" class="refresh-btn"> {{ $t("auto.k_970c2597") }} </button>
      </div>
      
      <div class="audit-log">
        <div v-for="entry in auditLog" :key="entry.timestamp" class="audit-entry">
          <div class="audit-header">
            <div class="audit-time">{{ formatTime(entry.timestamp) }}</div>
            <div class="audit-event">{{ entry.event_type }}</div>
            <div class="audit-user">{{ entry.details.username || 'System' }}</div>
          </div>
          <div class="audit-details">
            <div class="audit-ip">{{ $t("auto.k_32dc2812") }} {{ entry.details.ip_address || 'N/A' }}</div>
            <div class="audit-status" :class="getAuditStatusClass(entry.details.success)">
              {{ entry.details.success ? 'Success' : 'Failed' }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Status Messages -->
    <div v-if="statusMessage" class="status-message" :class="statusMessage.type">
      {{ statusMessage.text }}
    </div>
  </div>
</template>

<script setup>
import { useQuery } from "@tanstack/vue-query";
import Chart from "chart.js/auto";
import { computed, onMounted, ref } from "vue";

// Reactive data
const adminUser = ref({});
const systemHealth = ref({});
const dashboardData = ref({});
const auditLog = ref([]);
const statusMessage = ref(null);

const exportConfig = ref({
	data_type: "sessions",
	date_range: "24h",
	format: "json",
	anonymize: true,
});

const retentionConfig = ref({
	retention_days: 30,
	apply_to: "all",
	confirm_action: false,
});

const sheetsConfig = ref({
	spreadsheet_id: "",
	sheet_name: "Anonymous Analytics",
	enable_auto_sync: true,
	sync_interval_minutes: 15,
	data_retention_days: 30,
	enable_anonymization: true,
});

const isExporting = ref(false);
const isProcessingRetention = ref(false);
const isTestingConnection = ref(false);
const isSavingConfig = ref(false);

// Chart instances
let geoChart = null;

// Methods
const logout = async () => {
	try {
		const response = await fetch("/api/v1/admin/auth/logout", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
			},
		});

		if (response.ok) {
			localStorage.removeItem("admin_token");
			window.location.href = "/admin/login";
		}
	} catch (error) {
		showStatusMessage("Logout failed", "error");
	}
};

const exportData = async () => {
	isExporting.value = true;

	try {
		const response = await fetch("/api/v1/admin/export", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
			},
			body: JSON.stringify(exportConfig.value),
		});

		const result = await response.json();

		if (response.ok) {
			showStatusMessage("Data exported successfully", "success");
		} else {
			showStatusMessage(result.detail || "Export failed", "error");
		}
	} catch (error) {
		showStatusMessage("Export failed", "error");
	} finally {
		isExporting.value = false;
	}
};

const applyDataRetention = async () => {
	if (!retentionConfig.value.confirm_action) {
		showStatusMessage("Please confirm the data retention action", "warning");
		return;
	}

	isProcessingRetention.value = true;

	try {
		const response = await fetch("/api/v1/admin/data-retention", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
			},
			body: JSON.stringify(retentionConfig.value),
		});

		const result = await response.json();

		if (response.ok) {
			showStatusMessage("Data retention policy applied", "success");
			retentionConfig.value.confirm_action = false;
		} else {
			showStatusMessage(result.detail || "Data retention failed", "error");
		}
	} catch (error) {
		showStatusMessage("Data retention failed", "error");
	} finally {
		isProcessingRetention.value = false;
	}
};

const testConnection = async () => {
	isTestingConnection.value = true;

	try {
		const response = await fetch(
			"/api/v1/admin/google-sheets/test-connection",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
				},
			},
		);

		const result = await response.json();

		if (response.ok) {
			showStatusMessage("Google Sheets connection successful", "success");
		} else {
			showStatusMessage(result.detail || "Connection test failed", "error");
		}
	} catch (error) {
		showStatusMessage("Connection test failed", "error");
	} finally {
		isTestingConnection.value = false;
	}
};

const saveConfig = async () => {
	isSavingConfig.value = true;

	try {
		const response = await fetch("/api/v1/admin/google-sheets/config", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
			},
			body: JSON.stringify(sheetsConfig.value),
		});

		const result = await response.json();

		if (response.ok) {
			showStatusMessage("Configuration saved successfully", "success");
		} else {
			showStatusMessage(result.detail || "Configuration save failed", "error");
		}
	} catch (error) {
		showStatusMessage("Configuration save failed", "error");
	} finally {
		isSavingConfig.value = false;
	}
};

const refreshAuditLog = async () => {
	try {
		const response = await fetch(
			`/api/v1/admin/audit-log?event_type=${auditFilter.value.event_type || ""}`,
			{
				headers: {
					Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
				},
			},
		);

		const result = await response.json();

		if (response.ok) {
			auditLog.value = result.audit_log;
		}
	} catch (error) {
		showStatusMessage("Failed to refresh audit log", "error");
	}
};

const showStatusMessage = (text, type) => {
	statusMessage.value = { text, type };
	setTimeout(() => {
		statusMessage.value = null;
	}, 5000);
};

const getStatusClass = (status) => {
	return status ? "status-good" : "status-bad";
};

const getAuditStatusClass = (success) => {
	return success ? "audit-success" : "audit-failed";
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

const formatPercentage = (value) => {
	return `${(value || 0).toFixed(1)}%`;
};

// Load initial data
const loadDashboardData = async () => {
	try {
		const response = await fetch("/api/v1/admin/dashboard", {
			headers: {
				Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
			},
		});

		if (response.ok) {
			const data = await response.json();
			adminUser.value = data.admin_user;
			systemHealth.value = data.system_health;
			dashboardData.value = data;

			// Load Google Sheets config
			const configResponse = await fetch("/api/v1/admin/google-sheets/config", {
				headers: {
					Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
				},
			});

			if (configResponse.ok) {
				const config = await configResponse.json();
				sheetsConfig.value = config;
			}
		}
	} catch (error) {
		showStatusMessage("Failed to load dashboard data", "error");
	}
};

const initCharts = () => {
	// Geographic distribution chart
	const geoCtx = document.querySelector('[ref="geoChart"]');
	if (geoCtx && dashboardData.value.top_countries) {
		geoChart = new Chart(geoCtx, {
			type: "doughnut",
			data: {
				labels: dashboardData.value.top_countries.map((c) => c.name),
				datasets: [
					{
						data: dashboardData.value.top_countries.map((c) => c.sessions),
						backgroundColor: [
							"rgba(59, 130, 246, 0.8)",
							"rgba(34, 197, 94, 0.8)",
							"rgba(251, 146, 60, 0.8)",
							"rgba(239, 68, 68, 0.8)",
							"rgba(168, 85, 247, 0.8)",
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
};

const updateCharts = () => {
	if (geoChart && dashboardData.value.top_countries) {
		geoChart.data.labels = dashboardData.value.top_countries.map((c) => c.name);
		geoChart.data.datasets[0].data = dashboardData.value.top_countries.map(
			(c) => c.sessions,
		);
		geoChart.update();
	}
};

// Lifecycle hooks
onMounted(() => {
	// Check if admin is logged in
	if (!localStorage.getItem("admin_token")) {
		window.location.href = "/admin/login";
		return;
	}

	loadDashboardData();
	initCharts();

	// Set up periodic updates
	setInterval(() => {
		loadDashboardData();
	}, 30000); // Update every 30 seconds
});
</script>

<style scoped>
.admin-dashboard {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  background: #f8fafc;
  min-height: 100vh;
}

.admin-header {
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
  align-items: center;
  gap: 1rem;
}

.admin-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.admin-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 1.1rem;
}

.admin-role {
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.logout-btn {
  padding: 0.5rem 1rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.logout-btn:hover {
  background: #dc2626;
}

.status-section, .overview-section, .geo-section, .management-section, .config-section, .audit-section {
  margin-bottom: 2rem;
}

.status-section h2, .overview-section h2, .geo-section h2, .management-section h2, .config-section h2, .audit-section h2 {
  margin-bottom: 1rem;
  color: #1f2937;
}

.status-grid, .overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.status-card, .overview-card {
  display: flex;
  align-items: center;
  padding: 1.5rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #e5e7eb;
}

.status-card.status-good {
  border-left-color: #22c55e;
}

.status-card.status-bad {
  border-left-color: #ef4444;
}

.status-icon {
  font-size: 2rem;
  margin-right: 1rem;
}

.status-content, .card-content {
  flex: 1;
}

.status-title, .card-title {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.status-value, .card-value {
  font-size: 1.25rem;
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

.geo-chart {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  min-height: 300px;
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

.management-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

.control-group {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}

.control-group h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.export-controls, .retention-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.export-controls select, .retention-controls select {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  font-size: 0.875rem;
  color: #1f2937;
}

.export-btn, .retention-btn, .test-btn, .save-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s, background-color 0.2s, transform 0.2s;
}

.export-btn, .test-btn {
  background: #3b82f6;
  color: white;
}

.export-btn:hover, .test-btn:hover {
  background: #2563eb;
}

.retention-btn {
  background: #ef4444;
  color: white;
}

.retention-btn:hover {
  background: #dc2626;
}

.save-btn {
  background: #22c55e;
  color: white;
}

.save-btn:hover {
  background: #16a34a;
}

.retention-input {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.retention-input label {
  font-size: 0.875rem;
  color: #1f2937;
  min-width: 150px;
}

.retention-input-field {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  width: 100px;
}

.retention-apply {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.retention-warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.retention-warning span {
  font-size: 0.875rem;
  color: #6b7280;
}

.config-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.875rem;
  color: #1f2937;
  font-weight: 500;
}

.form-input {
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
}

.toggle-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
  border-radius: 24px;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: #3b82f6;
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(26px);
}

.toggle-label {
  font-size: 0.875rem;
  color: #1f2937;
}

.form-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.audit-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.audit-log {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  max-height: 400px;
  overflow-y: auto;
}

.audit-entry {
  border-bottom: 1px solid #e5e7eb;
  padding: 1rem;
}

.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.audit-time {
  font-size: 0.875rem;
  color: #6b7280;
}

.audit-event {
  font-weight: 600;
  color: #1f2937;
  background: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.audit-user {
  font-size: 0.875rem;
  color: #6b7280;
}

.audit-details {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.audit-ip {
  color: #6b7280;
}

.audit-status {
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}

.audit-status.audit-success {
  background: #dcfce7;
  color: #166534;
}

.audit-status.audit-failed {
  background: #fef2f2;
  color: #991b1b;
}

.status-message {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
}

.status-message.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #22c55e;
}

.status-message.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #ef4444;
}

.status-message.warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #f59e0b;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
