const IS_E2E = import.meta.env.VITE_E2E === "true";

export function useMapHeatmap(mapRef, allowHeatmapRef, shopsByIdRef) {
	const heatmapGeoJson = {
		type: "FeatureCollection",
		features: [],
	};

	const updateHeatmapData = (densityData) => {
		if (!allowHeatmapRef.value) return;
		// densityData: { shopId: count }
		if (!shopsByIdRef?.value || !densityData) return;

		const features = [];
		Object.entries(densityData).forEach(([shopId, count]) => {
			const shop = shopsByIdRef.value.get(String(shopId));
			if (shop?.lat && shop?.lng) {
				features.push({
					type: "Feature",
					geometry: {
						type: "Point",
						coordinates: [shop.lng, shop.lat],
					},
					properties: {
						density: count,
					},
				});
			}
		});

		heatmapGeoJson.features = features;

		// Update Map Source
		if (mapRef.value?.getSource("heatmap-source")) {
			mapRef.value.getSource("heatmap-source").setData(heatmapGeoJson);
		}
	};

	const removeHeatmapLayer = () => {
		if (!mapRef.value) return;
		if (mapRef.value.getLayer("heatmap-layer")) {
			mapRef.value.removeLayer("heatmap-layer");
		}
		if (mapRef.value.getSource("heatmap-source")) {
			mapRef.value.removeSource("heatmap-source");
		}
	};

	const getFirstExistingLayerId = (candidateIds = []) => {
		if (!mapRef.value) return null;
		for (const id of candidateIds) {
			if (id && mapRef.value.getLayer(id)) return id;
		}
		return null;
	};

	const addHeatmapLayer = () => {
		if (!mapRef.value) return;
		if (!allowHeatmapRef.value) {
			removeHeatmapLayer();
			return;
		}

		// Source
		if (!mapRef.value.getSource("heatmap-source")) {
			mapRef.value.addSource("heatmap-source", {
				type: "geojson",
				data: heatmapGeoJson,
			});
		}

		// Layer
		if (!mapRef.value.getLayer("heatmap-layer")) {
			const beforeId = getFirstExistingLayerId([
				"waterway-label",
				"road-label",
				"poi-label",
				"settlement-label",
				"place-label",
			]);
			const layer = {
				id: "heatmap-layer",
				type: "heatmap",
				source: "heatmap-source",
				maxzoom: 15,
				paint: {
					// Increase weight based on density
					"heatmap-weight": [
						"interpolate",
						["linear"],
						["get", "density"],
						0,
						0,
						10,
						1,
					],
					// Increase intensity as zoom level increases
					"heatmap-intensity": [
						"interpolate",
						["linear"],
						["zoom"],
						0,
						1,
						15,
						3,
					],
					// Color ramp
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
					// Radius
					"heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 15, 20],
					"heatmap-opacity": 0.7,
				},
			};
			try {
				if (beforeId) {
					mapRef.value.addLayer(layer, beforeId);
				} else {
					mapRef.value.addLayer(layer);
				}
			} catch (e) {
				if (!IS_E2E) {
					console.warn("Heatmap layer insertion failed:", e);
				}
			}
		}
	};

	return {
		updateHeatmapData,
		addHeatmapLayer,
		removeHeatmapLayer,
	};
}
