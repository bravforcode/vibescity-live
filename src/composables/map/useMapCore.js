import mapboxgl from "mapbox-gl";
import { onUnmounted, ref, shallowRef } from "vue";

export function useMapCore(containerRef, _options = {}) {
	const map = shallowRef(null);
	const isMapReady = ref(false);
	const isMapLoaded = ref(false);
	const isStrictMapE2E = import.meta.env.VITE_E2E_MAP_REQUIRED === "true";

	// Access Token from environment - no hardcoded fallback for security
	const token = (import.meta.env.VITE_MAPBOX_TOKEN || "")
		.trim()
		.replace(/^['"]|['"]$/g, "");
	if (!token) {
		console.error("VITE_MAPBOX_TOKEN is not configured in .env");
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

	const initMap = (
		initialCenter = [98.968, 18.7985],
		initialZoom = 15,
		style = "mapbox://styles/phirrr/cml87cidg005101s9229k6083",
	) => {
		if (!containerRef.value) return;

		// ✅ Clear container to prevent "should be empty" warnings and duplicate canvases on hot reload
		containerRef.value.innerHTML = "";

		map.value = new mapboxgl.Map({
			container: containerRef.value,
			style: style,
			center: initialCenter,
			zoom: initialZoom,
			pitch: 60, // Default pitch for 3D feel (stronger 3D)
			bearing: 0,
			antialias: true,
			attributionControl: false,
		});

		// Add Controls
		map.value.addControl(
			new mapboxgl.AttributionControl({ compact: true }),
			"bottom-right",
		);
		map.value.addControl(
			new mapboxgl.NavigationControl({ showCompass: true, showZoom: false }),
			"top-right",
		);

		const markMapReady = () => {
			if (isMapReady.value) return;
			isMapReady.value = true;
			isMapLoaded.value = true;
			if (map.value) {
				map.value.resize(); // Ensure correct size
			}
		};

		map.value.on("load", markMapReady);
		map.value.on("style.load", markMapReady);
		map.value.on("idle", markMapReady);

		map.value.on("load", ensurePinImagesLoaded);
		map.value.on("style.load", ensurePinImagesLoaded);
		if (isStrictMapE2E) {
			setTimeout(() => {
				if (isMapReady.value || !map.value) return;
				if (map.value.getCanvas?.()) {
					markMapReady();
				}
			}, 8_000);
		}

		// Error handling
		map.value.on("error", (e) => {
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
