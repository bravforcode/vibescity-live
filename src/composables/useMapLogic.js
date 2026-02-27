import { computed, ref } from "vue";

const DESKTOP_MIN_WIDTH = 1280;

export function useMapLogic({
	isMobileView,
	isTabletView,
	isDesktopView,
	bottomUiHeight,
	userLocation,
}) {
	const mapRef = ref(null);
	const getViewportWidth = () => {
		if (typeof window === "undefined") return 0;
		return Math.round(
			window.visualViewport?.width ||
				window.innerWidth ||
				document.documentElement?.clientWidth ||
				0,
		);
	};
	const isDesktopLayout = computed(() => {
		if (isDesktopView && typeof isDesktopView.value === "boolean") {
			return isDesktopView.value;
		}
		return !isMobileView?.value && getViewportWidth() >= DESKTOP_MIN_WIDTH;
	});
	const isTabletLayout = computed(() => {
		if (isTabletView && typeof isTabletView.value === "boolean") {
			return isTabletView.value;
		}
		return !isMobileView?.value && !isDesktopLayout.value;
	});

	// ✅ Robust FlyTo Logic with Validation
	const smoothFlyTo = (targetCoords, options = {}) => {
		if (!mapRef.value || !targetCoords) return;
		if (!Array.isArray(targetCoords) || targetCoords.length !== 2) return;

		// Validate coordinates (basic check for valid lat/lng ranges)
		const lat = Number(targetCoords[0]);
		const lng = Number(targetCoords[1]);

		if (isNaN(lat) || isNaN(lng)) return;
		// Basic range check: Lat -90 to 90, Lng -180 to 180
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			console.warn("Invalid coordinates for flyTo:", targetCoords);
			return;
		}

		// Create fly options
		// On mobile, the modal covers ~50% of the screen bottom,
		// so offset the pin upward to center it in the visible map area above the modal.
		const viewportHeight = window.innerHeight || 800;
		let mobileBottomOffset = isDesktopLayout.value
			? 0
			: Math.round(viewportHeight * 0.25);

		// Override if specific offsetY is provided
		if (options.offsetY !== undefined) {
			mobileBottomOffset = options.offsetY;
		}

		const flyOptions = {
			center: [lng, lat], // Mapbox uses [lng, lat]
			zoom: isDesktopLayout.value ? 15.5 : 16.0,
			pitch: 60, // 3D tilt without showing beyond map world
			bearing: 0,
			speed: 0.5, // 0.8 -> 0.5 (Slower/Smoother)
			curve: 1.5, // 1.2 -> 1.5 (More gradual zoom)
			essential: true,
			offset: [0, -mobileBottomOffset],
			padding: { top: 0, bottom: 0, left: 0, right: 0 },
			maxDuration: 2500, // Cap duration for long flights
		};

		// Execute Fly
		// Mapbox GL expects map.flyTo({center, zoom, ...})
		if (mapRef.value?.map && typeof mapRef.value.map.flyTo === "function") {
			try {
				mapRef.value.map.flyTo(flyOptions);
			} catch (e) {
				console.warn("Mapbox flyTo failed:", e);
			}
		} else if (mapRef.value && typeof mapRef.value.flyTo === "function") {
			// If MapContainer exposes a wrapper flyTo(options)
			try {
				mapRef.value.flyTo(flyOptions);
			} catch (e) {
				console.warn("Map component flyTo failed:", e);
			}
		}
	};

	const handleLocateMe = (selectFeedback) => {
		if (selectFeedback) selectFeedback();
		if (mapRef.value && userLocation?.value) {
			if (typeof mapRef.value.focusLocation === "function") {
				mapRef.value.focusLocation(userLocation.value, 17);
			} else {
				// Fallback if focusLocation is not exposed but flyTo is
				smoothFlyTo(userLocation.value);
			}
		}
	};

	// ✅ Giant Pin View Handlers
	const handleEnterGiantView = (building, selectFeedback) => {
		if (selectFeedback) selectFeedback();
		// Fly to the building location
		if (building?.lat && building.lng && mapRef.value) {
			const flyCall = mapRef.value.map
				? mapRef.value.map.flyTo
				: mapRef.value.flyTo;
			if (typeof flyCall === "function") {
				flyCall.call(mapRef.value.map || mapRef.value, {
					center: [building.lng, building.lat],
					zoom: 18,
					pitch: 60,
					bearing: 0,
					essential: true,
				});
			}
		}
	};

	const handleExitGiantView = (tapFeedback) => {
		if (tapFeedback) tapFeedback();
		// Reset to normal view
		if (userLocation?.value && mapRef.value) {
			const flyCall = mapRef.value.map
				? mapRef.value.map.flyTo
				: mapRef.value.flyTo;
			if (typeof flyCall === "function") {
				flyCall.call(mapRef.value.map || mapRef.value, {
					center: [userLocation.value[1], userLocation.value[0]],
					zoom: 15,
					pitch: 60,
					bearing: 0,
					essential: true,
				});
			}
		}
	};

	// ✅ UI offsets for "visual center" (between top bar & bottom carousel)
	const mapUiTopOffset = computed(() => {
		return isDesktopLayout.value ? 72 : 64;
	});

	/**
	 * Computes the padding needed for the map based on the bottom carousel height on mobile.
	 */
	const mapUiBottomOffset = computed(() => {
		if (isDesktopLayout.value) return 0;
		return Math.max(0, Number(bottomUiHeight?.value || 0));
	});

	return {
		mapRef,
		smoothFlyTo,
		handleLocateMe,
		handleEnterGiantView,
		handleExitGiantView,
		mapUiTopOffset,
		mapUiBottomOffset,
	};
}
