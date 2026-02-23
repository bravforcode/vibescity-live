import lottie from "lottie-web";

const pendingMapImages = new Set();

export function useMapLayers(map) {
	// --- Sources & Layers Definitions ---

	const addNeonRoads = () => {
		if (!map.value) return;
		if (map.value.getSource("neon-roads")) return;

		try {
			map.value.addSource("neon-roads", {
				type: "geojson",
				data: "/data/chiangmai-main-roads-lanes.geojson",
			});
			map.value.addLayer({
				id: "neon-roads-outer",
				type: "line",
				source: "neon-roads",
				paint: {
					"line-color": "#06b6d4",
					"line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 16, 4],
					"line-opacity": 0.15,
					"line-blur": 5,
				},
			});
			map.value.addLayer({
				id: "neon-roads-inner",
				type: "line",
				source: "neon-roads",
				paint: {
					"line-color": "#22d3ee",
					"line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 16, 1.5],
					"line-opacity": 0.6,
				},
			});
		} catch (e) {
			console.warn("Neon roads setup failed:", e);
		}
	};

	const loadMapImages = (mapInstance) => {
		const images = [
			// Base PNG pins (Mapbox-friendly)
			{ name: "pin-grey", url: "/images/pins/pin-gray.png" },
			{ name: "pin-red", url: "/images/pins/pin-red.png" },
			{ name: "pin-blue", url: "/images/pins/pin-blue.png" }, // ✅ Event Pin
			{ name: "pin-purple", url: "/images/pins/pin-purple.png" },
			// Aliases used by MapboxContainer
			{ name: "pin-normal", url: "/images/pins/pin-gray.png" },
			{ name: "pin-boost", url: "/images/pins/pin-red.png" },
			{ name: "pin-giant", url: "/images/pins/pin-purple.png" },
		];

		images.forEach((img) => {
			if (!mapInstance || mapInstance.hasImage(img.name)) return;
			if (pendingMapImages.has(img.name)) return;

			pendingMapImages.add(img.name);
			mapInstance.loadImage(img.url, (error, image) => {
				pendingMapImages.delete(img.name);
				if (error || !image) {
					console.warn(`Could not load image: ${img.name}`);
					return;
				}
				// Style reloads are async; double-check before addImage to prevent duplicate-name errors.
				if (mapInstance.hasImage(img.name)) return;
				try {
					mapInstance.addImage(img.name, image);
				} catch {
					// Ignore race-condition duplicates during rapid style switches.
				}
			});
		});
	};

	// ✅ High-Performance Coin Animation (Canvas -> Mapbox Image)
	const setupCoinAnimation = async () => {
		if (!map.value) return;

		const size = 64; // px
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");

		// Load Lottie
		try {
			const response = await fetch(
				"/images/animation/Fake 3D vector coin.json",
			);
			if (!response.ok) throw new Error("Coin animation not found");
			const animationData = await response.json();

			const animItem = lottie.loadAnimation({
				container: document.createElement("div"), // logical container
				renderer: "canvas",
				loop: true,
				autoplay: true,
				animationData: animationData,
				rendererSettings: {
					context: ctx,
					clearCanvas: true,
					preserveAspectRatio: "xMidYMid meet",
				},
			});

			// Sync Lottie frame to Mapbox repaint
			const updateImage = () => {
				if (!map.value || !map.value.getStyle()) return; // Map might be destroyed

				// Add or update the image in mapbox
				// We use addImage with { update: true } implicitly by managing it
				if (!map.value.hasImage("coin-anim")) {
					map.value.addImage("coin-anim", canvas, { pixelRatio: 2 });
				} else {
					map.value.updateImage("coin-anim", canvas);
				}

				requestAnimationFrame(updateImage);
			};

			// Start loop
			updateImage();
		} catch (e) {
			console.error("Failed to setup coin animation:", e);
		}
	};

	const addClusters = (sourceId, sourceData) => {
		if (!map.value) return;

		setupCoinAnimation(); // Start the coin engine

		try {
			// Update existing source or create new one
			if (map.value.getSource(sourceId)) {
				map.value.getSource(sourceId).setData(sourceData);
			} else {
				map.value.addSource(sourceId, {
					type: "geojson",
					data: sourceData,
					cluster: true,
					clusterMaxZoom: 14,
					clusterRadius: 50,
				});
			}

			// 1. Clusters Layer (Circles)
			if (!map.value.getLayer("clusters")) {
				map.value.addLayer({
					id: "clusters",
					type: "circle",
					source: sourceId,
					filter: ["has", "point_count"],
					paint: {
						"circle-color": [
							"step",
							["get", "point_count"],
							"#60a5fa",
							10,
							"#a855f7",
							30,
							"#ec4899",
						],
						"circle-radius": [
							"step",
							["get", "point_count"],
							20,
							100,
							30,
							750,
							40,
						],
						"circle-stroke-width": 2,
						"circle-stroke-color": "#fff",
						"circle-opacity": 0.8,
					},
				});
			}

			// 2. Cluster Count (Text)
			if (!map.value.getLayer("cluster-count")) {
				map.value.addLayer({
					id: "cluster-count",
					type: "symbol",
					source: sourceId,
					filter: ["has", "point_count"],
					layout: {
						"text-field": "{point_count_abbreviated}",
						"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
						"text-size": 12,
					},
					paint: { "text-color": "#ffffff" },
				});
			}

			// 3. Pins (Base Layer)
			if (!map.value.getLayer("unclustered-point")) {
				map.value.addLayer({
					id: "unclustered-point",
					type: "symbol",
					source: sourceId,
					filter: ["!", ["has", "point_count"]],
					layout: {
						"icon-image": [
							"case",
							["get", "is_giant"],
							"pin-purple", // Giant (Priority 1)
							["get", "is_event"],
							"pin-blue", // Events (Priority 2)
							["==", ["get", "status"], "LIVE"],
							"pin-red",
							"pin-grey", // default
						],
						"icon-size": [
							"interpolate",
							["linear"],
							["zoom"],
							12,
							0.5,
							16,
							0.7, // Adjusted size for better visual
							20,
							1.0,
						],
						"icon-allow-overlap": true,
						"icon-ignore-placement": true,
						"icon-anchor": "bottom",
					},
				});
			}

			// 4. Coins (Animation Layer) - Floats above pins
			if (!map.value.getLayer("unclustered-coins")) {
				map.value.addLayer({
					id: "unclustered-coins",
					type: "symbol",
					source: sourceId,
					filter: ["!", ["has", "point_count"]], // Show on all points (or filter by 'has_coin')
					layout: {
						"icon-image": "coin-anim", // The dynamic canvas image
						"icon-size": 0.8,
						"icon-offset": [0, -50], // Float above the pin (pin height ~56px)
						"icon-allow-overlap": true,
						"icon-ignore-placement": true,
					},
				});
			}
		} catch (err) {
			console.error("❌ [useMapLayers] addClusters error:", err);
		}
	};

	// 🎨 CYBERPUNK PASTEL PALETTE
	const CYBER_PALETTE = {
		deepBg: "#0b0321", // Deep Space
		water: "#181236", // Mystic Purple Water
		neonPink: "#ff7eb6", // Pastel Pink
		neonPurple: "#bd93f9", // Lavender
		neonBlue: "#8be9fd", // Cyber Blue
		roadDim: "#2d2b55", // Dimmed Roads
		skyHigh: "#6272a4", // Sky Gradient
	};

	const setCyberpunkAtmosphere = () => {
		if (!map.value) return;
		const m = map.value;
		if (!m.isStyleLoaded?.()) return;

		try {
			// 1. Atmosphere & Fog
			m.setFog({
				range: [0.8, 8],
				color: CYBER_PALETTE.deepBg,
				"horizon-blend": 0.2,
				"high-color": CYBER_PALETTE.skyHigh,
				"space-color": "#000000",
				"star-intensity": 0.7,
			});

			// 2. Water & Background
			if (m.getLayer("water"))
				m.setPaintProperty("water", "fill-color", CYBER_PALETTE.water);
			if (m.getLayer("background"))
				m.setPaintProperty(
					"background",
					"background-color",
					CYBER_PALETTE.deepBg,
				);
		} catch {
			// Style may still be transitioning; skip without noisy console output.
		}
	};

	const addCyberpunkBuildings = () => {
		if (!map.value) return;
		const m = map.value;
		if (!m.isStyleLoaded?.()) return;

		try {
			if (m.getLayer("3d-buildings-cyber")) return;

			const style = m.getStyle?.();
			const styleLayers = Array.isArray(style?.layers) ? style.layers : [];
			const labelLayerId = styleLayers.find(
				(layer) => layer?.type === "symbol" && layer?.layout?.["text-field"],
			)?.id;

			m.addLayer(
				{
					id: "3d-buildings-cyber",
					source: "composite",
					"source-layer": "building",
					filter: ["==", "extrude", "true"],
					type: "fill-extrusion",
					minzoom: 14,
					paint: {
						"fill-extrusion-color": [
							"interpolate",
							["linear"],
							["get", "height"],
							0,
							CYBER_PALETTE.deepBg,
							20,
							CYBER_PALETTE.neonPurple,
							60,
							CYBER_PALETTE.neonPink,
							150,
							CYBER_PALETTE.neonBlue,
						],
						"fill-extrusion-height": ["get", "height"],
						"fill-extrusion-base": ["get", "min_height"],
						"fill-extrusion-opacity": 0.9,
						"fill-extrusion-ambient-occlusion-intensity": 0.4,
						"fill-extrusion-ambient-occlusion-radius": 3,
					},
				},
				labelLayerId,
			);
		} catch {
			// Style can still be transitioning during fast route/theme changes.
		}
	};

	// Public API
	return {
		addNeonRoads,
		addClusters,
		loadMapImages,
		setCyberpunkAtmosphere,
		addCyberpunkBuildings,
	};
}
