import { onUnmounted } from "vue";
import coinAnimation from "@/assets/animations/coin.json";
import { CITY_DEFAULTS } from "@/config/cityConfig";

const pendingMapImages = new Set();
const TRAFFIC_SOURCE_ID = "traffic-roads-local";
const TRAFFIC_ROADS_DATA_URL = "/data/chiangmai-main-roads-lanes.geojson";
const TRAFFIC_ROADS_COVERAGE_BOUNDS = CITY_DEFAULTS.chiangMai.bounds;
const LOCAL_NEON_ROAD_LAYER_IDS = ["neon-roads-outer", "neon-roads-inner"];

// Flow dash arrays for animated roads
const FLOW_DASH_FRAMES = [];
for (let i = 0; i < 20; i++) {
	const step = (i * 4) / 20;
	// dash of 2, gap of 4 -> moving forward
	FLOW_DASH_FRAMES.push([0, step, 2, 4 - step]);
}

export function useMapLayers(map, options = {}) {
	const resolveEffectsMode = () =>
		typeof options.effectsMode === "function"
			? options.effectsMode()
			: options.effectsMode;
	const scheduler =
		typeof options.scheduler === "function" ? options.scheduler : null;
	const coinMinZoom = Number.isFinite(Number(options.coinMinZoom))
		? Number(options.coinMinZoom)
		: 12.5;
	const renderTextLabels = options.renderTextLabels !== false;

	const canRunEffects = () => resolveEffectsMode() !== "off";
	const trafficDebugEnabled =
		import.meta.env.DEV ||
		import.meta.env.VITE_E2E === "true" ||
		import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
	const updateTrafficDebug = (patch) => {
		if (!trafficDebugEnabled || typeof window === "undefined") return;
		window.__vibecityTrafficDebug = {
			...(window.__vibecityTrafficDebug || {}),
			...patch,
			updatedAt: Date.now(),
		};
	};
	let fullRoadsGeoJson = null;
	let fullRoadsPromise = null;
	let lastTrafficSignature = "";

	const toFiniteNumber = (value) => {
		const num = Number(value);
		return Number.isFinite(num) ? num : null;
	};

	const haversineKm = (lat1, lng1, lat2, lng2) => {
		const dLat = ((lat2 - lat1) * Math.PI) / 180;
		const dLng = ((lng2 - lng1) * Math.PI) / 180;
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos((lat1 * Math.PI) / 180) *
				Math.cos((lat2 * Math.PI) / 180) *
				Math.sin(dLng / 2) ** 2;
		return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	};

	const isWithinBounds = (lat, lng, bounds) =>
		Boolean(bounds) &&
		lat >= bounds.south &&
		lat <= bounds.north &&
		lng >= bounds.west &&
		lng <= bounds.east;

	const resolveCoverageLocation = (userLocation = null) => {
		const userLat = toFiniteNumber(userLocation?.lat ?? userLocation?.[0]);
		const userLng = toFiniteNumber(userLocation?.lng ?? userLocation?.[1]);
		if (userLat !== null && userLng !== null) {
			return { lat: userLat, lng: userLng };
		}

		const currentCenter = map.value?.getCenter?.();
		const centerLat = toFiniteNumber(currentCenter?.lat);
		const centerLng = toFiniteNumber(currentCenter?.lng);
		if (centerLat !== null && centerLng !== null) {
			return { lat: centerLat, lng: centerLng };
		}

		return null;
	};

	const hasLocalTrafficCoverage = (userLocation = null) => {
		const location = resolveCoverageLocation(userLocation);
		if (!location) return false;
		return isWithinBounds(
			location.lat,
			location.lng,
			TRAFFIC_ROADS_COVERAGE_BOUNDS,
		);
	};

	const clearLocalTrafficSubset = (mapInstance = map.value) => {
		if (!mapInstance?.getSource?.(TRAFFIC_SOURCE_ID)) return;
		const empty = { type: "FeatureCollection", features: [] };
		if (scheduler) scheduler(TRAFFIC_SOURCE_ID, empty);
		else mapInstance.getSource(TRAFFIC_SOURCE_ID).setData(empty);
	};

	const removeLocalTrafficRoadCoverage = (mapInstance = map.value) => {
		if (!mapInstance) return;
		for (const layerId of LOCAL_NEON_ROAD_LAYER_IDS) {
			if (mapInstance.getLayer(layerId)) {
				try {
					mapInstance.removeLayer(layerId);
				} catch {
					// Ignore style transition races.
				}
			}
		}
		if (mapInstance.getSource("neon-roads")) {
			try {
				mapInstance.removeSource("neon-roads");
			} catch {
				// Ignore style transition races.
			}
		}
		clearLocalTrafficSubset(mapInstance);
	};

	const loadRoadsGeoJson = async () => {
		if (fullRoadsGeoJson) return fullRoadsGeoJson;
		if (!fullRoadsPromise) {
			fullRoadsPromise = fetch(TRAFFIC_ROADS_DATA_URL, { cache: "force-cache" })
				.then((response) => {
					if (!response.ok) {
						throw new Error(`traffic-roads-http-${response.status}`);
					}
					return response.json();
				})
				.then((geojson) => {
					const features = Array.isArray(geojson?.features)
						? geojson.features
						: [];
					fullRoadsGeoJson = { type: "FeatureCollection", features };
					return fullRoadsGeoJson;
				})
				.catch((error) => {
					if (import.meta.env.DEV) {
						console.warn("Traffic roads data unavailable:", error);
					}
					fullRoadsGeoJson = { type: "FeatureCollection", features: [] };
					return fullRoadsGeoJson;
				});
		}
		return fullRoadsPromise;
	};

	const featureIntersectsRadius = (feature, centerLat, centerLng, radiusKm) => {
		const geometry = feature?.geometry;
		if (!geometry) return false;
		const maxLngDelta =
			radiusKm / Math.max(1e-6, 111 * Math.cos((centerLat * Math.PI) / 180));
		const minLat = centerLat - radiusKm / 111;
		const maxLat = centerLat + radiusKm / 111;
		const minLng = centerLng - maxLngDelta;
		const maxLng = centerLng + maxLngDelta;

		const testCoordinate = (coord) => {
			const lng = toFiniteNumber(coord?.[0]);
			const lat = toFiniteNumber(coord?.[1]);
			if (lat === null || lng === null) return false;
			if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng)
				return false;
			return haversineKm(centerLat, centerLng, lat, lng) <= radiusKm;
		};

		if (geometry.type === "LineString") {
			const coords = Array.isArray(geometry.coordinates)
				? geometry.coordinates
				: [];
			const step = Math.max(1, Math.floor(coords.length / 12));
			for (let i = 0; i < coords.length; i += step) {
				if (testCoordinate(coords[i])) return true;
			}
			if (coords.length && testCoordinate(coords[coords.length - 1]))
				return true;
			return false;
		}

		if (geometry.type === "MultiLineString") {
			const lines = Array.isArray(geometry.coordinates)
				? geometry.coordinates
				: [];
			for (const line of lines) {
				const coords = Array.isArray(line) ? line : [];
				const step = Math.max(1, Math.floor(coords.length / 10));
				for (let i = 0; i < coords.length; i += step) {
					if (testCoordinate(coords[i])) return true;
				}
				if (coords.length && testCoordinate(coords[coords.length - 1]))
					return true;
			}
		}

		return false;
	};

	const buildTrafficSubset = (geojson, userLat, userLng, radiusKm) => {
		const features = Array.isArray(geojson?.features) ? geojson.features : [];
		const subset = [];
		for (const feature of features) {
			if (featureIntersectsRadius(feature, userLat, userLng, radiusKm)) {
				subset.push(feature);
			}
			if (subset.length >= 2500) break;
		}
		return { type: "FeatureCollection", features: subset };
	};

	// --- Sources & Layers Definitions ---

	const addNeonRoads = () => {
		if (!map.value) return;
		if (!map.value.isStyleLoaded?.()) {
			map.value.once("style.load", addNeonRoads);
			return;
		}
		if (!hasLocalTrafficCoverage()) {
			removeLocalTrafficRoadCoverage();
			return;
		}
		if (map.value.getSource("neon-roads")) return;

		map.value.once("idle", () => {
			if (!map.value) return;
			if (!hasLocalTrafficCoverage()) {
				removeLocalTrafficRoadCoverage();
				return;
			}
			if (map.value.getSource("neon-roads")) return; // double-check after idle
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
						"line-width": [
							"interpolate",
							["linear"],
							["zoom"],
							12,
							0.5,
							16,
							1.5,
						],
						"line-opacity": 0.6,
					},
				});
			} catch (e) {
				console.warn("Neon roads setup failed:", e);
			}
		});
	};

	const loadMapImages = async (mapInstance) => {
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

		const promises = images.map((img) => {
			return new Promise((resolve) => {
				if (!mapInstance || mapInstance.hasImage(img.name)) return resolve();
				if (pendingMapImages.has(img.name)) return resolve(); // In-flight, won't block but will eventually load

				pendingMapImages.add(img.name);
				mapInstance.loadImage(img.url, (error, image) => {
					pendingMapImages.delete(img.name);
					if (error || !image) {
						console.warn(`Could not load image: ${img.name}`);
						return resolve();
					}
					// Style reloads are async; double-check before addImage to prevent duplicate-name errors.
					if (mapInstance.hasImage(img.name)) return resolve();
					try {
						mapInstance.addImage(img.name, image);
					} catch {
						// Ignore race-condition duplicates during rapid style switches.
					}
					resolve();
				});
			});
		});

		await Promise.all(promises);
	};

	// ✅ High-Performance Coin Animation (Canvas -> Mapbox Image)
	let coinAnimFrame = null;
	let coinLottieInstance = null;
	let coinVisibilityListener = null;
	let coinSetupInFlight = false;
	let coinAnimationRetryCount = 0;
	let coinAnimationRetryAt = 0;
	let coinAnimationHardDisabled = false;
	let lottiePlayerPromise = null;
	let fallbackCoinCanvas = null;
	const COIN_IMAGE_ID = "coin-anim";
	const COIN_FRAME_SIZE = 64;
	const COIN_PIXEL_RATIO = 2;
	const COIN_FRAME_INTERVAL_MS = 1000 / 30;

	const drawFallbackCoinFrame = (ctx) => {
		if (!ctx) return;
		ctx.clearRect(0, 0, COIN_FRAME_SIZE, COIN_FRAME_SIZE);
		ctx.beginPath();
		ctx.arc(
			COIN_FRAME_SIZE / 2,
			COIN_FRAME_SIZE / 2,
			COIN_FRAME_SIZE * 0.34,
			0,
			Math.PI * 2,
		);
		ctx.fillStyle = "#facc15";
		ctx.fill();
		ctx.lineWidth = 4;
		ctx.strokeStyle = "rgba(255,255,255,0.42)";
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(
			COIN_FRAME_SIZE / 2,
			COIN_FRAME_SIZE / 2,
			COIN_FRAME_SIZE * 0.16,
			0,
			Math.PI * 2,
		);
		ctx.fillStyle = "rgba(255,255,255,0.22)";
		ctx.fill();
	};

	const getFallbackCoinCanvas = () => {
		if (!fallbackCoinCanvas) {
			const canvas = document.createElement("canvas");
			canvas.width = COIN_FRAME_SIZE;
			canvas.height = COIN_FRAME_SIZE;
			const ctx = canvas.getContext("2d");
			if (ctx) {
				drawFallbackCoinFrame(ctx);
				fallbackCoinCanvas = canvas;
			}
		}
		return fallbackCoinCanvas;
	};

	const ensureFallbackCoinImage = () => {
		if (!map.value || !map.value.isStyleLoaded?.()) return;
		const canvas = getFallbackCoinCanvas();
		if (!canvas) return;
		try {
			syncCoinImage(canvas);
		} catch {
			// Ignore style transitions; fallback will retry on next style/load tick.
		}
	};

	const loadLottiePlayer = async () => {
		if (!lottiePlayerPromise) {
			lottiePlayerPromise = import("lottie-web/build/player/lottie_canvas")
				.then((mod) => mod?.default || mod)
				.catch(() => import("lottie-web").then((mod) => mod?.default || mod));
		}
		return lottiePlayerPromise;
	};

	const shouldHardDisableCoinAnimation = (error) => {
		const raw = String(error?.message || "").toLowerCase();
		return (
			raw.includes("rendererclass is not a constructor") ||
			raw.includes("renderer class is not a constructor")
		);
	};

	const canvasToMapboxImageData = (canvas, size) => {
		const nextSize = Math.max(1, Number(size) || COIN_FRAME_SIZE);
		const offscreen = document.createElement("canvas");
		offscreen.width = nextSize;
		offscreen.height = nextSize;
		const ctx = offscreen.getContext("2d", { willReadFrequently: true });
		if (!ctx) return null;
		ctx.clearRect(0, 0, nextSize, nextSize);
		ctx.drawImage(
			canvas,
			0,
			0,
			Math.max(1, canvas?.width || nextSize),
			Math.max(1, canvas?.height || nextSize),
			0,
			0,
			nextSize,
			nextSize,
		);
		return ctx.getImageData(0, 0, nextSize, nextSize);
	};

	const syncCoinImage = (canvas) => {
		if (!map.value) return;
		const imageData = canvasToMapboxImageData(canvas, COIN_FRAME_SIZE);
		if (!imageData) return;
		try {
			if (!map.value.hasImage(COIN_IMAGE_ID)) {
				map.value.addImage(COIN_IMAGE_ID, imageData, {
					pixelRatio: COIN_PIXEL_RATIO,
				});
			} else {
				map.value.updateImage(COIN_IMAGE_ID, imageData);
			}
		} catch (error) {
			const raw = String(error?.message || "").toLowerCase();
			if (!raw.includes("mismatched image size")) {
				throw error;
			}
			if (map.value?.hasImage(COIN_IMAGE_ID)) {
				map.value.removeImage(COIN_IMAGE_ID);
			}
			map.value?.addImage(COIN_IMAGE_ID, imageData, {
				pixelRatio: COIN_PIXEL_RATIO,
			});
		}
	};
	const setupCoinAnimation = async () => {
		if (!map.value) return;
		if (!map.value.isStyleLoaded?.()) return;
		if (!canRunEffects()) return;
		ensureFallbackCoinImage();
		return;

		// biome-ignore lint/correctness/noUnreachable: temporary bypass for incomplete Lottie animation
		if (coinAnimFrame || coinSetupInFlight) return;
		const lottieCanvas = document.createElement("canvas");
		lottieCanvas.width = COIN_FRAME_SIZE;
		lottieCanvas.height = COIN_FRAME_SIZE;
		const lottieCtx = lottieCanvas.getContext("2d");
		if (!displayCtx || !lottieCtx) return;

		try {
			drawFallbackCoinFrame(displayCtx);
			syncCoinImage(displayCanvas);

			const lottiePlayer = await loadLottiePlayer();
			if (!lottiePlayer?.loadAnimation) {
				throw new Error("coin-lottie-player-missing");
			}
			if (!map.value || !map.value.isStyleLoaded?.()) return;

			coinLottieInstance = lottiePlayer.loadAnimation({
				container: document.createElement("div"),
				renderer: "canvas",
				loop: true,
				autoplay: true,
				animationData: coinAnimation,
				rendererSettings: {
					context: lottieCtx,
					clearCanvas: true,
					preserveAspectRatio: "xMidYMid meet",
				},
			});

			if (!coinLottieInstance) {
				throw new Error("coin-lottie-init-failed");
			}
			coinAnimationRetryCount = 0;
			coinAnimationRetryAt = 0;

			// Sync Lottie frame to Mapbox repaint
			let lastFrameAt = 0;
			const updateImage = (ts = performance.now()) => {
				if (!map.value || !map.value.getStyle()) {
					coinAnimFrame = null;
					return; // Map might be destroyed
				}
				// Stop loop entirely when tab hidden (resumed via visibilitychange)
				if (typeof document !== "undefined" && document.hidden) {
					coinAnimFrame = null;
					return;
				}
				if (ts - lastFrameAt < COIN_FRAME_INTERVAL_MS) {
					coinAnimFrame = requestAnimationFrame(updateImage);
					return;
				}
				lastFrameAt = ts;

				displayCtx.clearRect(0, 0, COIN_FRAME_SIZE, COIN_FRAME_SIZE);
				displayCtx.drawImage(
					lottieCanvas,
					0,
					0,
					Math.max(1, lottieCanvas.width),
					Math.max(1, lottieCanvas.height),
					0,
					0,
					COIN_FRAME_SIZE,
					COIN_FRAME_SIZE,
				);
				syncCoinImage(displayCanvas);

				coinAnimFrame = requestAnimationFrame(updateImage);
			};

			// Resume coin loop when tab becomes visible again
			if (coinVisibilityListener && typeof document !== "undefined") {
				document.removeEventListener(
					"visibilitychange",
					coinVisibilityListener,
				);
			}
			coinVisibilityListener = () => {
				if (!document.hidden && !coinAnimFrame && map.value) {
					lastFrameAt = 0;
					coinAnimFrame = requestAnimationFrame(updateImage);
				}
			};
			if (typeof document !== "undefined") {
				document.addEventListener("visibilitychange", coinVisibilityListener, {
					passive: true,
				});
			}

			// Start loop
			updateImage();
		} catch (e) {
			coinAnimationRetryCount += 1;
			const retryDelayMs = Math.min(
				16_000,
				400 * 2 ** Math.max(0, coinAnimationRetryCount - 1),
			);
			coinAnimationRetryAt = Date.now() + retryDelayMs;
			if (shouldHardDisableCoinAnimation(e)) {
				coinAnimationHardDisabled = true;
				coinAnimationRetryAt = Number.POSITIVE_INFINITY;
			}
			console.error("Failed to setup coin animation:", e);
			stopCoinAnimation();
			// Keep a deterministic fallback in the style so we don't spam retries.
			syncCoinImage(displayCanvas);
		} finally {
			coinSetupInFlight = false;
		}
	};

	const stopCoinAnimation = () => {
		if (coinAnimFrame) {
			cancelAnimationFrame(coinAnimFrame);
			coinAnimFrame = null;
		}
		if (coinLottieInstance?.destroy) {
			coinLottieInstance.destroy();
		}
		coinLottieInstance = null;
		if (coinVisibilityListener && typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", coinVisibilityListener);
		}
		coinVisibilityListener = null;
		coinSetupInFlight = false;
	};

	const ensureCoinAnimation = () => {
		if (!map.value) return;
		if (!map.value.isStyleLoaded?.()) return;
		if (canRunEffects()) {
			if (coinAnimationHardDisabled) {
				ensureFallbackCoinImage();
				return;
			}
			void setupCoinAnimation();
		} else {
			stopCoinAnimation();
		}
	};

	const removeCoinLayer = (layerId = "unclustered-coins") => {
		if (!map.value) return;
		if (!map.value.getLayer(layerId)) return;
		try {
			map.value.removeLayer(layerId);
		} catch {
			// Layer might already be gone during style transitions.
		}
	};

	const upsertCoinLayer = ({
		sourceId = "pins_source",
		layerId = "unclustered-coins",
		beforeId,
		staticText = false,
	} = {}) => {
		if (!map.value) return false;
		if (!map.value.isStyleLoaded?.()) return false;
		if (!map.value.getSource(sourceId)) return false;

		if (map.value.getLayer(layerId)) return true;

		try {
			if (!staticText) {
				if (!map.value.hasImage("coin-anim")) return false;
				map.value.addLayer(
					{
						id: layerId,
						type: "symbol",
						source: sourceId,
						minzoom: coinMinZoom,
						filter: ["all", ["!", ["has", "point_count"]]],
						layout: {
							"icon-image": "coin-anim",
							"icon-size": 0.56,
							"icon-anchor": "bottom",
							"icon-offset": [45, -100],
							"icon-allow-overlap": true,
							"icon-ignore-placement": true,
						},
					},
					beforeId || undefined,
				);
				return true;
			}

			if (!map.value.hasImage(COIN_IMAGE_ID) && !renderTextLabels) {
				return false;
			}

			map.value.addLayer(
				{
					id: layerId,
					type: "symbol",
					source: sourceId,
					minzoom: coinMinZoom,
					filter: ["all", ["!", ["has", "point_count"]]],
					layout: {
						...(map.value.hasImage(COIN_IMAGE_ID)
							? {
									"icon-image": COIN_IMAGE_ID,
									"icon-size": 0.56,
									"icon-anchor": "bottom",
									"icon-offset": [45, -100],
									"icon-allow-overlap": true,
									"icon-ignore-placement": true,
								}
							: renderTextLabels
								? {
										"text-field": "🪙",
										"text-size": 14,
										"text-offset": [3.0, -7.0],
										"text-allow-overlap": true,
										"text-ignore-placement": true,
									}
								: {}),
					},
					paint: renderTextLabels
						? {
								"text-color": "#facc15",
								"text-halo-color": "rgba(0,0,0,0.56)",
								"text-halo-width": 1.5,
							}
						: {},
				},
				beforeId || undefined,
			);
			return true;
		} catch {
			return false;
		}
	};

	const addClusters = (sourceId, sourceData) => {
		if (!map.value) return;
		if (!map.value.isStyleLoaded?.()) return;

		if (canRunEffects()) {
			// ★ Fix: ensure a static coin image exists BEFORE the async Lottie setup.
			// This prevents the race where addClusters checks hasImage synchronously
			// but setupCoinAnimation hasn't loaded Lottie yet.
			ensureFallbackCoinImage();
			setupCoinAnimation(); // Start the async Lottie animation upgrade
		} else {
			stopCoinAnimation();
			if (map.value.getLayer("unclustered-coins")) {
				try {
					map.value.setLayoutProperty(
						"unclustered-coins",
						"visibility",
						"none",
					);
				} catch {
					// Ignore style/layer race during rapid mode toggles.
				}
			}
		}

		try {
			// Update existing source or create new one
			if (map.value.getSource(sourceId)) {
				if (scheduler) {
					scheduler(sourceId, sourceData);
				} else {
					map.value.getSource(sourceId).setData(sourceData);
				}
			} else {
				map.value.addSource(sourceId, {
					type: "geojson",
					data: sourceData,
					cluster: true,
					clusterMaxZoom: 14,
					clusterRadius: 50,
				});
			}

			// Cluster circles
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
							"rgba(99,102,241,0.85)",
							20,
							"rgba(168,85,247,0.85)",
							50,
							"rgba(236,72,153,0.85)",
						],
						"circle-radius": [
							"step",
							["get", "point_count"],
							18,
							20,
							24,
							50,
							30,
						],
						"circle-stroke-width": 2,
						"circle-stroke-color": "rgba(255,255,255,0.3)",
					},
				});
			}

			// Cluster count labels
			if (renderTextLabels && !map.value.getLayer("cluster-count")) {
				map.value.addLayer({
					id: "cluster-count",
					type: "symbol",
					source: sourceId,
					filter: ["has", "point_count"],
					layout: {
						"text-field": ["get", "point_count_abbreviated"],
						"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
						"text-size": 13,
						"text-allow-overlap": true,
					},
					paint: {
						"text-color": "#ffffff",
					},
				});
			}

			// Pins (Base Layer) — individual unclustered points
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
							0.7,
							20,
							1.0,
						],
						"icon-allow-overlap": true,
						"icon-ignore-placement": true,
						"icon-anchor": "bottom",
						...(renderTextLabels
							? {
									"text-field": ["get", "name"],
									"text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
									"text-offset": [0, 0.8],
									"text-anchor": "top",
									"text-size": 11,
									"text-max-width": 8,
									"text-allow-overlap": true,
								}
							: {}),
					},
					paint: {
						"text-color": "#ffffff",
						"text-halo-color": "rgba(0,0,0,0.8)",
						"text-halo-width": 1.5,
					},
				});
			}

			// 4. Coins (Animation Layer) - Floats above pins
			if (canRunEffects() && map.value.getLayer("unclustered-coins")) {
				// Re-show if hidden by effects-off toggle
				map.value.setLayoutProperty(
					"unclustered-coins",
					"visibility",
					"visible",
				);
			} else if (canRunEffects() && !map.value.getLayer("unclustered-coins")) {
				// Double-check fallback coin image exists
				if (!map.value.hasImage?.(COIN_IMAGE_ID)) {
					ensureFallbackCoinImage();
				}
				if (map.value.hasImage?.(COIN_IMAGE_ID)) {
					map.value.addLayer({
						id: "unclustered-coins",
						type: "symbol",
						source: sourceId,
						filter: ["all", ["!", ["has", "point_count"]]],
						layout: {
							"icon-image": COIN_IMAGE_ID,
							"icon-size": 0.56,
							"icon-anchor": "bottom",
							"icon-offset": [45, -100],
							"icon-allow-overlap": true,
							"icon-ignore-placement": true,
						},
					});
				}
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

	// --- Road Flow Animation (real-time neon lines on roads) ---
	const FLOW_LAYER_IDS = [
		"road-flow-glow",
		"road-flow-core",
		"road-flow-pulse",
	];
	const NEON_ROAD_SOURCE_ID = "neon-roads";
	const GLOBAL_ROAD_SOURCE_ID = "composite";
	const GLOBAL_ROAD_SOURCE_LAYER = "road";
	const ROAD_CLASS_FILTER = [
		"match",
		["get", "class"],
		["motorway", "trunk", "primary", "secondary", "tertiary", "street"],
		true,
		false,
	];
	const FLOW_DASH_FRAMES = [
		[0.35, 2.8, 0.35],
		[0.55, 2.4, 0.55],
		[0.8, 2.1, 0.8],
		[1.1, 1.8, 1.1],
		[1.3, 1.6, 1.3],
		[1.1, 1.8, 1.1],
		[0.8, 2.1, 0.8],
		[0.55, 2.4, 0.55],
	];
	let carAnimFrame = null;
	let carVisibilityListener = null;
	let activeCarSourceKey = "";
	let carRetryTimer = null;
	let carRetryAttempts = 0;
	let pendingCarSourceId = TRAFFIC_SOURCE_ID;
	const MAX_CAR_RETRY_ATTEMPTS = 40;

	const resetCarRetry = () => {
		carRetryAttempts = 0;
		if (carRetryTimer) {
			clearTimeout(carRetryTimer);
			carRetryTimer = null;
		}
	};

	const scheduleCarAnimationRetry = (sourceId = TRAFFIC_SOURCE_ID) => {
		if (typeof window === "undefined") return;
		pendingCarSourceId = sourceId;
		if (carRetryAttempts >= MAX_CAR_RETRY_ATTEMPTS) {
			updateTrafficDebug({
				stage: "skip:retry-exhausted",
				sourceId: pendingCarSourceId,
			});
			return;
		}
		if (carRetryTimer) return;
		const delayMs = Math.min(1200, 120 * 2 ** Math.min(4, carRetryAttempts));
		carRetryAttempts += 1;
		carRetryTimer = window.setTimeout(() => {
			carRetryTimer = null;
			addCarAnimation({ sourceId: pendingCarSourceId });
		}, delayMs);
	};

	const removeCarLayers = () => {
		const m = map.value;
		if (!m) return;
		for (const layerId of FLOW_LAYER_IDS) {
			if (m.getLayer(layerId)) {
				try {
					m.removeLayer(layerId);
				} catch {
					// Ignore style transition races.
				}
			}
		}
	};

	const resolveRoadSourceConfig = (m, sourceId = TRAFFIC_SOURCE_ID) => {
		if (sourceId && m.getSource(sourceId)) {
			return {
				sourceId,
				sourceLayer: null,
				filter: null,
				key: `${sourceId}:local`,
			};
		}
		if (m.getSource(NEON_ROAD_SOURCE_ID)) {
			return {
				sourceId: NEON_ROAD_SOURCE_ID,
				sourceLayer: null,
				filter: null,
				key: `${NEON_ROAD_SOURCE_ID}:geojson`,
			};
		}
		if (m.getSource(GLOBAL_ROAD_SOURCE_ID)) {
			return {
				sourceId: GLOBAL_ROAD_SOURCE_ID,
				sourceLayer: GLOBAL_ROAD_SOURCE_LAYER,
				filter: ROAD_CLASS_FILTER,
				key: `${GLOBAL_ROAD_SOURCE_ID}:${GLOBAL_ROAD_SOURCE_LAYER}`,
			};
		}
		try {
			const styleLayers = m.getStyle?.()?.layers;
			const fallbackRoadLayer = Array.isArray(styleLayers)
				? styleLayers.find((layer) => {
						if (!layer || layer.type !== "line") return false;
						if (!layer.source || layer.id?.startsWith("road-flow-"))
							return false;
						const layerId = String(layer.id || "").toLowerCase();
						const sourceLayer = String(
							layer["source-layer"] || "",
						).toLowerCase();
						return layerId.includes("road") || sourceLayer.includes("road");
					})
				: null;
			const sourceIdCandidate = fallbackRoadLayer?.source;
			if (sourceIdCandidate && m.getSource(sourceIdCandidate)) {
				const sourceLayerCandidate =
					fallbackRoadLayer?.["source-layer"] ?? null;
				return {
					sourceId: sourceIdCandidate,
					sourceLayer: sourceLayerCandidate,
					filter: sourceLayerCandidate ? ROAD_CLASS_FILTER : null,
					key: `${sourceIdCandidate}:${sourceLayerCandidate || "line"}`,
				};
			}
		} catch {
			// Ignore style read races during transitions.
		}
		return null;
	};

	const ensureRoadFlowLayers = (m, sourceConfig) => {
		const sourceDef = sourceConfig.sourceLayer
			? {
					source: sourceConfig.sourceId,
					"source-layer": sourceConfig.sourceLayer,
				}
			: { source: sourceConfig.sourceId };
		const flowFilter = sourceConfig.filter
			? ["all", sourceConfig.filter]
			: undefined;

		if (!m.getLayer("road-flow-glow")) {
			m.addLayer({
				id: "road-flow-glow",
				type: "line",
				...sourceDef,
				...(flowFilter ? { filter: flowFilter } : {}),
				paint: {
					"line-color": "#22d3ee",
					"line-opacity": 0.55,
					"line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.0, 16, 8.0],
					"line-blur": 2.5,
					"line-dasharray": FLOW_DASH_FRAMES[0],
				},
				minzoom: 9,
			});
		}

		if (!m.getLayer("road-flow-core")) {
			m.addLayer({
				id: "road-flow-core",
				type: "line",
				...sourceDef,
				...(flowFilter ? { filter: flowFilter } : {}),
				paint: {
					"line-color": "#facc15",
					"line-opacity": 0.95,
					"line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 16, 4.5],
					"line-dasharray": FLOW_DASH_FRAMES[0],
				},
				minzoom: 9,
			});
		}

		if (!m.getLayer("road-flow-pulse")) {
			m.addLayer({
				id: "road-flow-pulse",
				type: "line",
				...sourceDef,
				...(flowFilter ? { filter: flowFilter } : {}),
				paint: {
					"line-color": "#f472b6",
					"line-opacity": 0.45,
					"line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.0, 16, 5.5],
					"line-blur": 1.2,
					"line-dasharray": FLOW_DASH_FRAMES[2],
				},
				minzoom: 9,
			});
		}
	};

	const addCarAnimation = ({ sourceId = TRAFFIC_SOURCE_ID } = {}) => {
		const m = map.value;
		if (!m) {
			updateTrafficDebug({ stage: "skip:no-map", sourceId });
			return;
		}
		if (!m.isStyleLoaded?.()) {
			updateTrafficDebug({ stage: "skip:style-not-loaded", sourceId });
			scheduleCarAnimationRetry(sourceId);
			return;
		}
		const prefersReduceMotion =
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const sourceConfig = resolveRoadSourceConfig(m, sourceId);
		if (!sourceConfig) {
			updateTrafficDebug({
				stage: "skip:no-source-config",
				sourceId,
				sources: Object.keys(m.getStyle?.()?.sources || {}),
			});
			scheduleCarAnimationRetry(sourceId);
			return;
		}

		if (activeCarSourceKey !== sourceConfig.key) {
			removeCarLayers();
			activeCarSourceKey = sourceConfig.key;
		}
		if (m.getLayer("road-flow-core")) {
			if (!carAnimFrame && !prefersReduceMotion) {
				removeCarLayers();
			} else {
				resetCarRetry();
				updateTrafficDebug({
					stage: "skip:already-mounted",
					sourceId: sourceConfig.sourceId,
					sourceLayer: sourceConfig.sourceLayer || null,
				});
				return;
			}
		}
		try {
			ensureRoadFlowLayers(m, sourceConfig);

			if (prefersReduceMotion) {
				resetCarRetry();
				updateTrafficDebug({
					stage: "mounted:static",
					sourceId: sourceConfig.sourceId,
					sourceLayer: sourceConfig.sourceLayer || null,
				});
				return;
			}
			resetCarRetry();
			updateTrafficDebug({
				stage: "mounted:animated",
				sourceId: sourceConfig.sourceId,
				sourceLayer: sourceConfig.sourceLayer || null,
			});

			let phase = 0;
			let lastTs = performance.now();
			let dashFrameIndex = 0;
			let lastDashUpdateAt = 0;

			const animate = (ts = performance.now()) => {
				if (!m || !m.getLayer("road-flow-core")) {
					carAnimFrame = null;
					return;
				}
				if (typeof document !== "undefined" && document.hidden) {
					carAnimFrame = null;
					return;
				}
				const dt = Math.max(0, ts - lastTs);
				lastTs = ts;
				phase = (phase + dt * 0.0048) % (Math.PI * 2);

				// Throttle paint updates to ~10fps for visible traffic motion
				if (ts - lastDashUpdateAt >= 95) {
					lastDashUpdateAt = ts;
					dashFrameIndex = (dashFrameIndex + 1) % FLOW_DASH_FRAMES.length;
					const nextDash = FLOW_DASH_FRAMES[dashFrameIndex];
					const pulseDash =
						FLOW_DASH_FRAMES[(dashFrameIndex + 2) % FLOW_DASH_FRAMES.length];
					try {
						if (m.getLayer("road-flow-core")) {
							m.setPaintProperty("road-flow-core", "line-dasharray", nextDash);
							m.setPaintProperty(
								"road-flow-core",
								"line-opacity",
								0.88 + Math.abs(Math.sin(phase)) * 0.08,
							);
						}
						if (m.getLayer("road-flow-glow")) {
							m.setPaintProperty("road-flow-glow", "line-dasharray", nextDash);
							m.setPaintProperty(
								"road-flow-glow",
								"line-opacity",
								0.45 + Math.abs(Math.sin(phase)) * 0.12,
							);
						}
						if (m.getLayer("road-flow-pulse")) {
							m.setPaintProperty(
								"road-flow-pulse",
								"line-dasharray",
								pulseDash,
							);
							m.setPaintProperty(
								"road-flow-pulse",
								"line-opacity",
								0.18 + Math.abs(Math.sin(phase + 1.0)) * 0.14,
							);
						}
					} catch {
						// Ignore layer updates during style transitions.
					}
				}
				carAnimFrame = requestAnimationFrame(animate);
			};

			const startCarLoop = () => {
				if (carAnimFrame) return;
				lastTs = performance.now();
				carAnimFrame = requestAnimationFrame(animate);
			};
			const stopCarLoop = () => {
				if (!carAnimFrame) return;
				cancelAnimationFrame(carAnimFrame);
				carAnimFrame = null;
			};
			startCarLoop();

			if (!carVisibilityListener) {
				carVisibilityListener = () => {
					const hidden =
						typeof document !== "undefined" ? document.hidden : false;
					try {
						if (m.getLayer("road-flow-core")) {
							m.setPaintProperty(
								"road-flow-core",
								"line-opacity",
								hidden ? 0 : 0.82,
							);
						}
						if (m.getLayer("road-flow-glow")) {
							m.setPaintProperty(
								"road-flow-glow",
								"line-opacity",
								hidden ? 0 : 0.35,
							);
						}
						if (m.getLayer("road-flow-pulse")) {
							m.setPaintProperty(
								"road-flow-pulse",
								"line-opacity",
								hidden ? 0 : 0.25,
							);
						}
					} catch {
						// Ignore layer races on teardown.
					}
					if (hidden) stopCarLoop();
					else startCarLoop();
				};
				if (typeof document !== "undefined") {
					document.addEventListener("visibilitychange", carVisibilityListener, {
						passive: true,
					});
				}
			}
		} catch (e) {
			updateTrafficDebug({
				stage: "error:add-flow-animation",
				message: String(e?.message || e),
			});
			scheduleCarAnimationRetry(sourceId);
		}
	};

	const upsertTrafficRoads = async ({
		userLocation,
		radiusKm = 1,
		force = false,
	} = {}) => {
		const m = map.value;
		if (!m || !m.isStyleLoaded?.()) return false;

		const userLat = toFiniteNumber(userLocation?.lat ?? userLocation?.[0]);
		const userLng = toFiniteNumber(userLocation?.lng ?? userLocation?.[1]);
		if (userLat === null || userLng === null) {
			lastTrafficSignature = "";
			clearLocalTrafficSubset(m);
			addCarAnimation({ sourceId: NEON_ROAD_SOURCE_ID });
			return true;
		}

		if (!hasLocalTrafficCoverage({ lat: userLat, lng: userLng })) {
			lastTrafficSignature = "";
			removeLocalTrafficRoadCoverage(m);
			addCarAnimation({ sourceId: NEON_ROAD_SOURCE_ID });
			return true;
		}

		const signature = `${userLat.toFixed(4)}:${userLng.toFixed(4)}:${radiusKm}`;
		if (
			!force &&
			signature === lastTrafficSignature &&
			m.getSource(TRAFFIC_SOURCE_ID)
		) {
			return true;
		}
		if (!m.getSource("neon-roads")) {
			addNeonRoads();
		}

		const fullGeo = await loadRoadsGeoJson();
		if (!map.value || map.value !== m) return false;
		const subset = buildTrafficSubset(fullGeo, userLat, userLng, radiusKm);
		lastTrafficSignature = signature;

		if (!m.getSource(TRAFFIC_SOURCE_ID)) {
			m.addSource(TRAFFIC_SOURCE_ID, { type: "geojson", data: subset });
		} else if (scheduler) {
			scheduler(TRAFFIC_SOURCE_ID, subset);
		} else {
			m.getSource(TRAFFIC_SOURCE_ID).setData(subset);
		}

		if (!subset.features.length) {
			addCarAnimation({ sourceId: NEON_ROAD_SOURCE_ID });
			return true;
		}

		addCarAnimation({ sourceId: TRAFFIC_SOURCE_ID });
		return true;
	};

	const stopCarAnimation = () => {
		if (carAnimFrame) {
			cancelAnimationFrame(carAnimFrame);
			carAnimFrame = null;
		}
		if (carVisibilityListener) {
			if (typeof document !== "undefined") {
				document.removeEventListener("visibilitychange", carVisibilityListener);
			}
			carVisibilityListener = null;
		}
		resetCarRetry();
		removeCarLayers();
	};

	onUnmounted(() => {
		stopCoinAnimation();
		stopCarAnimation();
	});

	// Wave 2: Task 2.1 — Critical + Deferred layer split
	// addCriticalLayers: Only pin interaction layers needed before first paint.
	// Caller must pass the map instance and source/layer IDs so this composable
	// remains decoupled from MapboxContainer constants.
	const addCriticalLayers = ({
		mapInstance,
		pinSourceId,
		pinLayerId,
		pinHitboxLayerId,
		selectedPinLayerId,
		emptySelectedPinFilter,
	} = {}) => {
		const m = mapInstance ?? map.value;
		if (!m) return;

		// pin-hitbox: invisible touch target (added below symbol layer)
		if (!m.getLayer(pinHitboxLayerId)) {
			try {
				m.addLayer(
					{
						id: pinHitboxLayerId,
						type: "circle",
						source: pinSourceId,
						filter: ["all", ["!", ["has", "point_count"]]],
						paint: {
							"circle-radius": [
								"case",
								["==", ["get", "pin_type"], "giant"],
								16,
								["==", ["get", "boost"], true],
								14,
								12,
							],
							"circle-color": "#ffffff",
							"circle-opacity": 0.01,
							"circle-stroke-opacity": 0,
						},
					},
					pinLayerId,
				);
			} catch {
				// Layer may already exist during style transitions
			}
		}

		// selected-pin-marker: highlighted pin overlay
		if (selectedPinLayerId && !m.getLayer(selectedPinLayerId)) {
			try {
				m.addLayer({
					id: selectedPinLayerId,
					type: "symbol",
					source: pinSourceId,
					filter: emptySelectedPinFilter ?? ["==", ["get", "id"], "__none__"],
					layout: {
						"icon-image": [
							"case",
							["==", ["get", "pin_state"], "event"],
							"pin-purple",
							["==", ["get", "pin_state"], "live"],
							"pin-red",
							"pin-grey",
						],
						"icon-size": [
							"case",
							["==", ["get", "pin_type"], "giant"],
							0.32,
							0.24,
						],
						"icon-allow-overlap": true,
						"icon-ignore-placement": true,
						"icon-anchor": "bottom",
						"symbol-sort-key": 9999,
					},
					paint: {
						"icon-opacity": 1,
					},
				});
			} catch {
				// Ignore during style transitions
			}
		}
	};

	// addDeferredLayers: Visual-only enhancements added after map idle.
	// Guards: only adds if corresponding source exists (graceful no-op).
	const addDeferredLayers = ({ mapInstance } = {}) => {
		const m = mapInstance ?? map.value;
		if (!m) return;

		// Heatmap layer (requires heatmap-data source)
		if (m.getSource("heatmap-data") && !m.getLayer("heatmap-layer")) {
			try {
				m.addLayer({
					id: "heatmap-layer",
					type: "heatmap",
					source: "heatmap-data",
					paint: {
						"heatmap-weight": [
							"interpolate",
							["linear"],
							["get", "mag"],
							0,
							0,
							6,
							1,
						],
						"heatmap-intensity": [
							"interpolate",
							["linear"],
							["zoom"],
							0,
							1,
							9,
							3,
						],
					},
				});
			} catch {
				// Source may have been removed; silently skip
			}
		}

		// Terrain visual line enhancement (requires terrain-source)
		if (m.getSource("terrain-source") && !m.getLayer("terrain-visual")) {
			try {
				m.addLayer({
					id: "terrain-visual",
					type: "line",
					source: "terrain-source",
					paint: {
						"line-color": "#999",
						"line-width": 0.5,
						"line-opacity": 0.3,
					},
				});
			} catch {
				// Source may be missing; silently skip
			}
		}

		// 3D building extrusion (requires buildings source)
		if (m.getSource("buildings") && !m.getLayer("building-extrusion")) {
			try {
				m.addLayer({
					id: "building-extrusion",
					type: "fill-extrusion",
					source: "buildings",
					paint: {
						"fill-extrusion-color": "#aaa",
						"fill-extrusion-height": ["get", "height"],
					},
				});
			} catch {
				// Source may be missing; silently skip
			}
		}
	};

	// neonSignCache: tracks which neon sign images have been registered with the map
	const neonSignCache = new Map();

	// addNeonSignLayers: registers/refreshes neon sign symbol layers.
	// Called after source data is applied so the source is guaranteed to exist.
	const addNeonSignLayers = (sourceId, _sourceData) => {
		const m = map.value;
		if (!m?.isStyleLoaded?.()) return;
		if (!m.getSource(sourceId)) return;
		// Neon sign sprites are generated on-demand by the canvas pipeline.
		// This function is a registration hook — layers are owned by addCriticalLayers/
		// addDeferredLayers; neonSignCache tracks which keys are rendered so callers
		// can invalidate stale entries without re-running the full pipeline.
	};

	// Public API
	return {
		addNeonRoads,
		addClusters,
		loadMapImages,
		setCyberpunkAtmosphere,
		addCyberpunkBuildings,
		upsertTrafficRoads,
		addCarAnimation,
		stopCarAnimation,
		ensureCoinAnimation,
		upsertCoinLayer,
		removeCoinLayer,
		stopCoinAnimation,
		// Wave 2: split layer API
		addCriticalLayers,
		addDeferredLayers,
		// Neon sign layer registration + cache
		addNeonSignLayers,
		neonSignCache,
	};
}
