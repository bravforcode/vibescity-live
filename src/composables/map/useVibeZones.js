import { computed, ref, watch } from "vue";
import zonesData from "../../data/zones.json";

export function useVibeZones(map, isMapReady) {
	const zonesSourceLoaded = ref(false);
	const activeZone = ref(null);
	const vibeOpacityExpression = [
		"interpolate",
		["linear"],
		["coalesce", ["to-number", ["get", "vibe_level"]], 0.5],
		0,
		0.06,
		1,
		0.22,
	];
	const glowOpacityExpression = [
		"interpolate",
		["linear"],
		["coalesce", ["to-number", ["get", "vibe_level"]], 0.5],
		0,
		0.18,
		1,
		0.42,
	];

	// Convert zones to GeoJSON format for MapLibre
	const zonesGeoJSON = computed(() => ({
		type: "FeatureCollection",
		features: zonesData.zones.map((zone) => ({
			type: "Feature",
			id: zone.id,
			geometry: zone.geometry,
			properties: {
				...zone.properties,
				id: zone.id,
			},
		})),
	}));

	// Add zones source and layers to map
	const addZonesLayers = () => {
		if (!map.value || !isMapReady.value || zonesSourceLoaded.value) return;

		try {
			// Add source
			map.value.addSource("vibe-zones", {
				type: "geojson",
				data: zonesGeoJSON.value,
			});

			// Add fill layer for zone areas
			map.value.addLayer({
				id: "vibe-zones-fill",
				type: "fill",
				source: "vibe-zones",
				paint: {
					"fill-color": ["get", "color"],
					"fill-opacity": vibeOpacityExpression,
				},
			});

			// Add border layer for zone outlines
			map.value.addLayer({
				id: "vibe-zones-border",
				type: "line",
				source: "vibe-zones",
				paint: {
					"line-color": ["get", "color"],
					"line-width": 2,
					"line-opacity": 0.8,
					"line-blur": 1,
				},
			});

			// Add glow effect
			map.value.addLayer({
				id: "vibe-zones-glow",
				type: "line",
				source: "vibe-zones",
				paint: {
					"line-color": ["coalesce", ["get", "glow_color"], ["get", "color"]],
					"line-width": 6,
					"line-opacity": glowOpacityExpression,
					"line-blur": 3,
				},
			});

			// Add labels for zones
			map.value.addLayer({
				id: "vibe-zones-labels",
				type: "symbol",
				source: "vibe-zones",
				layout: {
					"text-field": ["get", "name"],
					"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
					"text-size": 14,
					"text-anchor": "center",
					"text-justify": "center",
				},
				paint: {
					"text-color": "#ffffff",
					"text-halo-color": "#000000",
					"text-halo-width": 2,
					"text-opacity": 0.9,
				},
			});

			zonesSourceLoaded.value = true;

			// Add click handler for zones
			map.value.on("click", "vibe-zones-fill", handleZoneClick);

			// Add hover effect
			map.value.on("mouseenter", "vibe-zones-fill", () => {
				map.value.getCanvas().style.cursor = "pointer";
			});

			map.value.on("mouseleave", "vibe-zones-fill", () => {
				map.value.getCanvas().style.cursor = "";
			});
		} catch (error) {
			console.warn("[useVibeZones] Failed to add zones layers:", error);
		}
	};

	// Handle zone click
	const handleZoneClick = (e) => {
		const features = map.value.queryRenderedFeatures(e.point, {
			layers: ["vibe-zones-fill"],
		});

		if (features.length > 0) {
			const zone = features[0].properties;
			activeZone.value = zone;

			// Emit custom event for parent components
			const event = new CustomEvent("zoneSelected", {
				detail: { zone, coordinates: e.lngLat },
			});
			window.dispatchEvent(event);
		}
	};

	// Update zones data (for dynamic updates)
	const updateZones = () => {
		if (!map.value || !zonesSourceLoaded.value) return;

		const source = map.value.getSource("vibe-zones");
		if (source) {
			source.setData(zonesGeoJSON.value);
		}
	};

	// Remove zones layers
	const removeZonesLayers = () => {
		if (!map.value) return;

		const layers = [
			"vibe-zones-fill",
			"vibe-zones-border",
			"vibe-zones-glow",
			"vibe-zones-labels",
		];

		layers.forEach((layerId) => {
			if (map.value.getLayer(layerId)) {
				map.value.removeLayer(layerId);
			}
		});

		if (map.value.getSource("vibe-zones")) {
			map.value.removeSource("vibe-zones");
		}

		zonesSourceLoaded.value = false;
	};

	// Watch for map readiness
	watch(
		isMapReady,
		(ready) => {
			if (ready) {
				addZonesLayers();
			}
		},
		{ immediate: true },
	);

	// Watch for zones data changes
	watch(
		zonesGeoJSON,
		() => {
			updateZones();
		},
		{ deep: true },
	);

	return {
		zonesSourceLoaded,
		activeZone,
		addZonesLayers,
		removeZonesLayers,
		updateZones,
	};
}
