import maplibregl from "maplibre-gl";
// maplibre-gl CSS loaded eagerly in main.js — no re-import needed here
import { markRaw, onUnmounted, ref, shallowRef } from "vue";
import { isFrontendOnlyDevMode } from "../../lib/runtimeConfig";
import { isMapDebugLoggingEnabled } from "../../utils/mapDebug";
import { useInteractionState } from "../useInteractionState";

// Env-driven style URL: prefer custom style, then fallback, then local neon style
// (vibecity-neon.json → OpenFreeMap tiles — production-grade, globally available)
const MAP_STYLE =
	import.meta.env.VITE_MAP_STYLE_URL ||
	import.meta.env.VITE_MAP_STYLE_FALLBACK_URL ||
	(isFrontendOnlyDevMode()
		? "/map-styles/vibecity-dev.json"
		: "/map-styles/vibecity-neon.json");

const MAPBOX_SUPPRESSED_WARN_PATTERNS = [
	[
		"featureNamespace",
		"featureset",
		"selector is not associated to the same source",
	],
	["place-labels", "featureset"],
	["Couldn't find terrain source"], // Suppress spurious terrain warnings during style transitions
];

let mapboxWarnFilterRefs = 0;
let mapboxWarnOriginal = null;
let mapboxWarnPatched = null;

const shouldSuppressMapboxFeaturesetWarn = (args) => {
	const message = args
		.map((part) => (typeof part === "string" ? part : String(part ?? "")))
		.join(" ");
	return MAPBOX_SUPPRESSED_WARN_PATTERNS.some((pattern) =>
		pattern.every((snippet) => message.includes(snippet)),
	);
};

const installMapboxWarnFilter = () => {
	if (typeof console === "undefined") return;
	mapboxWarnFilterRefs += 1;
	if (mapboxWarnPatched) return;
	mapboxWarnOriginal = console.warn?.bind(console) ?? null;
	mapboxWarnPatched = (...args) => {
		if (shouldSuppressMapboxFeaturesetWarn(args)) return;
		mapboxWarnOriginal?.(...args);
	};
	console.warn = mapboxWarnPatched;
};

const uninstallMapboxWarnFilter = () => {
	if (typeof console === "undefined") return;
	mapboxWarnFilterRefs = Math.max(0, mapboxWarnFilterRefs - 1);
	if (mapboxWarnFilterRefs > 0) return;
	if (mapboxWarnPatched && console.warn === mapboxWarnPatched) {
		console.warn = mapboxWarnOriginal ?? console.warn;
	}
	mapboxWarnPatched = null;
	mapboxWarnOriginal = null;
};

export function useMapCore(containerRef, _options = {}) {
	const map = shallowRef(null);
	const isMapReady = ref(false);
	const isMapLoaded = ref(false);
	const isStrictMapE2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
	const onContextLost =
		typeof _options.onContextLost === "function"
			? _options.onContextLost
			: null;
	const onContextRestored =
		typeof _options.onContextRestored === "function"
			? _options.onContextRestored
			: null;
	// MapLibre GL does not require an access token — no token setup needed.
	const PRIMARY_STYLE_URL = MAP_STYLE;
	const FALLBACK_STYLE_URL =
		import.meta.env.VITE_MAP_STYLE_FALLBACK_URL ||
		(isFrontendOnlyDevMode()
			? "/map-styles/vibecity-dev.json"
			: "/map-styles/vibecity-neon.json");
	const STYLE_ENDPOINT_PATH = "/styles/v1/";
	const EMPTY_VECTOR_TILE_DATA_URI = "data:application/x-protobuf;base64,";
	let lastRequestedStyleUrl = "";
	let styleFallbackInProgress = false;

	// Pin images used by symbol layers. Preload on load/style.load and keep
	// styleimagemissing as a fallback (styles can reset images on setStyle).
	const PIN_IMAGES = {
		"pin-normal": "/images/pins/pin-gray.png",
		"pin-grey": "/images/pins/pin-gray.png",
		"pin-red": "/images/pins/pin-red.png",
		"pin-blue": "/images/pins/pin-blue.png",
		"pin-boost": "/images/pins/pin-red.png",
		"pin-giant": "/images/pins/pin-blue.png",
	};
	const pendingPinImages = new Set();
	const warnedMissingTerrainSources = new Set();
	let detachCanvasContextListeners = null;
	const createTransparentPlaceholderImage = () => ({
		width: 1,
		height: 1,
		data: new Uint8Array([0, 0, 0, 0]),
	});

	const upsertMapImage = (id, image) => {
		if (!map.value || !image) return;
		try {
			if (map.value.hasImage?.(id) && map.value.removeImage) {
				map.value.removeImage(id);
			}
			map.value.addImage(id, image);
		} catch {
			// Ignore duplicate image races during style transitions.
		}
	};

	const primePinImagePlaceholders = () => {
		if (!map.value) return;
		for (const id of Object.keys(PIN_IMAGES)) {
			if (map.value.hasImage?.(id)) continue;
			try {
				map.value.addImage(id, createTransparentPlaceholderImage());
			} catch {
				// Ignore races while the style is still settling.
			}
		}
	};

	const ensurePinImagesLoaded = () => {
		if (!map.value) return;
		for (const [id, url] of Object.entries(PIN_IMAGES)) {
			if (!url) continue;
			if (pendingPinImages.has(id)) continue;
			pendingPinImages.add(id);
			map.value.loadImage(url, (error, image) => {
				pendingPinImages.delete(id);
				if (error || !image || !map.value) return;
				upsertMapImage(id, image);
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
		// Check for 404 on style endpoints (Mapbox or MapLibre compatible)
		if (status === 404 && url.includes(STYLE_ENDPOINT_PATH)) return true;
		// Also check for style URLs without /styles/v1/ pattern (MapLibre custom endpoints)
		if (status === 404 && (url.includes("style") || url.startsWith("http")))
			return true;
		return false;
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
		installMapboxWarnFilter();

		// ✅ Clear container to prevent "should be empty" warnings and duplicate canvases on hot reload
		containerRef.value.innerHTML = "";

		lastRequestedStyleUrl = style;
		map.value = markRaw(
			new maplibregl.Map({
				container: containerRef.value,
				style: style,
				center: initialCenter,
				zoom: initialZoom,
				minZoom: 3,
				maxZoom: 22,
				pitch: 0, // Flat top-down view — aligns with neon sign layer
				bearing: 0,
				antialias: false, // Saves ~50% VRAM on mobile/retina
				attributionControl: false,
				fadeDuration: 0, // Eliminate tile fade-in stutter on mobile
				maxTileCacheSize: 100, // Limit memory for tile cache
				// Smooth scroll-zoom: zoom toward cursor position
				scrollZoom: { around: "center" },
				transformRequest: (url, _resourceType) => {
					// Suppress noisy 404 tileset fetches that some custom styles reference.
					if (isSuppressedTilesetRequest(url)) {
						return { url: EMPTY_VECTOR_TILE_DATA_URI };
					}
					return { url };
				},
			}),
		);

		const canvas = map.value.getCanvas?.();
		if (canvas) {
			const handleContextLost = (event) => {
				event.preventDefault?.();
				onContextLost?.({ event, map: map.value });
			};
			const handleContextRestored = (event) => {
				onContextRestored?.({ event, map: map.value });
			};
			canvas.addEventListener("webglcontextlost", handleContextLost, {
				passive: false,
			});
			canvas.addEventListener("webglcontextrestored", handleContextRestored);
			detachCanvasContextListeners = () => {
				canvas.removeEventListener("webglcontextlost", handleContextLost);
				canvas.removeEventListener(
					"webglcontextrestored",
					handleContextRestored,
				);
				detachCanvasContextListeners = null;
			};
		}

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

		// Smooth scroll zoom: 1/250 = comfortable speed with proper inertia deceleration
		// (1/180 was too fast causing jerky/stopping behaviour on trackpads)
		map.value.scrollZoom.setWheelZoomRate(1 / 250);
		// Smooth pinch-to-zoom on touch: zoom toward center for consistent feel
		map.value.touchZoomRotate.enable({ around: "center" });

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
		map.value.on("load", primePinImagePlaceholders);
		map.value.on("style.load", primePinImagePlaceholders);
		map.value.on("load", clearReadyFallbackTimer);
		map.value.on("style.load", clearReadyFallbackTimer);
		map.value.on("idle", clearReadyFallbackTimer);
		map.value.on("remove", clearReadyFallbackTimer);
		map.value.on("remove", () => detachCanvasContextListeners?.());
		map.value.on("remove", uninstallMapboxWarnFilter);

		// Track last requested style even when callers use map.value.setStyle directly.
		const baseSetStyle = map.value.setStyle.bind(map.value);
		map.value.setStyle = (nextStyle, options) => {
			lastRequestedStyleUrl = nextStyle;
			return baseSetStyle(nextStyle, options);
		};

		// Wave 2: Task 2.4 — single-fire guards to prevent redundant style mutations.
		// Pin images: load once after style stabilizes (styleimagemissing covers re-adds).
		// Terrain: check once per idle; reset on style.load so new styles are handled.
		let pinnedImagesEnsured = false;
		let terrainChecked = false;

		// CRITICAL: Pin images and terrain consistency are non-blocking.
		// Defer to idle + requestAnimationFrame so they don't block map ready.
		const scheduleNonCriticalInit = () => {
			requestAnimationFrame(() => {
				// Pin images: only on first idle after each style load
				if (!pinnedImagesEnsured) {
					pinnedImagesEnsured = true;
					ensurePinImagesLoaded();
				}
				// Terrain: only once per style, re-checked when style reloads
				if (!terrainChecked) {
					terrainChecked = true;
					ensureTerrainSourceConsistency();
				}
			});
		};
		map.value.on("idle", scheduleNonCriticalInit);

		// Reset guards on style.load so fresh styles re-check images + terrain
		map.value.on("style.load", () => {
			pinnedImagesEnsured = false;
			terrainChecked = false;
		});
		// styleimagemissing handler (below) already covers image re-adds during style transitions.
		// styledata terrain check removed — now handled by idle guard above.
		// Error handling — suppress expected tile 404s during style transitions
		map.value.on("error", (e) => {
			const err = e?.error;
			const status = err?.status;
			const url = typeof err?.url === "string" ? err.url : "";
			const msg = String(err?.message || e?.message || "");
			const isOpaqueRendererError = !status && !url && msg === "N";

			// Suppress harmless featureNamespace / place-labels style warnings
			if (msg.includes("featureNamespace") || msg.includes("place-labels")) {
				return;
			}
			if (isOpaqueRendererError) {
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
					console.warn("MapLibre tile error (suppressed):", url || e);
				}
				return;
			}

			// Genuine errors
			if (import.meta.env.DEV && !isMapDebugLoggingEnabled()) {
				return;
			}
			console.error("MapLibre Error:", e);
		});

		// Handle missing images (loaded on demand for symbol layers)
		map.value.on("styleimagemissing", (e) => {
			const id = e.id;
			const url = PIN_IMAGES[id];
			if (url && map.value && !pendingPinImages.has(id)) {
				primePinImagePlaceholders();
				pendingPinImages.add(id);
				map.value.loadImage(url, (error, image) => {
					pendingPinImages.delete(id);
					if (error) return;
					upsertMapImage(id, image);
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
		detachCanvasContextListeners?.();
		if (map.value) {
			map.value.remove();
			map.value = null;
		}
		uninstallMapboxWarnFilter();
	});

	return {
		map,
		isMapReady,
		isMapLoaded,
		initMap,
		setMapStyle,
	};
}
