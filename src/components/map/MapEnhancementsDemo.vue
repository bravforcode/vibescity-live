<template>
	<div class="map-enhancements-demo">
		<!-- Control Panel -->
		<div class="control-panel">
			<h2>Map Enhancements Demo</h2>

			<!-- Performance Monitor -->
			<div class="section">
				<h3>Performance</h3>
				<div class="metrics">
					<div class="metric">
						<span class="label">FPS:</span>
						<span class="value" :class="fpsClass">{{ currentFPS }}</span>
					</div>
					<div class="metric">
						<span class="label">Mode:</span>
						<span class="value">{{ performanceMode }}</span>
					</div>
					<div class="metric">
						<span class="label">Memory:</span>
						<span class="value">{{ memoryUsage }}%</span>
					</div>
				</div>
			</div>

			<!-- Neon Effects -->
			<div class="section">
				<h3>Neon Effects</h3>
				<div class="controls">
					<label>
						<span>Time of Day:</span>
						<span class="value">{{ timeOfDay }}</span>
					</label>
					<label>
						<span>Intensity:</span>
						<span class="value">{{ (baseIntensity * 100).toFixed(0) }}%</span>
					</label>
					<label>
						<input type="checkbox" v-model="flickerEnabled" />
						<span>Flicker Effects</span>
					</label>
					<label>
						<input type="checkbox" v-model="pulseEnabled" />
						<span>Pulse Animation</span>
					</label>
					<label>
						<input type="checkbox" v-model="rainbowMode" />
						<span>Rainbow Mode</span>
					</label>
				</div>
			</div>

			<!-- Layers -->
			<div class="section">
				<h3>Map Layers</h3>
				<div class="controls">
					<button @click="toggleHeatmap" :class="{ active: hasHeatmap }">
						Heatmap
					</button>
					<button @click="toggleTraffic" :class="{ active: hasTraffic }">
						Traffic
					</button>
					<button @click="toggle3DBuildings" :class="{ active: has3DBuildings }">
						3D Buildings
					</button>
					<button @click="toggleWeather" :class="{ active: hasWeather }">
						Weather
					</button>
				</div>
			</div>

			<!-- Markers -->
			<div class="section">
				<h3>Markers</h3>
				<div class="controls">
					<label>
						<span>Shape:</span>
						<select v-model="markerShape">
							<option value="circle">Circle</option>
							<option value="square">Square</option>
							<option value="diamond">Diamond</option>
							<option value="star">Star</option>
							<option value="heart">Heart</option>
							<option value="pin">Pin</option>
						</select>
					</label>
					<label>
						<span>Animation:</span>
						<select v-model="markerAnimation">
							<option value="">None</option>
							<option value="bounce">Bounce</option>
							<option value="pulse">Pulse</option>
							<option value="shake">Shake</option>
							<option value="glow">Glow</option>
							<option value="spin">Spin</option>
							<option value="float">Float</option>
						</select>
					</label>
				</div>
			</div>

			<!-- Real-time -->
			<div class="section">
				<h3>Real-time Features</h3>
				<div class="metrics">
					<div class="metric">
						<span class="label">Connection:</span>
						<span class="value" :class="{ connected: isConnected }">
							{{ isConnected ? 'Connected' : 'Disconnected' }}
						</span>
					</div>
					<div class="metric">
						<span class="label">Live Venues:</span>
						<span class="value">{{ liveVenueCount }}</span>
					</div>
					<div class="metric">
						<span class="label">Events:</span>
						<span class="value">{{ liveEvents.length }}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Map Container -->
		<div ref="mapContainer" class="map-container" />
	</div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useAdvancedLayers } from "@/composables/map/useAdvancedLayers";
import { useAdvancedNeonEffects } from "@/composables/map/useAdvancedNeonEffects";
import { useEnhancedMarkers } from "@/composables/map/useEnhancedMarkers";
import { useMapCore } from "@/composables/map/useMapCore";
import { useMapPerformance } from "@/composables/map/useMapPerformance";
import { useRealtimeFeatures } from "@/composables/map/useRealtimeFeatures";

const mapContainer = ref(null);

// Core map
const { map, isMapReady, initMap } = useMapCore(mapContainer);

// Performance
const { currentFPS, performanceMode, memoryPressure, startMonitoring } =
	useMapPerformance(map);

const memoryUsage = computed(() => (memoryPressure.value * 100).toFixed(0));
const fpsClass = computed(() => {
	if (currentFPS.value >= 50) return "good";
	if (currentFPS.value >= 30) return "ok";
	return "bad";
});

// Neon effects
const {
	timeOfDay,
	baseIntensity,
	flickerEnabled,
	pulseEnabled,
	rainbowMode,
	init: initNeon,
} = useAdvancedNeonEffects();

// Layers
const {
	activeLayers,
	addHeatmapLayer,
	addTrafficLayer,
	add3DBuildingsLayer,
	addWeatherLayer,
	removeLayer,
	weatherConfig,
} = useAdvancedLayers(map);

const hasHeatmap = computed(() => activeLayers.value.has("heatmap"));
const hasTraffic = computed(() => activeLayers.value.has("traffic"));
const has3DBuildings = computed(() => activeLayers.value.has("buildings-3d"));
const hasWeather = computed(() => activeLayers.value.has("weather"));

const toggleHeatmap = () => {
	if (hasHeatmap.value) {
		removeLayer("heatmap");
	} else {
		addHeatmapLayer([
			{ lat: 18.7985, lng: 98.968, intensity: 5 },
			{ lat: 18.799, lng: 98.969, intensity: 3 },
		]);
	}
};

const toggleTraffic = () => {
	if (hasTraffic.value) {
		removeLayer("traffic");
	} else {
		addTrafficLayer([]);
	}
};

const toggle3DBuildings = () => {
	if (has3DBuildings.value) {
		removeLayer("buildings-3d");
	} else {
		add3DBuildingsLayer();
	}
};

const toggleWeather = () => {
	if (hasWeather.value) {
		removeLayer("weather");
	} else {
		weatherConfig.value.type = "rain";
		addWeatherLayer();
	}
};

// Markers
const markerShape = ref("circle");
const markerAnimation = ref("pulse");

// Real-time
const {
	isConnected,
	liveEvents,
	venueStatuses,
	init: initRealtime,
} = useRealtimeFeatures(map, {
	apiUrl: import.meta.env.VITE_API_URL,
});

const liveVenueCount = computed(() => {
	let count = 0;
	venueStatuses.value.forEach((status) => {
		if (status.isLive) count++;
	});
	return count;
});

onMounted(() => {
	// Initialize map
	initMap([98.968, 18.7985], 15);

	watch(isMapReady, (ready) => {
		if (!ready) return;

		// Start monitoring
		startMonitoring();

		// Initialize effects
		initNeon();

		// Initialize real-time
		initRealtime();
	});
});
</script>

<style scoped>
.map-enhancements-demo {
	display: flex;
	height: 100vh;
	background: #0f0f1a;
	color: white;
}

.control-panel {
	width: 320px;
	padding: 20px;
	background: #1a1a2e;
	overflow-y: auto;
	border-right: 1px solid #2a2a3e;
}

.control-panel h2 {
	margin: 0 0 20px 0;
	font-size: 20px;
	color: #06b6d4;
}

.section {
	margin-bottom: 24px;
	padding-bottom: 24px;
	border-bottom: 1px solid #2a2a3e;
}

.section:last-child {
	border-bottom: none;
}

.section h3 {
	margin: 0 0 12px 0;
	font-size: 14px;
	text-transform: uppercase;
	color: #9ca3af;
}

.metrics {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.metric {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 8px;
	background: #0f0f1a;
	border-radius: 4px;
}

.metric .label {
	font-size: 12px;
	color: #9ca3af;
}

.metric .value {
	font-weight: 600;
	font-size: 14px;
}

.metric .value.good {
	color: #10b981;
}

.metric .value.ok {
	color: #f59e0b;
}

.metric .value.bad {
	color: #ef4444;
}

.metric .value.connected {
	color: #10b981;
}

.controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.controls label {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
}

.controls label input[type="checkbox"] {
	width: 16px;
	height: 16px;
}

.controls label select {
	flex: 1;
	padding: 4px 8px;
	background: #0f0f1a;
	border: 1px solid #2a2a3e;
	border-radius: 4px;
	color: white;
	font-size: 12px;
}

.controls button {
	padding: 8px 16px;
	background: #2a2a3e;
	border: 1px solid #3a3a4e;
	border-radius: 4px;
	color: white;
	font-size: 13px;
	cursor: pointer;
	transition: all 0.2s;
}

.controls button:hover {
	background: #3a3a4e;
}

.controls button.active {
	background: #06b6d4;
	border-color: #06b6d4;
}

.map-container {
	flex: 1;
	position: relative;
}
</style>
