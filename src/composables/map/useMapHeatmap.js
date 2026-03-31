const IS_E2E = import.meta.env.VITE_E2E === "true";

const prefersReducedMotion =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-reduced-motion: reduce)").matches
		: false;

// HSL color ramp: chill (violet) → warm (orange) → hype (crimson)
const BREATH_COLORS = {
	chill: "hsla(260, 65%, 55%, 0)",
	low: "hsla(220, 70%, 60%, 1)",
	mid: "hsla(30, 90%, 65%, 1)",
	warm: "hsla(15, 85%, 55%, 1)",
	hot: "hsla(350, 80%, 50%, 1)",
	hype: "hsla(0, 90%, 45%, 1)",
};

export function useMapHeatmap(
	mapRef,
	allowHeatmapRef,
	shopsByIdRef,
	options = {},
) {
	const heatmapGeoJson = {
		type: "FeatureCollection",
		features: [],
	};

	let _breathRaf = null;
	let _breathing = false;
	let _observer = null;
	let _isVisible = true;
	let _maxDensity = 1;
	const canAnimateHeatmap = () => {
		const candidate = options?.animateHeatmap;
		if (candidate && typeof candidate === "object" && "value" in candidate) {
			return Boolean(candidate.value);
		}
		if (typeof candidate === "function") {
			return Boolean(candidate());
		}
		if (candidate === undefined) return true;
		return Boolean(candidate);
	};

	const updateHeatmapData = (densityData) => {
		if (!allowHeatmapRef.value) return;
		if (!shopsByIdRef?.value || !densityData) return;

		const features = [];
		let maxD = 1;
		Object.entries(densityData).forEach(([shopId, count]) => {
			const shop = shopsByIdRef.value.get(String(shopId));
			if (shop?.lat && shop?.lng) {
				if (count > maxD) maxD = count;
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

		_maxDensity = maxD;
		heatmapGeoJson.features = features;

		if (mapRef.value?.getSource("heatmap-source")) {
			mapRef.value.getSource("heatmap-source").setData(heatmapGeoJson);
		}
	};

	const removeHeatmapLayer = () => {
		if (!mapRef.value) return;
		stopBreathing();
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

		if (!mapRef.value.getSource("heatmap-source")) {
			mapRef.value.addSource("heatmap-source", {
				type: "geojson",
				data: heatmapGeoJson,
			});
		}

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
						BREATH_COLORS.chill,
						0.2,
						BREATH_COLORS.low,
						0.4,
						BREATH_COLORS.mid,
						0.6,
						BREATH_COLORS.warm,
						0.8,
						BREATH_COLORS.hot,
						1,
						BREATH_COLORS.hype,
					],
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

		if (canAnimateHeatmap()) {
			startBreathing();
			setupVisibilityObserver();
			return;
		}
		stopBreathing();
	};

	// ─── Breathing Animation ─────────────────────────────────────
	const startBreathing = () => {
		if (_breathing || prefersReducedMotion || !canAnimateHeatmap()) return;
		_breathing = true;

		const startTime = performance.now();
		const BASE_RADIUS_MIN = 15;
		const BASE_RADIUS_MAX = 25;
		const BASE_OPACITY = 0.7;

		const breathe = () => {
			if (!_breathing) return;
			if (!_isVisible || document.hidden) {
				_breathRaf = requestAnimationFrame(breathe);
				return;
			}

			const map = mapRef.value;
			if (!map || !map.getLayer("heatmap-layer")) {
				_breathRaf = requestAnimationFrame(breathe);
				return;
			}

			const t = (performance.now() - startTime) / 1000;

			// Density-driven frequency: more people → faster breathing
			const densityNorm = Math.min(_maxDensity / 20, 1);
			const omega = 1.5 + densityNorm * 3; // 1.5Hz chill → 4.5Hz hype

			// Sine-wave radius oscillation
			const breathFactor = Math.sin(t * omega) * 0.5 + 0.5; // 0..1
			const amplitude = 3 + densityNorm * 5; // 3px chill → 8px hype
			const radiusBase =
				BASE_RADIUS_MIN + (BASE_RADIUS_MAX - BASE_RADIUS_MIN) * densityNorm;
			const radius = radiusBase + amplitude * breathFactor;

			// Opacity pulse
			const opacityPulse = BASE_OPACITY + 0.15 * Math.sin(t * omega * 0.8);

			try {
				map.setPaintProperty("heatmap-layer", "heatmap-radius", [
					"interpolate",
					["linear"],
					["zoom"],
					0,
					2,
					15,
					radius,
				]);
				map.setPaintProperty("heatmap-layer", "heatmap-opacity", opacityPulse);
			} catch {
				// Layer might be removed mid-frame
			}

			_breathRaf = requestAnimationFrame(breathe);
		};

		_breathRaf = requestAnimationFrame(breathe);
	};

	const stopBreathing = () => {
		_breathing = false;
		if (_breathRaf) {
			cancelAnimationFrame(_breathRaf);
			_breathRaf = null;
		}
		destroyVisibilityObserver();
	};

	// ─── IntersectionObserver: pause when off-screen ─────────────
	const setupVisibilityObserver = () => {
		if (_observer || typeof IntersectionObserver === "undefined") return;
		const mapContainer = mapRef.value?.getContainer?.();
		if (!mapContainer) return;

		_observer = new IntersectionObserver(
			(entries) => {
				_isVisible = entries[0]?.isIntersecting ?? true;
			},
			{ threshold: 0.1 },
		);
		_observer.observe(mapContainer);
	};

	const destroyVisibilityObserver = () => {
		if (_observer) {
			_observer.disconnect();
			_observer = null;
		}
	};

	return {
		updateHeatmapData,
		addHeatmapLayer,
		removeHeatmapLayer,
		stopBreathing,
	};
}
