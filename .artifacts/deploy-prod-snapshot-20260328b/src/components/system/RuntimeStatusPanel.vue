<script setup>
/**
 * RuntimeStatusPanel - Dev-only debug panel for service status
 * Shows WebSocket, Analytics, and Edge Function health
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { analyticsService } from "../../services/analyticsService";
import { socketService } from "../../services/socketService";

const isExpanded = ref(false);
const wsStatus = ref({ configured: false, connected: false });
const analyticsStatus = ref({ circuitOpen: false, failureCount: 0 });
const isDev = import.meta.env.DEV;

let pollInterval = null;

const updateStatus = () => {
	wsStatus.value = socketService.getStatus?.() || {
		configured: false,
		connected: false,
	};
	analyticsStatus.value = analyticsService.getStatus?.() || {
		circuitOpen: false,
		failureCount: 0,
	};
};

const wsIndicator = computed(() => {
	if (!wsStatus.value.configured)
		return { color: "#6b7280", label: "WS: Not configured" };
	if (wsStatus.value.connected)
		return { color: "#22c55e", label: "WS: Connected" };
	return { color: "#ef4444", label: "WS: Disconnected" };
});

const analyticsIndicator = computed(() => {
	if (analyticsStatus.value.circuitOpen)
		return { color: "#ef4444", label: "Analytics: Circuit Open" };
	if (analyticsStatus.value.failureCount > 0)
		return {
			color: "#f59e0b",
			label: `Analytics: ${analyticsStatus.value.failureCount} failures`,
		};
	return { color: "#22c55e", label: "Analytics: OK" };
});

onMounted(() => {
	updateStatus();
	pollInterval = setInterval(updateStatus, 2000);
});

onUnmounted(() => {
	if (pollInterval) clearInterval(pollInterval);
});

const toggleExpand = () => {
	isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div
    v-if="isDev"
    class="runtime-status-panel"
    :class="{ expanded: isExpanded }"
    @click="toggleExpand"
  >
    <div class="status-dots" v-if="!isExpanded">
      <span
        class="dot"
        :style="{ background: wsIndicator.color }"
        :title="wsIndicator.label"
      />
      <span
        class="dot"
        :style="{ background: analyticsIndicator.color }"
        :title="analyticsIndicator.label"
      />
    </div>
    <div class="status-details" v-else>
      <div class="status-row">
        <span class="dot" :style="{ background: wsIndicator.color }" />
        <span>{{ wsIndicator.label }}</span>
      </div>
      <div class="status-row">
        <span class="dot" :style="{ background: analyticsIndicator.color }" />
        <span>{{ analyticsIndicator.label }}</span>
      </div>
      <div class="status-row hint">Click to collapse</div>
    </div>
  </div>
</template>

<style scoped>
.runtime-status-panel {
  position: fixed;
  bottom: 12px;
  left: 12px;
  z-index: 99999;
  background: rgba(15, 15, 26, 0.95);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: #d1d5db;
  backdrop-filter: blur(8px);
  transition: border-color 0.2s ease, padding 0.2s ease;
}

.runtime-status-panel:hover {
  border-color: rgba(139, 92, 246, 0.6);
}

.runtime-status-panel.expanded {
  padding: 12px;
}

.status-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hint {
  color: #6b7280;
  font-size: 10px;
  margin-top: 4px;
}
</style>
