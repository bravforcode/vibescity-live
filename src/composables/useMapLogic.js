import { computed, ref } from "vue";

export function useMapLogic({ isMobileView, bottomUiHeight, userLocation }) {
	const mapRef = ref(null);

	// ✅ Robust FlyTo Logic with Validation
	const smoothFlyTo = (targetCoords) => {
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

		// Pre-calculate visual offsets
		const bottomPanelHeight = bottomUiHeight?.value || 0;

		// Create fly options
		const flyOptions = {
			center: [lng, lat], // Mapbox uses [lng, lat]
			zoom: 17.5,
			pitch: 45, // Cinematic pitch
			bearing: 0,
			speed: 0.5, // 0.8 -> 0.5 (Slower/Smoother)
			curve: 1.5, // 1.2 -> 1.5 (More gradual zoom)
			essential: true,
			padding: {
				bottom: isMobileView?.value ? bottomPanelHeight + 120 : 50, // Revert to panel-aware center
				top: isMobileView?.value ? 80 : 50, // Clear header only
				left: isMobileView?.value ? 20 : window.innerWidth * 0.35 + 20,
				right: 20,
			},
			maxDuration: 2500, // Cap duration for long flights
		};

		// Execute Fly
		// Mapbox GL expects map.flyTo({center, zoom, ...})
		if (mapRef.value?.map && typeof mapRef.value.map.flyTo === "function") {
			try {
				mapRef.value.map.flyTo(flyOptions);
			} catch (e) { console.warn("Mapbox flyTo failed:", e); }
		} else if (mapRef.value && typeof mapRef.value.flyTo === "function") {
			// If MapContainer exposes a wrapper flyTo(options)
			try {
				mapRef.value.flyTo(flyOptions);
			} catch (e) { console.warn("Map component flyTo failed:", e); }
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
			const flyCall = mapRef.value.map ? mapRef.value.map.flyTo : mapRef.value.flyTo;
			if (typeof flyCall === 'function') {
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
			const flyCall = mapRef.value.map ? mapRef.value.map.flyTo : mapRef.value.flyTo;
			if (typeof flyCall === 'function') {
				flyCall.call(mapRef.value.map || mapRef.value, {
					center: [userLocation.value[1], userLocation.value[0]],
					zoom: 15,
					pitch: 45,
					bearing: 0,
					essential: true,
				});
			}
		}
	};

	// ✅ UI offsets for "visual center" (between top bar & bottom carousel)
	const mapUiTopOffset = computed(() => {
		return 64;
	});

	/**
	 * Computes the padding needed for the map based on the bottom carousel height on mobile.
	 */
	const mapUiBottomOffset = computed(() => {
		if (isMobileView?.value) return bottomUiHeight?.value || 0;
		return 0;
	});

	return {
		mapRef,
		smoothFlyTo,
		handleLocateMe,
		handleEnterGiantView,
		handleExitGiantView,
		mapUiTopOffset,
		mapUiBottomOffset
	};
}
