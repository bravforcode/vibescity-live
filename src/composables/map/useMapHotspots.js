import { ref } from "vue";

export function useMapHotspots(mapRef, shops) {
	const heatmapGeoJson = ref({
		type: "FeatureCollection",
		features: [],
	});

	const updateHeatmapData = (densityData, allowHeatmap) => {
		if (!allowHeatmap || !mapRef.value || !shops.value) return;

		const features = [];

		// Optimization: O(1) hash map lookup instead of O(N^2) array finding
		const shopMap = new Map();
		shops.value.forEach((s) => {
			shopMap.set(String(s.id), s);
		});

		Object.entries(densityData).forEach(([shopId, count]) => {
			const shop = shopMap.get(String(shopId));
			if (shop?.lat && shop?.lng) {
				features.push({
					type: "Feature",
					geometry: {
						type: "Point",
						coordinates: [Number(shop.lng), Number(shop.lat)],
					},
					properties: {
						density: count,
					},
				});
			}
		});

		heatmapGeoJson.value.features = features;

		const source =
			mapRef.value.getSource?.("heatmap-source") ||
			mapRef.value.map?.getSource("heatmap-source");

		if (source) {
			source.setData(heatmapGeoJson.value);
		}
	};

	const addHeatmapLayer = (allowHeatmap) => {
		const map = mapRef.value?.map || mapRef.value;
		if (!map || !allowHeatmap) return;

		if (!map.getSource("heatmap-source")) {
			map.addSource("heatmap-source", {
				type: "geojson",
				data: heatmapGeoJson.value,
			});
		}

		if (!map.getLayer("heatmap-layer")) {
			map.addLayer(
				{
					id: "heatmap-layer",
					type: "heatmap",
					source: "heatmap-source",
					maxzoom: 15,
					paint: {
						"heatmap-weight": [
							"interpolate",
							["linear"],
							["get", "density"],
							0,
							0,
							10,
							1,
						],
						"heatmap-intensity": [
							"interpolate",
							["linear"],
							["zoom"],
							0,
							1,
							15,
							3,
						],
						"heatmap-color": [
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
						"heatmap-radius": [
							"interpolate",
							["linear"],
							["zoom"],
							0,
							2,
							15,
							20,
						],
						"heatmap-opacity": 0.7,
					},
				},
				"waterway-label",
			);
		}
	};

	const removeHeatmapLayer = () => {
		const map = mapRef.value?.map || mapRef.value;
		if (!map) return;

		if (map.getLayer("heatmap-layer")) map.removeLayer("heatmap-layer");
		if (map.getSource("heatmap-source")) map.removeSource("heatmap-source");
	};

	return {
		updateHeatmapData,
		addHeatmapLayer,
		removeHeatmapLayer,
	};
}
