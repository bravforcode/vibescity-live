/**
 * useAdvancedLayers - Dynamic Map Layers System
 *
 * Features:
 * - Heat map with real-time intensity
 * - Traffic flow visualization
 * - Event zones with animations
 * - Weather overlay
 * - 3D buildings with lighting
 * - Custom POI layers
 * - Layer priority management
 */

import { computed, onUnmounted, ref, watch } from "vue";

const LAYER_PRIORITIES = {
	base: 0,
	roads: 10,
	buildings: 20,
	water: 30,
	parks: 40,
	traffic: 50,
	heatmap: 60,
	weather: 70,
	events: 80,
	markers: 90,
	labels: 100,
};

export function useAdvancedLayers(map, _options = {}) {
	const activeLayers = ref(new Set());
	const layerVisibility = ref({});
	const layerOpacity = ref({});

	// Heat map configuration
	const heatmapConfig = ref({
		enabled: false,
		intensity: 1.0,
		radius: 30,
		blur: 15,
		gradient: [
			"interpolate",
			["linear"],
			["heatmap-density"],
			0,
			"rgba(33,102,172,0)",
			0.2,
			"rgb(103,169,207)",
			0.4,
			"rgb(209,229,240)",
			0.6,
			"rgb(253,219,199)",
			0.8,
			"rgb(239,138,98)",
			1,
			"rgb(178,24,43)",
		],
	});

	// Traffic layer configuration
	const trafficConfig = ref({
		enabled: false,
		showCongestion: true,
		showIncidents: true,
		animationSpeed: 1.0,
		colors: {
			free: "#10b981",
			slow: "#f59e0b",
			congested: "#ef4444",
			blocked: "#7f1d1d",
		},
	});

	// Weather layer configuration
	const weatherConfig = ref({
		enabled: false,
		type: "none", // 'rain', 'clouds', 'fog', 'snow'
		intensity: 0.5,
		animated: true,
	});

	// 3D buildings configuration
	const buildingsConfig = ref({
		enabled: false,
		height: "auto",
		color: "#aaaaaa",
		opacity: 0.8,
		lighting: true,
	});

	// Add heat map layer
	const addHeatmapLayer = (data) => {
		if (!map.value || activeLayers.value.has("heatmap")) return;

		const sourceId = "heatmap-source";
		const layerId = "heatmap-layer";

		// Add source
		if (!map.value.getSource(sourceId)) {
			map.value.addSource(sourceId, {
				type: "geojson",
				data: {
					type: "FeatureCollection",
					features: data.map((point) => ({
						type: "Feature",
						geometry: {
							type: "Point",
							coordinates: [point.lng, point.lat],
						},
						properties: {
							intensity: point.intensity || 1,
						},
					})),
				},
			});
		}

		// Add layer
		if (!map.value.getLayer(layerId)) {
			map.value.addLayer(
				{
					id: layerId,
					type: "heatmap",
					source: sourceId,
					paint: {
						"heatmap-weight": [
							"interpolate",
							["linear"],
							["get", "intensity"],
							0,
							0,
							6,
							1,
						],
						"heatmap-intensity": heatmapConfig.value.intensity,
						"heatmap-color": heatmapConfig.value.gradient,
						"heatmap-radius": heatmapConfig.value.radius,
						"heatmap-opacity": 0.8,
					},
				},
				"waterway-label",
			);
		}

		activeLayers.value.add("heatmap");
	};

	// Add traffic layer with animation
	const addTrafficLayer = (trafficData) => {
		if (!map.value || activeLayers.value.has("traffic")) return;

		const sourceId = "traffic-source";
		const layerId = "traffic-layer";

		// Add source
		if (!map.value.getSource(sourceId)) {
			map.value.addSource(sourceId, {
				type: "geojson",
				data: {
					type: "FeatureCollection",
					features: trafficData.map((segment) => ({
						type: "Feature",
						geometry: {
							type: "LineString",
							coordinates: segment.coordinates,
						},
						properties: {
							speed: segment.speed,
							congestion: segment.congestion,
						},
					})),
				},
			});
		}

		// Add layer with dynamic colors
		if (!map.value.getLayer(layerId)) {
			map.value.addLayer({
				id: layerId,
				type: "line",
				source: sourceId,
				paint: {
					"line-color": [
						"case",
						["<", ["get", "speed"], 20],
						trafficConfig.value.colors.blocked,
						["<", ["get", "speed"], 40],
						trafficConfig.value.colors.congested,
						["<", ["get", "speed"], 60],
						trafficConfig.value.colors.slow,
						trafficConfig.value.colors.free,
					],
					"line-width": 4,
					"line-opacity": 0.8,
					"line-blur": 2,
				},
			});

			// Add animated flow effect
			animateTrafficFlow(layerId);
		}

		activeLayers.value.add("traffic");
	};

	// Animate traffic flow
	const animateTrafficFlow = (layerId) => {
		let offset = 0;
		const animate = () => {
			if (!map.value || !map.value.getLayer(layerId)) return;

			offset = (offset + trafficConfig.value.animationSpeed) % 20;

			map.value.setPaintProperty(layerId, "line-dasharray", [2, 4, offset]);

			requestAnimationFrame(animate);
		};

		animate();
	};

	// Add 3D buildings layer
	const add3DBuildingsLayer = () => {
		if (!map.value || activeLayers.value.has("buildings-3d")) return;

		const layerId = "buildings-3d";

		if (!map.value.getLayer(layerId)) {
			map.value.addLayer({
				id: layerId,
				source: "composite",
				"source-layer": "building",
				filter: ["==", "extrude", "true"],
				type: "fill-extrusion",
				minzoom: 15,
				paint: {
					"fill-extrusion-color": buildingsConfig.value.color,
					"fill-extrusion-height": [
						"interpolate",
						["linear"],
						["zoom"],
						15,
						0,
						15.05,
						["get", "height"],
					],
					"fill-extrusion-base": [
						"interpolate",
						["linear"],
						["zoom"],
						15,
						0,
						15.05,
						["get", "min_height"],
					],
					"fill-extrusion-opacity": buildingsConfig.value.opacity,
				},
			});

			// Add lighting if enabled
			if (buildingsConfig.value.lighting) {
				map.value.setLight({
					anchor: "viewport",
					color: "#ffffff",
					intensity: 0.4,
					position: [1.5, 90, 80],
				});
			}
		}

		activeLayers.value.add("buildings-3d");
	};

	// Add weather overlay
	const addWeatherLayer = () => {
		if (!map.value || activeLayers.value.has("weather")) return;

		const type = weatherConfig.value.type;
		if (type === "none") return;

		const layerId = `weather-${type}`;

		// Create canvas overlay for weather effects
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");

		canvas.width = map.value.getCanvas().width;
		canvas.height = map.value.getCanvas().height;

		// Add as custom layer
		map.value.addLayer({
			id: layerId,
			type: "custom",
			onAdd: function () {
				this.canvas = canvas;
			},
			render: () => {
				if (!weatherConfig.value.animated) return;

				ctx.clearRect(0, 0, canvas.width, canvas.height);

				switch (type) {
					case "rain":
						renderRain(ctx, canvas);
						break;
					case "snow":
						renderSnow(ctx, canvas);
						break;
					case "fog":
						renderFog(ctx, canvas);
						break;
					case "clouds":
						renderClouds(ctx, canvas);
						break;
				}

				map.value.triggerRepaint();
			},
		});

		activeLayers.value.add("weather");
	};

	// Render rain effect
	const renderRain = (ctx, canvas) => {
		const drops = 100 * weatherConfig.value.intensity;
		ctx.strokeStyle = "rgba(174, 194, 224, 0.5)";
		ctx.lineWidth = 1;

		for (let i = 0; i < drops; i++) {
			const x = Math.random() * canvas.width;
			const y = Math.random() * canvas.height;
			const length = 10 + Math.random() * 20;

			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x, y + length);
			ctx.stroke();
		}
	};

	// Render snow effect
	const renderSnow = (ctx, canvas) => {
		const flakes = 50 * weatherConfig.value.intensity;
		ctx.fillStyle = "rgba(255, 255, 255, 0.8)";

		for (let i = 0; i < flakes; i++) {
			const x = Math.random() * canvas.width;
			const y = Math.random() * canvas.height;
			const radius = 2 + Math.random() * 3;

			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	// Render fog effect
	const renderFog = (ctx, canvas) => {
		const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
		gradient.addColorStop(
			0,
			`rgba(200, 200, 200, ${weatherConfig.value.intensity * 0.3})`,
		);
		gradient.addColorStop(
			1,
			`rgba(200, 200, 200, ${weatherConfig.value.intensity * 0.1})`,
		);

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	};

	// Render clouds effect
	const renderClouds = (ctx, canvas) => {
		ctx.fillStyle = `rgba(255, 255, 255, ${weatherConfig.value.intensity * 0.2})`;

		for (let i = 0; i < 5; i++) {
			const x = Math.random() * canvas.width;
			const y = Math.random() * canvas.height * 0.5;
			const width = 100 + Math.random() * 200;
			const height = 50 + Math.random() * 100;

			ctx.beginPath();
			ctx.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	// Remove layer
	const removeLayer = (layerName) => {
		if (!map.value || !activeLayers.value.has(layerName)) return;

		const layerId = layerName.includes("-") ? layerName : `${layerName}-layer`;

		if (map.value.getLayer(layerId)) {
			map.value.removeLayer(layerId);
		}

		const sourceId = `${layerName}-source`;
		if (map.value.getSource(sourceId)) {
			map.value.removeSource(sourceId);
		}

		activeLayers.value.delete(layerName);
	};

	// Toggle layer visibility
	const toggleLayer = (layerName, visible) => {
		if (!map.value) return;

		const layerId = layerName.includes("-") ? layerName : `${layerName}-layer`;

		if (map.value.getLayer(layerId)) {
			map.value.setLayoutProperty(
				layerId,
				"visibility",
				visible ? "visible" : "none",
			);
		}

		layerVisibility.value[layerName] = visible;
	};

	// Set layer opacity
	const setLayerOpacity = (layerName, opacity) => {
		if (!map.value) return;

		const layerId = layerName.includes("-") ? layerName : `${layerName}-layer`;

		if (map.value.getLayer(layerId)) {
			const layer = map.value.getLayer(layerId);
			const opacityProp = `${layer.type}-opacity`;

			map.value.setPaintProperty(layerId, opacityProp, opacity);
		}

		layerOpacity.value[layerName] = opacity;
	};

	// Update layer data
	const updateLayerData = (layerName, data) => {
		if (!map.value) return;

		const sourceId = `${layerName}-source`;
		const source = map.value.getSource(sourceId);

		if (source?.setData) {
			source.setData(data);
		}
	};

	// Cleanup
	const cleanup = () => {
		activeLayers.value.forEach((layer) => {
			removeLayer(layer);
		});
	};

	onUnmounted(cleanup);

	return {
		activeLayers,
		layerVisibility,
		layerOpacity,
		heatmapConfig,
		trafficConfig,
		weatherConfig,
		buildingsConfig,
		addHeatmapLayer,
		addTrafficLayer,
		add3DBuildingsLayer,
		addWeatherLayer,
		removeLayer,
		toggleLayer,
		setLayerOpacity,
		updateLayerData,
		cleanup,
	};
}
