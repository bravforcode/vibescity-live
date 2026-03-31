import { computed, ref } from "vue";
import { calculateDistance } from "../utils/shopUtils";

const DESKTOP_MIN_WIDTH = 1280;

export function useMapLogic({
	isMobileView,
	isTabletView,
	isDesktopView,
	bottomUiHeight,
	userLocation,
}) {
	const mapRef = ref(null);

	// ── Nearby Pin Filtering ─────────────────────────────────────────
	// Shows max 30 venues within 20km, shuffled every 30 minutes.
	// Shuffle is deterministic per 30-min bucket so it doesn't cause
	// excessive re-renders but still provides variety over time.
	const NEARBY_MAX_COUNT = 30;
	const NEARBY_RADIUS_KM = 20;
	const SHUFFLE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

	// Seeded shuffle using Durstenfeld (Fisher-Yates) algorithm.
	const seededShuffle = (arr, seed) => {
		const result = [...arr];
		let s = seed;
		for (let i = result.length - 1; i > 0; i--) {
			// LCG pseudo-random number
			s = (s * 1664525 + 1013904223) & 0xffffffff;
			const j = Math.abs(s) % (i + 1);
			[result[i], result[j]] = [result[j], result[i]];
		}
		return result;
	};

	/**
	 * Filter and shuffle shops to nearby 30 within 20km,
	 * refreshing the shuffle bucket every 30 minutes.
	 * @param {Array} allShops - full list of processed shops
	 * @returns {Array} up to 30 nearby shops
	 */
	const getNearbyPins = (allShops) => {
		const userLoc = userLocation?.value;
		const hasUserLoc =
			Array.isArray(userLoc) &&
			userLoc.length >= 2 &&
			Number.isFinite(Number(userLoc[0])) &&
			Number.isFinite(Number(userLoc[1]));

		if (!hasUserLoc || !allShops?.length) {
			// No user location — return first 30 with valid coords
			return (
				allShops
					?.filter(
						(s) =>
							Number.isFinite(Number(s?.lat)) &&
							Number.isFinite(Number(s?.lng)),
					)
					.slice(0, NEARBY_MAX_COUNT) ?? []
			);
		}

		const userLat = Number(userLoc[0]);
		const userLng = Number(userLoc[1]);

		// Filter to shops within radius and with valid coords
		const nearby = allShops
			.filter((s) => {
				const lat = Number(s?.lat);
				const lng = Number(s?.lng);
				if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
				const dist = calculateDistance(userLat, userLng, lat, lng);
				return dist <= NEARBY_RADIUS_KM;
			})
			.map((s) => {
				const dist = calculateDistance(
					userLat,
					userLng,
					Number(s.lat),
					Number(s.lng),
				);
				return { ...s, distance: dist };
			})
			.sort((a, b) => a.distance - b.distance);

		// Use time-bucket seed (changes every 30 minutes)
		const timeBucket = Math.floor(Date.now() / SHUFFLE_INTERVAL_MS);
		// Mix in user position so different users see different orders
		const seed =
			timeBucket ^ Math.round(userLat * 1000) ^ Math.round(userLng * 1000);

		const shuffled = seededShuffle(nearby, seed);
		return shuffled.slice(0, NEARBY_MAX_COUNT);
	};

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
			center: [lng, lat], // MapLibre uses [lng, lat]
			zoom: isDesktopLayout.value ? 15.5 : 16.0,
			pitch: 60, // 3D tilt without showing beyond map world
			bearing: 0,
			speed: 0.7,
			curve: 1.2,
			essential: true,
			offset: [0, -mobileBottomOffset],
			padding: { top: 0, bottom: 0, left: 0, right: 0 },
			maxDuration: 2000,
		};

		// Execute Fly
		// MapLibre GL expects map.flyTo({center, zoom, ...})
		if (mapRef.value?.map && typeof mapRef.value.map.flyTo === "function") {
			try {
				mapRef.value.map.flyTo(flyOptions);
			} catch (e) {
				console.warn("MapLibre flyTo failed:", e);
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

	const handleLocateMe = (selectFeedback, options = {}) => {
		if (selectFeedback) selectFeedback();
		const locateTarget = Array.isArray(options?.coords)
			? options.coords
			: userLocation?.value;
		if (mapRef.value && Array.isArray(locateTarget)) {
			const lngLat = [locateTarget[1], locateTarget[0]];
			if (typeof mapRef.value.locateUser === "function") {
				mapRef.value.locateUser(lngLat, 17, 0, {
					refine: Boolean(options?.refine),
				});
			} else if (typeof mapRef.value.focusLocation === "function") {
				mapRef.value.focusLocation(lngLat, 17, 60, 0, {
					cameraMode: "locate",
					duration: options?.refine ? 900 : 1200,
				});
			} else {
				// Fallback if focusLocation is not exposed but flyTo is
				smoothFlyTo(locateTarget);
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
		getNearbyPins,
	};
}
