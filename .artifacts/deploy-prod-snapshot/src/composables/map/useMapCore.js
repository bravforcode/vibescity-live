import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { markRaw, onUnmounted, ref, shallowRef } from "vue";
import { frontendObservabilityService } from "../../services/frontendObservabilityService";
import { useInteractionState } from "../useInteractionState";
import { isMapContentReadyForMode } from "./mapContentReadiness";
import { normalizeMapStyleMode } from "./mapStyleMode";

// Env-driven style URL: prefer custom style, then fallback, then safe public default
const MAP_STYLE =
	import.meta.env.VITE_MAP_STYLE_URL ||
	import.meta.env.VITE_MAP_STYLE_FALLBACK_URL ||
	"https://demotiles.maplibre.org/style.json";

const MAPLIBRE_SUPPRESSED_WARN_PATTERNS = [
	[
		"featureNamespace",
		"featureset",
		"selector is not associated to the same source",
	],
	["place-labels", "featureset"],
	["Couldn't find terrain source"], // Suppress spurious terrain warnings during style transitions
];
const MAPLIBRE_TRANSIENT_TOUCH_WARN =
	"[Intervention] Ignored attempt to cancel a touchmove event with cancelable=false";
const MAPLIBRE_PIN_IMAGE_WARN_SNIPPETS = [
	"could not be loaded. Please make sure you have added the image with map.addImage()",
	'You can provide missing images by listening for the "styleimagemissing" map event.',
];
const MAPLIBRE_TRANSIENT_PIN_IMAGE_IDS = [
	"pin-normal",
	"pin-grey",
	"pin-red",
	"pin-blue",
	"pin-purple",
	"pin-boost",
	"pin-giant",
];

let maplibreWarnFilterRefs = 0;
let maplibreWarnOriginal = null;
let maplibreWarnPatched = null;

const shouldSuppressMaplibreFeaturesetWarn = (args) => {
	const message = args
		.map((part) => (typeof part === "string" ? part : String(part ?? "")))
		.join(" ");
	const matchesKnownPattern = MAPLIBRE_SUPPRESSED_WARN_PATTERNS.some(
		(pattern) => pattern.every((snippet) => message.includes(snippet)),
	);
	if (matchesKnownPattern) return true;
	if (message.includes(MAPLIBRE_TRANSIENT_TOUCH_WARN)) return true;
	return (
		MAPLIBRE_TRANSIENT_PIN_IMAGE_IDS.some((id) =>
			message.includes(`"${id}"`),
		) &&
		MAPLIBRE_PIN_IMAGE_WARN_SNIPPETS.every((snippet) =>
			message.includes(snippet),
		)
	);
};

const installMaplibreWarnFilter = () => {
	if (typeof console === "undefined") return;
	maplibreWarnFilterRefs += 1;
	if (maplibreWarnPatched) return;
	maplibreWarnOriginal = console.warn?.bind(console) ?? null;
	maplibreWarnPatched = (...args) => {
		if (shouldSuppressMaplibreFeaturesetWarn(args)) return;
		maplibreWarnOriginal?.(...args);
	};
	console.warn = maplibreWarnPatched;
};

const uninstallMaplibreWarnFilter = () => {
	if (typeof console === "undefined") return;
	maplibreWarnFilterRefs = Math.max(0, maplibreWarnFilterRefs - 1);
	if (maplibreWarnFilterRefs > 0) return;
	if (maplibreWarnPatched && console.warn === maplibreWarnPatched) {
		console.warn = maplibreWarnOriginal ?? console.warn;
	}
	maplibreWarnPatched = null;
	maplibreWarnOriginal = null;
};

export function useMapCore(containerRef, options = {}) {
	const map = shallowRef(null);
	const isMapReady = ref(false);
	const isMapLoaded = ref(false);
	const isMapContentReady = ref(false);
	const mapContentState = ref("idle");
	const activeStyleUrl = ref("");
	const onContextLost =
		typeof options.onContextLost === "function" ? options.onContextLost : null;
	const onContextRestored =
		typeof options.onContextRestored === "function"
			? options.onContextRestored
			: null;
	const onMapError =
		typeof options.onMapError === "function" ? options.onMapError : null;
	const isStrictMapE2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";
	const resolvedStyleMode = normalizeMapStyleMode(options.styleMode);
	const contentReadyTimeoutMs =
		Number(options.contentReadyTimeoutMs) > 0
			? Number(options.contentReadyTimeoutMs)
			: resolvedStyleMode === "quiet"
				? 1_500
				: 8_000;
	const resolveStyleUrl = (value) =>
		typeof value === "string" && value.trim() ? value.trim() : "";
	// MapLibre GL does not require an access token — no token setup needed.
	const PRIMARY_STYLE_URL =
		resolveStyleUrl(options.primaryStyleUrl) || MAP_STYLE;
	const FALLBACK_STYLE_URL =
		resolveStyleUrl(options.fallbackStyleUrl) ||
		import.meta.env.VITE_MAP_STYLE_FALLBACK_URL ||
		PRIMARY_STYLE_URL ||
		"https://demotiles.maplibre.org/style.json";
	const STYLE_ENDPOINT_PATH = "/styles/v1/";
	const EMPTY_VECTOR_TILE_DATA_URI = "data:application/x-protobuf;base64,";
	const MAP_RESOURCE_HOST_SNIPPETS = [
		"openfreemap.org",
		"openmaptiles.org",
		"demotiles.maplibre.org",
	];
	let lastRequestedStyleUrl = "";
	let styleFallbackInProgress = false;
	let contentReadyEpoch = 0;
	let contentReadyPollTimer = null;
	let contentReadyDeadlineTimer = null;

	const clearContentReadyTimers = () => {
		if (contentReadyPollTimer) {
			clearTimeout(contentReadyPollTimer);
			contentReadyPollTimer = null;
		}
		if (contentReadyDeadlineTimer) {
			clearTimeout(contentReadyDeadlineTimer);
			contentReadyDeadlineTimer = null;
		}
	};

	const resetContentReadyTracking = () => {
		clearContentReadyTimers();
		isMapContentReady.value = false;
		mapContentState.value = "pending";
		contentReadyEpoch =
			typeof performance !== "undefined" ? performance.now() : Date.now();
	};

	const markContentReady = (reason = "ready") => {
		if (isMapContentReady.value) return;
		clearContentReadyTimers();
		isMapContentReady.value = true;
		mapContentState.value = reason;
	};

	const evaluateContentReadiness = () => {
		if (!map.value) return false;
		let style = null;
		try {
			style =
				typeof map.value.getStyle === "function" ? map.value.getStyle() : null;
		} catch {
			style = null;
		}
		const resourceEntries =
			typeof performance !== "undefined"
				? performance.getEntriesByType("resource")
				: [];
		return isMapContentReadyForMode({
			styleMode: resolvedStyleMode,
			shellReady: Boolean(map.value.isStyleLoaded?.() || map.value.loaded?.()),
			style,
			resourceEntries,
			since: contentReadyEpoch,
			hostSnippets: MAP_RESOURCE_HOST_SNIPPETS,
		});
	};

	const reportContentReadyTimeout = () => {
		if (isMapContentReady.value || !map.value) return;
		mapContentState.value = "timed_out";
		onMapError?.({
			kind: "content_ready_timeout",
			styleMode: resolvedStyleMode,
			styleUrl: activeStyleUrl.value || lastRequestedStyleUrl,
		});
		if (import.meta.env.DEV) {
			console.warn(
				`Map content did not become ready within ${contentReadyTimeoutMs}ms (${resolvedStyleMode}) for ${activeStyleUrl.value || lastRequestedStyleUrl || "unknown-style"}.`,
			);
		}
	};

	const startContentReadyMonitor = () => {
		clearContentReadyTimers();
		const poll = () => {
			if (!map.value) return;
			if (evaluateContentReadiness()) {
				markContentReady("ready");
				return;
			}
			contentReadyPollTimer = setTimeout(poll, 250);
		};
		poll();
		contentReadyDeadlineTimer = setTimeout(() => {
			reportContentReadyTimeout();
		}, contentReadyTimeoutMs);
	};

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
	const reportPinImageRegistrationFailure = (
		id,
		url,
		error,
		phase = "load",
	) => {
		void frontendObservabilityService.reportMapLifecycle(
			"pin_image_registration_failed",
			{
				imageId: id,
				url,
				phase,
				message: String(error?.message || error || "unknown"),
			},
		);
	};

	const ensurePinImagesLoaded = () => {
		if (!map.value) return;
		for (const [id, url] of Object.entries(PIN_IMAGES)) {
			if (!url) continue;
			if (map.value.hasImage?.(id)) continue;
			if (pendingPinImages.has(id)) continue;
			pendingPinImages.add(id);
			map.value.loadImage(url, (error, image) => {
				pendingPinImages.delete(id);
				if (error || !image || !map.value) {
					reportPinImageRegistrationFailure(id, url, error, "preload");
					return;
				}
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

	const isRecoverableMapResourceFetchError = (err, event) => {
		const url = String(err?.url || "").toLowerCase();
		const message = String(err?.message || event?.message || "").toLowerCase();
		if (
			!message.includes("failed to fetch") &&
			!message.includes("networkerror") &&
			!message.includes("load failed")
		) {
			return false;
		}
		if (!url) return true;
		return (
			url.includes("/map-styles/") ||
			url.endsWith(".json") ||
			url.endsWith(".pbf") ||
			MAP_RESOURCE_HOST_SNIPPETS.some((snippet) => url.includes(snippet))
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
				`MapLibre style unavailable${reason ? ` (${reason})` : ""}; falling back to ${FALLBACK_STYLE_URL}`,
			);
		}

		try {
			activeStyleUrl.value = FALLBACK_STYLE_URL;
			resetContentReadyTracking();
			startContentReadyMonitor();
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
		installMaplibreWarnFilter();

		// ✅ Clear container to prevent "should be empty" warnings and duplicate canvases on hot reload
		containerRef.value.innerHTML = "";

		lastRequestedStyleUrl = style;
		activeStyleUrl.value = style;
		resetContentReadyTracking();
		// Detect low-end device: ≤4 CPU cores or ≤4 GB RAM
		const isLowEnd =
			typeof navigator !== "undefined" &&
			((navigator.hardwareConcurrency ?? 4) <= 4 ||
				(navigator.deviceMemory ?? 8) <= 4);
		map.value = markRaw(
			new maplibregl.Map({
				container: containerRef.value,
				style: style,
				center: initialCenter,
				zoom: initialZoom,
				minZoom: 3,
				maxZoom: 22,
				pitch: 70, // 3D perspective without showing beyond map world
				bearing: 0,
				antialias: !isLowEnd,
				// Cap pixel ratio: retina devices render 2-3× tiles; 1.5 saves ~40% GPU work
				pixelRatio: isLowEnd
					? 1
					: Math.min(
							typeof window !== "undefined"
								? (window.devicePixelRatio ?? 1)
								: 1,
							1.5,
						),
				attributionControl: false,
				preserveDrawingBuffer: false,
				crossSourceCollisions: false,
				fadeDuration: 0, // Eliminate tile fade-in stutter on mobile
				maxTileCacheSize: isLowEnd ? 40 : 100, // Fewer cached tiles = less RAM on low-end
				transformRequest: (url, _resourceType) => {
					// Suppress noisy 404 tileset fetches that some custom styles reference.
					if (isSuppressedTilesetRequest(url)) {
						return { url: EMPTY_VECTOR_TILE_DATA_URI };
					}
					return { url };
				},
			}),
		);

		const canvas = map.value.getCanvas?.() || null;
		const canvasContainer = map.value.getCanvasContainer?.() || null;
		if (canvasContainer) {
			canvasContainer.style.touchAction = "none";
			canvasContainer.style.overscrollBehavior = "none";
		}
		if (canvas) {
			canvas.style.touchAction = "none";
			const handleContextLost = (event) => {
				event.preventDefault?.();
				onContextLost?.(event);
			};
			const handleContextRestored = (event) => {
				onContextRestored?.(event);
			};
			canvas.addEventListener("webglcontextlost", handleContextLost, {
				passive: false,
			});
			canvas.addEventListener("webglcontextrestored", handleContextRestored, {
				passive: true,
			});
			map.value.on("remove", () => {
				canvas.removeEventListener("webglcontextlost", handleContextLost);
				canvas.removeEventListener(
					"webglcontextrestored",
					handleContextRestored,
				);
			});
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
		startContentReadyMonitor();

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
		map.value.on("remove", clearContentReadyTimers);
		map.value.on("remove", uninstallMaplibreWarnFilter);

		// Track last requested style even when callers use map.value.setStyle directly.
		const baseSetStyle = map.value.setStyle.bind(map.value);
		map.value.setStyle = (nextStyle, options) => {
			lastRequestedStyleUrl = nextStyle;
			activeStyleUrl.value = nextStyle;
			resetContentReadyTracking();
			startContentReadyMonitor();
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
		map.value.on("load", () => {
			requestAnimationFrame(() => ensurePinImagesLoaded());
		});
		map.value.on("style.load", () => {
			requestAnimationFrame(() => ensurePinImagesLoaded());
		});

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
			onMapError?.(e);

			// Suppress harmless featureNamespace / place-labels style warnings
			if (msg.includes("featureNamespace") || msg.includes("place-labels")) {
				return;
			}

			// GeoJSON worker tile errors — occur when setData() races with flyTo().
			// Event has a `tile` property but no HTTP status/URL. Always non-fatal.
			if (e?.tile != null && !err?.status && !url) {
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

			if (isRecoverableMapResourceFetchError(err, e)) {
				void frontendObservabilityService.reportMapLifecycle(
					"map_resource_fetch_failed",
					{
						url: url || null,
						message: msg || null,
						fallbackApplied: lastRequestedStyleUrl !== FALLBACK_STYLE_URL,
					},
				);
				if (lastRequestedStyleUrl !== FALLBACK_STYLE_URL) {
					applyFallbackStyle(url || msg || "map_resource_fetch_failed");
				}
				return;
			}

			// Genuine errors
			console.error("MapLibre Error:", e);
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
					if (error || !image) {
						reportPinImageRegistrationFailure(
							id,
							url,
							error,
							"styleimagemissing",
						);
						return;
					}
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
		clearContentReadyTimers();
		uninstallMaplibreWarnFilter();
	});

	return {
		map,
		isMapReady,
		isMapLoaded,
		isMapContentReady,
		mapContentState,
		activeStyleUrl,
		initMap,
		setMapStyle,
	};
}
