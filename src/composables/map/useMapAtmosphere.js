import { computed, onUnmounted, ref, watch } from "vue";
import { DEFAULT_CITY } from "@/config/cityConfig";
import { WeatherLayer } from "../../components/map/layers/WeatherLayer";

const IS_E2E = import.meta.env.VITE_E2E === "true";

const TRAFFIC_DASH_FRAMES = [
	[0.8, 1.2, 0.8],
	[1.1, 0.9, 0.8],
	[1.4, 0.7, 0.9],
	[1.7, 0.6, 0.9],
];
const TRAFFIC_DASH_BASE = [1.1, 1.1, 0.8];

export function useMapAtmosphere(
	map,
	isMapReady,
	{
		allowAmbientFx,
		allowNeonPulse,
		allowWeatherFx,
		allowMapFog,
		isPerfRestricted,
		weatherCondition,
		isWeatherNight,
		shouldRunAtmosphere,
	},
) {
	// State
	let atmosphericAnimationRequest = null;
	let lastFirefliesUpdate = 0;
	let lastTrafficDashUpdate = 0;
	let trafficDashFrameIndex = 0;
	const firefliesData = ref({ type: "FeatureCollection", features: [] });
	const weatherLayer = new WeatherLayer();
	const currentMapZoom = ref(15);

	// --- Fireflies Logic ---
	const initFireflies = () => {
		const centerLat = DEFAULT_CITY.lat;
		const centerLng = DEFAULT_CITY.lng;
		const count = 40;
		const features = [];

		for (let i = 0; i < count; i++) {
			features.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [
						centerLng + (Math.random() - 0.5) * 0.05,
						centerLat + (Math.random() - 0.5) * 0.05,
					],
				},
				properties: {
					id: i,
					speed: 0.0001 + Math.random() * 0.0002,
					phase: Math.random() * Math.PI * 2,
					baseCoords: [
						centerLng + (Math.random() - 0.5) * 0.05,
						centerLat + (Math.random() - 0.5) * 0.05,
					],
				},
			});
		}
		firefliesData.value.features = features;
	};

	const ensureFirefliesLayer = () => {
		if (!map.value || !allowAmbientFx.value) return;
		if (!map.value.getSource("fireflies")) {
			initFireflies();
			map.value.addSource("fireflies", {
				type: "geojson",
				data: firefliesData.value,
			});
		}
		if (!map.value.getLayer("fireflies-layer")) {
			map.value.addLayer({
				id: "fireflies-layer",
				type: "circle",
				source: "fireflies",
				paint: {
					"circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 3],
					"circle-color": "#fbbf24",
					"circle-opacity": 0.8,
					"circle-blur": 1,
				},
			});
		}
	};

	const removeFirefliesLayer = () => {
		if (!map.value) return;
		if (map.value.getLayer("fireflies-layer")) {
			map.value.removeLayer("fireflies-layer");
		}
		if (map.value.getSource("fireflies")) {
			map.value.removeSource("fireflies");
		}
	};

	// --- Traffic / Neon Roads Logic ---
	const applyStaticNeonRoads = () => {
		if (!map.value) return;
		if (!map.value.isStyleLoaded?.()) return;
		if (map.value.getLayer("neon-roads-outer")) {
			map.value.setPaintProperty("neon-roads-outer", "line-opacity", 0.15);
		}
		if (map.value.getLayer("neon-roads-inner")) {
			map.value.setPaintProperty("neon-roads-inner", "line-opacity", 0.6);
			map.value.setPaintProperty("neon-roads-inner", "line-width", 1.2);
			map.value.setPaintProperty(
				"neon-roads-inner",
				"line-dasharray",
				TRAFFIC_DASH_BASE,
			);
		}
	};

	const resetTrafficDashState = () => {
		lastTrafficDashUpdate = 0;
		trafficDashFrameIndex = 0;
		applyStaticNeonRoads();
	};

	// --- Animation Loop ---
	const animateAtmosphere = (time) => {
		if (!map.value || !isMapReady.value) return;
		if (!shouldRunAtmosphere.value) {
			stopAtmosphereLoop();
			return;
		}

		if (document.hidden) {
			atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
			return;
		}
		if (!map.value.isStyleLoaded?.()) {
			atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
			return;
		}
		currentMapZoom.value = map.value.getZoom(); // Update local zoom ref
		if (currentMapZoom.value < 12) {
			atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
			return;
		}

		// 1. Neon Road Pulse
		if (allowNeonPulse.value) {
			const pulse = (Math.sin(time / 1000) + 1) / 2;
			if (map.value.getLayer("neon-roads-outer")) {
				map.value.setPaintProperty(
					"neon-roads-outer",
					"line-opacity",
					0.1 + pulse * 0.2,
				);
			}
			if (map.value.getLayer("neon-roads-inner")) {
				map.value.setPaintProperty(
					"neon-roads-inner",
					"line-opacity",
					0.4 + pulse * 0.4,
				);
				map.value.setPaintProperty(
					"neon-roads-inner",
					"line-width",
					0.5 + pulse * 1.5,
				);
			}

			const canAnimateTrafficDash =
				!IS_E2E &&
				!isPerfRestricted.value &&
				currentMapZoom.value >= 13 &&
				Boolean(map.value.getLayer("neon-roads-inner"));

			if (canAnimateTrafficDash && time - lastTrafficDashUpdate >= 120) {
				lastTrafficDashUpdate = time;
				trafficDashFrameIndex =
					(trafficDashFrameIndex + 1) % TRAFFIC_DASH_FRAMES.length;
				map.value.setPaintProperty(
					"neon-roads-inner",
					"line-dasharray",
					TRAFFIC_DASH_FRAMES[trafficDashFrameIndex],
				);
			} else if (!canAnimateTrafficDash && trafficDashFrameIndex !== 0) {
				resetTrafficDashState();
			}
		} else {
			resetTrafficDashState();
		}

		// 2. Fireflies Drift (throttled on low zoom)
		if (allowAmbientFx.value) {
			ensureFirefliesLayer();
			const z = map.value.getZoom();
			const interval = z < 13 ? 250 : 0;

			if (!interval || time - lastFirefliesUpdate > interval) {
				lastFirefliesUpdate = time;

				firefliesData.value.features.forEach((f) => {
					const p = f.properties;
					p.phase += 0.01;
					f.geometry.coordinates = [
						p.baseCoords[0] + Math.sin(p.phase) * 0.002,
						p.baseCoords[1] + Math.cos(p.phase) * 0.002,
					];
				});

				if (map.value.getSource("fireflies")) {
					map.value.getSource("fireflies").setData(firefliesData.value);
				}
			}
		} else {
			removeFirefliesLayer();
		}

		atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
	};

	const startAtmosphereLoop = () => {
		if (!map.value || !isMapReady.value || atmosphericAnimationRequest) return;
		atmosphericAnimationRequest = requestAnimationFrame(animateAtmosphere);
	};

	const stopAtmosphereLoop = () => {
		if (atmosphericAnimationRequest) {
			cancelAnimationFrame(atmosphericAnimationRequest);
			atmosphericAnimationRequest = null;
		}
		applyStaticNeonRoads();
	};

	// --- Fog & Weather Logic ---
	const fogDensityProfile = computed(() => {
		if (!allowWeatherFx.value) return "normal";
		return weatherCondition.value === "clouds" ||
			weatherCondition.value === "storm"
			? "thick"
			: "normal";
	});

	const applyFogSettings = () => {
		if (!map.value) return;
		if (!map.value.isStyleLoaded?.()) return;
		if (!allowMapFog.value) {
			try {
				map.value.setFog(null);
			} catch {}
			return;
		}
		const density = fogDensityProfile.value;
		const useNightPalette = Boolean(isWeatherNight.value);

		try {
			map.value.setFog({
				range: density === "thick" ? [0.35, 7.2] : [0.8, 9.5],
				color: useNightPalette ? "#1f2937" : "#2a3147",
				"horizon-blend": density === "thick" ? 0.44 : 0.26,
				"high-color": useNightPalette ? "#111827" : "#1f2937",
				"space-color": useNightPalette ? "#090b13" : "#111827",
				"star-intensity": useNightPalette ? 0.72 : 0.28,
			});
		} catch (e) {
			// Ignore style loading errors
		}
	};

	const getFirstExistingLayerId = (candidateIds = []) => {
		if (!map.value) return null;
		for (const id of candidateIds) {
			if (id && map.value.getLayer(id)) return id;
		}
		return null;
	};

	const updateWeatherVisuals = () => {
		if (!map.value || !isMapReady.value) return;

		if (!map.value.getLayer("weather-layer")) {
			const labelLayerId = getFirstExistingLayerId([
				"waterway-label",
				"road-label",
				"poi-label",
				"settlement-label",
			]);
			try {
				if (labelLayerId) {
					map.value.addLayer(weatherLayer, labelLayerId);
				} else {
					map.value.addLayer(weatherLayer);
				}
			} catch (e) {
				console.warn("Weather layer add failed", e);
			}
		}

		if (weatherCondition.value === "rain") {
			weatherLayer.setIntensity(0.5);
			weatherLayer.setWind(0.1, 0.1);
		} else if (weatherCondition.value === "storm") {
			weatherLayer.setIntensity(1.0);
			weatherLayer.setWind(0.5, 0.5);
		} else {
			weatherLayer.setIntensity(0);
		}
	};

	// --- 3D Buildings ---
	const remove3dBuildingLayers = () => {
		if (!map.value) return;
		["3d-buildings", "3d-buildings-cyber"].forEach((layerId) => {
			if (map.value.getLayer(layerId)) {
				map.value.removeLayer(layerId);
			}
		});
	};

	// Lifecycle
	onUnmounted(() => {
		stopAtmosphereLoop();
	});

	// Watchers to trigger updates
	watch(shouldRunAtmosphere, (shouldRun) => {
		if (shouldRun) startAtmosphereLoop();
		else stopAtmosphereLoop();
	});

	// Watch for Fog/Weather changes
	watch([allowMapFog, fogDensityProfile, isWeatherNight], applyFogSettings);
	watch([weatherCondition, isMapReady], updateWeatherVisuals);

	return {
		startAtmosphereLoop,
		stopAtmosphereLoop,
		applyFogSettings,
		updateWeatherVisuals,
		ensureFirefliesLayer,
		removeFirefliesLayer,
		remove3dBuildingLayers,
		resetTrafficDashState,
		// Expose for debugging if needed, or internal usage
		weatherLayer,
	};
}
