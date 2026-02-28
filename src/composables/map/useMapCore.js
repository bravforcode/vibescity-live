import mapboxgl from "mapbox-gl";
import { markRaw, onUnmounted, ref, shallowRef } from "vue";
import { useInteractionState } from "../useInteractionState";

export function useMapCore(containerRef, _options = {}) {
	const map = shallowRef(null);
	const isMapReady = ref(false);
	const isMapLoaded = ref(false);
	const isStrictMapE2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
	const HARDCODED_MAPBOX_TOKEN =
		"pk.eyJ1IjoicGhpcnJyIiwiYSI6ImNta21tbzNobDBndXMzZHB2N3V3cXdtMXQifQ.HlJvxxRdjzhbOLw5WgRPQA";
	const PRIMARY_STYLE_URL = "mapbox://styles/phirrr/cmlktq68u002601se295iazmm";
	const FALLBACK_STYLE_URL = PRIMARY_STYLE_URL;
	const STYLE_ENDPOINT_PATH = "/styles/v1/";
	const EMPTY_VECTOR_TILE_DATA_URI = "data:application/x-protobuf;base64,";
	let lastRequestedStyleUrl = "";
	let styleFallbackInProgress = false;

	const token = (
		import.meta.env.VITE_MAPBOX_TOKEN ||
		HARDCODED_MAPBOX_TOKEN ||
		""
	)
		.trim()
		.replace(/^['"]|['"]$/g, "");
	if (!token) {
		console.error(
			"VITE_MAPBOX_TOKEN is not configured and fallback token missing",
		);
	}
	mapboxgl.accessToken = token || "";
	mapboxgl.setTelemetryEnabled?.(false);

	// Pin images used by symbol layers. Preload on load/style.load and keep
	// styleimagemissing as a fallback (styles can reset images on setStyle).
	const PIN_IMAGES = {
		"pin-normal": "/images/pins/pin-gray.png",
		"pin-grey": "/images/pins/pin-gray.png",
		"pin-red": "/images/pins/pin-red.png",
		"pin-blue": "/images/pins/pin-blue.png",
		"pin-purple": "/images/pins/pin-purple.png",
		"pin-boost": "/images/pins/pin-red.png",
		"pin-giant": "/images/pins/pin-purple.png",
	};
	const pendingPinImages = new Set();
	const warnedMissingTerrainSources = new Set();

	const ensurePinImagesLoaded = () => {
		if (!map.value) return;
		for (const [id, url] of Object.entries(PIN_IMAGES)) {
			if (!url) continue;
			if (map.value.hasImage?.(id)) continue;
			if (pendingPinImages.has(id)) continue;
			pendingPinImages.add(id);
			map.value.loadImage(url, (error, image) => {
				pendingPinImages.delete(id);
				if (error || !image || !map.value) return;
				if (!map.value.hasImage(id)) {
					try {
						map.value.addImage(id, image);
					} catch {
						// Ignore duplicate image races during style transitions.
					}
				}
			});
		}
	};

	const ensureTerrainSourceConsistency = () => {
		if (!map.value || typeof map.value.getStyle !== "function") return;
		try {
			const style = map.value.getStyle();
			const terrainSourceId = style?.terrain?.source;
			if (!terrainSourceId) return;
			if (map.value.getSource(terrainSourceId)) return;
			map.value.setTerrain?.(null);
			if (
				import.meta.env.DEV &&
				!warnedMissingTerrainSources.has(terrainSourceId)
			) {
				warnedMissingTerrainSources.add(terrainSourceId);
				console.warn(
					`Terrain source "${terrainSourceId}" not found in style; terrain disabled for stability.`,
				);
			}
		} catch {
			// Ignore style transition races.
		}
	};

	const isStyleNotFoundError = (err) => {
		const status = err?.status;
		const url = typeof err?.url === "string" ? err.url : "";
		return status === 404 && url.includes(STYLE_ENDPOINT_PATH);
	};

	const isStyleAccessDeniedError = (err) => {
		const status = Number(err?.status);
		const url = typeof err?.url === "string" ? err.url : "";
		const msg = String(err?.message || "").toLowerCase();
		if (!url.includes(STYLE_ENDPOINT_PATH)) return false;
		if (status === 401 || status === 403) return true;
		return msg.includes("unauthorized") || msg.includes("forbidden");
	};

	const isTileLikeError = (err) => {
		const status = Number(err?.status);
		const url = typeof err?.url === "string" ? err.url : "";
		if (![401, 403, 404].includes(status)) return false;
		if (url.includes(STYLE_ENDPOINT_PATH)) return false;
		return (
			url.includes("/v4/") ||
			url.includes("/tiles/") ||
			url.endsWith(".vector.pbf") ||
			url.endsWith(".mvt") ||
			url.endsWith(".png") ||
			url.endsWith(".jpg") ||
			url.endsWith(".jpeg") ||
			url.endsWith(".webp")
		);
	};

	const isSuppressedTilesetRequest = (url) =>
		typeof url === "string" &&
		(url.includes("mapbox.procedural-buildings-v1") ||
			url.includes("mapbox.mapbox-landmark-pois-v1"));

	const applyFallbackStyle = (reason = "") => {
		if (!map.value) return;
		if (styleFallbackInProgress) return;
		if (!FALLBACK_STYLE_URL) return;
		if (lastRequestedStyleUrl === FALLBACK_STYLE_URL) return;

		styleFallbackInProgress = true;
		if (import.meta.env.DEV) {
			console.warn(
				`Mapbox style unavailable${reason ? ` (${reason})` : ""}; falling back to ${FALLBACK_STYLE_URL}`,
			);
		}

		try {
			map.value.setStyle(FALLBACK_STYLE_URL);
		} catch {
			styleFallbackInProgress = false;
			return;
		}

		const fallbackGuard = setTimeout(() => {
			styleFallbackInProgress = false;
		}, 6_000);

		map.value.once("style.load", () => {
			clearTimeout(fallbackGuard);
			styleFallbackInProgress = false;
		});
	};

	const initMap = (
		initialCenter = [98.968, 18.7985],
		initialZoom = 15,
		style = PRIMARY_STYLE_URL,
	) => {
		if (!containerRef.value) return;

		// ✅ Clear container to prevent "should be empty" warnings and duplicate canvases on hot reload
		containerRef.value.innerHTML = "";

		lastRequestedStyleUrl = style;
		map.value = markRaw(
			new mapboxgl.Map({
				container: containerRef.value,
				style: style,
				center: initialCenter,
				zoom: initialZoom,
				minZoom: 3,
				maxZoom: 22,
				pitch: 60, // 3D perspective without showing beyond map world
				bearing: 0,
				antialias: false, // Saves ~50% VRAM on mobile/retina
				attributionControl: false,
				fadeDuration: 0, // Eliminate tile fade-in stutter on mobile
				maxTileCacheSize: 100, // Limit memory for tile cache
				transformRequest: (url, _resourceType) => {
					// Suppress noisy 404 tileset fetches that some custom styles reference.
					if (isSuppressedTilesetRequest(url)) {
						return { url: EMPTY_VECTOR_TILE_DATA_URI };
					}
					return { url };
				},
			}),
		);

		// Attribution & Navigation controls removed for clean UI

		const markMapReady = () => {
			if (isMapReady.value) return;
			isMapReady.value = true;
			isMapLoaded.value = true;
			if (map.value) {
				map.value.resize(); // Ensure correct size
			}
		};

		const readyTimeoutMs = isStrictMapE2E ? 8_000 : 12_000;
		const readyFallbackTimer = setTimeout(() => {
			if (isMapReady.value || !map.value) return;
			const styleLoaded =
				typeof map.value.isStyleLoaded === "function"
					? map.value.isStyleLoaded()
					: false;
			const mapLoaded =
				typeof map.value.loaded === "function" ? map.value.loaded() : false;
			if (styleLoaded || mapLoaded) {
				markMapReady();
			}
		}, readyTimeoutMs);

		const clearReadyFallbackTimer = () => {
			clearTimeout(readyFallbackTimer);
		};

		// Amplify scroll zoom speed (default rate is 1/450 — lower = faster)
		map.value.scrollZoom.setWheelZoomRate(1 / 180);

		// Interaction FSM Hooks
		const { beginMapDrag, endMapDrag } = useInteractionState();
		map.value.on("dragstart", beginMapDrag);
		map.value.on("zoomstart", beginMapDrag);
		map.value.on("pitchstart", beginMapDrag);
		map.value.on("dragend", endMapDrag);
		map.value.on("zoomend", endMapDrag);
		map.value.on("pitchend", endMapDrag);

		map.value.on("load", markMapReady);
		map.value.on("style.load", markMapReady);
		map.value.on("idle", markMapReady);
		map.value.on("load", clearReadyFallbackTimer);
		map.value.on("style.load", clearReadyFallbackTimer);
		map.value.on("idle", clearReadyFallbackTimer);
		map.value.on("remove", clearReadyFallbackTimer);

		// Track last requested style even when callers use map.value.setStyle directly.
		const baseSetStyle = map.value.setStyle.bind(map.value);
		map.value.setStyle = (nextStyle, options) => {
			lastRequestedStyleUrl = nextStyle;
			return baseSetStyle(nextStyle, options);
		};

		map.value.on("load", ensurePinImagesLoaded);
		map.value.on("style.load", ensurePinImagesLoaded);
		map.value.on("load", ensureTerrainSourceConsistency);
		map.value.on("style.load", ensureTerrainSourceConsistency);
		map.value.on("styledata", ensureTerrainSourceConsistency);
		// Error handling — suppress expected tile 404s during style transitions
		map.value.on("error", (e) => {
			const err = e?.error;
			const status = err?.status;
			const url = typeof err?.url === "string" ? err.url : "";
			const msg = String(err?.message || e?.message || "");

			// Suppress harmless featureNamespace / place-labels style warnings
			if (msg.includes("featureNamespace") || msg.includes("place-labels")) {
				return;
			}

			// Style endpoint unauthorized/not found -> apply fallback
			if (isStyleNotFoundError(err) || isStyleAccessDeniedError(err)) {
				applyFallbackStyle(`${status || "unknown"} ${url}`.trim());
				return;
			}

			// Tile errors are expected when styles reference premium/missing tilesets
			if (isTileLikeError(err)) {
				if (import.meta.env.DEV) {
					console.warn("Mapbox tile error (suppressed):", url || e);
				}
				return;
			}

			// Genuine errors
			console.error("Mapbox Error:", e);
		});

		// Handle missing images (loaded on demand for symbol layers)
		map.value.on("styleimagemissing", (e) => {
			const id = e.id;
			const url = PIN_IMAGES[id];
			if (
				url &&
				map.value &&
				!map.value.hasImage(id) &&
				!pendingPinImages.has(id)
			) {
				pendingPinImages.add(id);
				map.value.loadImage(url, (error, image) => {
					pendingPinImages.delete(id);
					if (error) return;
					if (map.value && !map.value.hasImage(id)) {
						try {
							map.value.addImage(id, image);
						} catch {
							// Ignore duplicate image races during style transitions.
						}
					}
				});
			}
		});
	};

	const setMapStyle = (styleUrl) => {
		if (map.value) {
			map.value.setStyle(styleUrl);
			// Note: Sources/Layers need re-adding after style change.
			// This event should be handled by consumers.
		}
	};

	onUnmounted(() => {
		if (map.value) {
			map.value.remove();
			map.value = null;
		}
	});

	return {
		map,
		isMapReady,
		isMapLoaded,
		initMap,
		setMapStyle,
	};
}
