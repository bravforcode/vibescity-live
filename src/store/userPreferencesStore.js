/**
 * 📁 src/store/userPreferencesStore.js
 * ✅ User Preferences & Home Location Store
 * Features: Take Me Home, Navigation deep links, Saved places
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { openExternal } from "../utils/browserUtils";

// Thailand navigation app configs
const NAV_APPS = {
	grab: {
		name: "Grab",
		icon: "🚗",
		deepLink: (lat, lng) =>
			`https://grab.onelink.me/2695613898?af_dp=grab://open?dropOffLatitude=${lat}&dropOffLongitude=${lng}`,
		fallback: () => `https://www.grab.com/th/`,
	},
	bolt: {
		name: "Bolt",
		icon: "⚡",
		deepLink: (lat, lng) =>
			`https://bolt.eu/en/order/?destination=${lat},${lng}`,
		fallback: () => `https://bolt.eu/`,
	},
	googleMaps: {
		name: "Google Maps",
		icon: "🗺️",
		deepLink: (lat, lng, fromLat, fromLng) =>
			fromLat && fromLng
				? `https://www.google.com/maps/dir/${fromLat},${fromLng}/${lat},${lng}`
				: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
	},
	appleMaps: {
		name: "Apple Maps",
		icon: "🍎",
		deepLink: (lat, lng) =>
			`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
	},
	waze: {
		name: "Waze",
		icon: "🚙",
		deepLink: (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
	},
};

export const useUserPreferencesStore = defineStore(
	"userPreferences",
	() => {
		// ═══════════════════════════════════════════
		// 📦 State
		// ═══════════════════════════════════════════
		const homeLocation = ref(null); // [lat, lng]
		const homeName = ref("Home");
		const homeAddress = ref("");
		const firstVisitLocation = ref(null);
		const savedPlaces = ref([]); // Array of { id, name, coords, icon, address }
		const preferredNavApp = ref("googleMaps");
		const recentSearches = ref([]); // Last 10 searches

		// ═══════════════════════════════════════════
		// 📊 Computed
		// ═══════════════════════════════════════════
		const hasHomeSet = computed(() => homeLocation.value !== null);
		const homeCoords = computed(() => {
			if (!homeLocation.value) return null;
			return { lat: homeLocation.value[0], lng: homeLocation.value[1] };
		});
		const savedPlaceCount = computed(() => savedPlaces.value.length);
		const navApps = computed(() => NAV_APPS);

		// ═══════════════════════════════════════════
		// 🏠 Home Location Actions
		// ═══════════════════════════════════════════

		/**
		 * Set home location
		 */
		const setHomeLocation = (coords, name = "Home", address = "") => {
			if (!coords) return false;

			// Normalize coords
			let lat, lng;
			if (Array.isArray(coords)) {
				[lat, lng] = coords;
			} else if (typeof coords === "object") {
				lat = coords.lat ?? coords.latitude;
				lng = coords.lng ?? coords.longitude;
			}

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

			homeLocation.value = [lat, lng];
			homeName.value = name;
			homeAddress.value = address;

			console.log(
				`🏠 Home set: ${name} [${lat.toFixed(5)}, ${lng.toFixed(5)}]`,
			);
			return true;
		};

		/**
		 * Clear home location
		 */
		const clearHome = () => {
			homeLocation.value = null;
			homeName.value = "Home";
			homeAddress.value = "";
		};

		/**
		 * Save first visit location (auto-set as home if no home)
		 */
		const saveFirstVisit = (coords) => {
			if (firstVisitLocation.value !== null) return false;

			let lat, lng;
			if (Array.isArray(coords)) [lat, lng] = coords;
			else if (coords?.lat) {
				lat = coords.lat;
				lng = coords.lng;
			}

			if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

			firstVisitLocation.value = [lat, lng];

			// Auto-set as home if not set
			if (!homeLocation.value) {
				setHomeLocation([lat, lng], "My Location");
			}

			return true;
		};

		// ═══════════════════════════════════════════
		// 🗺️ Navigation Actions
		// ═══════════════════════════════════════════

		/**
		 * Get navigation URL to home
		 */
		const getNavigationToHome = (currentLocation = null) => {
			if (!homeLocation.value) return null;

			const [destLat, destLng] = homeLocation.value;
			const fromLat = currentLocation?.[0];
			const fromLng = currentLocation?.[1];

			const urls = {};
			for (const [key, app] of Object.entries(NAV_APPS)) {
				urls[key] = {
					name: app.name,
					icon: app.icon,
					url: app.deepLink(destLat, destLng, fromLat, fromLng),
					fallback: app.fallback?.(destLat, destLng),
				};
			}

			return urls;
		};

		/**
		 * Get navigation URL to any destination
		 */
		const getNavigationTo = (destCoords, currentLocation = null) => {
			if (!destCoords) return null;

			let destLat, destLng;
			if (Array.isArray(destCoords)) [destLat, destLng] = destCoords;
			else {
				destLat = destCoords.lat;
				destLng = destCoords.lng;
			}

			const fromLat = currentLocation?.[0];
			const fromLng = currentLocation?.[1];

			const urls = {};
			for (const [key, app] of Object.entries(NAV_APPS)) {
				urls[key] = {
					name: app.name,
					icon: app.icon,
					url: app.deepLink(destLat, destLng, fromLat, fromLng),
				};
			}

			return urls;
		};

		/**
		 * Open preferred navigation app
		 */
		const navigateToHome = (currentLocation = null) => {
			const urls = getNavigationToHome(currentLocation);
			if (!urls) return false;

			const preferred = urls[preferredNavApp.value] || urls.googleMaps;
			openExternal(preferred.url);
			return true;
		};

		/**
		 * Navigate to destination
		 */
		const navigateTo = (destCoords, currentLocation = null, app = null) => {
			const urls = getNavigationTo(destCoords, currentLocation);
			if (!urls) return false;

			const navApp = app || preferredNavApp.value;
			const target = urls[navApp] || urls.googleMaps;
			openExternal(target.url);
			return true;
		};

		// ═══════════════════════════════════════════
		// 📍 Saved Places Actions
		// ═══════════════════════════════════════════

		/**
		 * Add a saved place
		 */
		const addSavedPlace = (name, coords, icon = "📍", address = "") => {
			const id = `place_${Date.now()}`;
			let lat, lng;

			if (Array.isArray(coords)) [lat, lng] = coords;
			else {
				lat = coords.lat;
				lng = coords.lng;
			}

			savedPlaces.value = [
				...savedPlaces.value,
				{
					id,
					name,
					coords: [lat, lng],
					icon,
					address,
					createdAt: new Date().toISOString(),
				},
			];

			return id;
		};

		/**
		 * Remove saved place
		 */
		const removeSavedPlace = (placeId) => {
			savedPlaces.value = savedPlaces.value.filter((p) => p.id !== placeId);
		};

		/**
		 * Update saved place
		 */
		const updateSavedPlace = (placeId, updates) => {
			const idx = savedPlaces.value.findIndex((p) => p.id === placeId);
			if (idx >= 0) {
				savedPlaces.value[idx] = { ...savedPlaces.value[idx], ...updates };
			}
		};

		// ═══════════════════════════════════════════
		// 🔍 Search History
		// ═══════════════════════════════════════════

		const addRecentSearch = (query) => {
			if (!query?.trim()) return;
			recentSearches.value = [
				query.trim(),
				...recentSearches.value.filter((s) => s !== query.trim()),
			].slice(0, 10);
		};

		const clearRecentSearches = () => {
			recentSearches.value = [];
		};

		// ═══════════════════════════════════════════
		// ⚙️ Preferences & Accessibility
		// ═══════════════════════════════════════════
		const isReducedMotion = ref(false);
		const isHapticsEnabled = ref(true);
		const isLowPowerMode = ref(false);
		// Map Performance / Visual FX
		const isAmbientFxEnabled = ref(false);
		const isNeonPulseEnabled = ref(false);
		const isHeatmapEnabled = ref(true);
		const is3dBuildingsEnabled = ref(true);
		const isMapFogEnabled = ref(true);
		// Map Visual Presets / Budget (Performance-first default)
		const mapVisualPreset = ref("smooth"); // smooth | colorful | cinematic
		const motionBudget = ref("micro"); // micro | balanced | full
		const isMapHapticsEnabled = ref(true);
		const isLiveChipsEnabled = ref(true);
		const isViewportGlowEnabled = ref(true);

		const setPreferredNavApp = (appKey) => {
			if (NAV_APPS[appKey]) preferredNavApp.value = appKey;
		};

		const toggleReducedMotion = () => {
			isReducedMotion.value = !isReducedMotion.value;
		};

		const toggleHaptics = () => {
			isHapticsEnabled.value = !isHapticsEnabled.value;
		};

		const toggleLowPowerMode = () => {
			isLowPowerMode.value = !isLowPowerMode.value;
		};
		const toggleAmbientFx = () => {
			isAmbientFxEnabled.value = !isAmbientFxEnabled.value;
		};
		const toggleNeonPulse = () => {
			isNeonPulseEnabled.value = !isNeonPulseEnabled.value;
		};
		const toggleHeatmap = () => {
			isHeatmapEnabled.value = !isHeatmapEnabled.value;
		};
		const toggle3dBuildings = () => {
			is3dBuildingsEnabled.value = !is3dBuildingsEnabled.value;
		};
		const toggleMapFog = () => {
			isMapFogEnabled.value = !isMapFogEnabled.value;
		};
		const setMapVisualPreset = (preset) => {
			if (!["smooth", "colorful", "cinematic"].includes(preset)) return;
			mapVisualPreset.value = preset;
		};
		const setMotionBudget = (budget) => {
			if (!["micro", "balanced", "full"].includes(budget)) return;
			motionBudget.value = budget;
		};
		const toggleMapHaptics = () => {
			isMapHapticsEnabled.value = !isMapHapticsEnabled.value;
		};
		const toggleLiveChips = () => {
			isLiveChipsEnabled.value = !isLiveChipsEnabled.value;
		};
		const toggleViewportGlow = () => {
			isViewportGlowEnabled.value = !isViewportGlowEnabled.value;
		};
		const applyMapPreset = (preset) => {
			setMapVisualPreset(preset);
			if (preset === "smooth") {
				// Performance-first
				isAmbientFxEnabled.value = false;
				isNeonPulseEnabled.value = false;
				isHeatmapEnabled.value = true;
				is3dBuildingsEnabled.value = true;
				isMapFogEnabled.value = true;
				isViewportGlowEnabled.value = true;
				setMotionBudget("micro");
				return;
			}
			if (preset === "colorful") {
				isAmbientFxEnabled.value = false;
				isNeonPulseEnabled.value = true;
				isHeatmapEnabled.value = true;
				is3dBuildingsEnabled.value = true;
				isMapFogEnabled.value = true;
				isViewportGlowEnabled.value = true;
				setMotionBudget("balanced");
				return;
			}
			// cinematic
			isAmbientFxEnabled.value = false;
			isNeonPulseEnabled.value = true;
			isHeatmapEnabled.value = true;
			is3dBuildingsEnabled.value = true;
			isMapFogEnabled.value = true;
			isViewportGlowEnabled.value = true;
			setMotionBudget("full");
		};

		return {
			// State
			homeLocation,
			homeName,
			homeAddress,
			firstVisitLocation,
			savedPlaces,
			preferredNavApp,
			recentSearches,
			// ✅ Settings State
			isReducedMotion,
			isHapticsEnabled,
			isLowPowerMode,
			isAmbientFxEnabled,
			isNeonPulseEnabled,
			isHeatmapEnabled,
			is3dBuildingsEnabled,
			isMapFogEnabled,
			mapVisualPreset,
			motionBudget,
			isMapHapticsEnabled,
			isLiveChipsEnabled,
			isViewportGlowEnabled,
			// Computed
			hasHomeSet,
			homeCoords,
			savedPlaceCount,
			navApps,
			// Home Actions
			setHomeLocation,
			clearHome,
			saveFirstVisit,
			// Navigation Actions
			getNavigationToHome,
			getNavigationTo,
			navigateToHome,
			navigateTo,
			// Saved Places
			addSavedPlace,
			removeSavedPlace,
			updateSavedPlace,
			// Search History
			addRecentSearch,
			clearRecentSearches,
			// Preferences
			setPreferredNavApp,
			toggleReducedMotion,
			toggleHaptics,
			toggleLowPowerMode,
			toggleAmbientFx,
			toggleNeonPulse,
			toggleHeatmap,
			toggle3dBuildings,
			toggleMapFog,
			setMapVisualPreset,
			setMotionBudget,
			toggleMapHaptics,
			toggleLiveChips,
			toggleViewportGlow,
			applyMapPreset,
			// Legacy alias
			getNavigationUrl: getNavigationToHome,
		};
	},
	{
		persist: {
			paths: [
				"homeLocation",
				"homeName",
				"homeAddress",
				"firstVisitLocation",
				"savedPlaces",
				"preferredNavApp",
				"recentSearches",
				// ✅ Persist Settings
				"isReducedMotion",
				"isHapticsEnabled",
				"isLowPowerMode",
				"isAmbientFxEnabled",
				"isNeonPulseEnabled",
				"isHeatmapEnabled",
				"is3dBuildingsEnabled",
				"isMapFogEnabled",
				"mapVisualPreset",
				"motionBudget",
				"isMapHapticsEnabled",
				"isLiveChipsEnabled",
				"isViewportGlowEnabled",
			],
			key: "vibe-preferences",
		},
	},
);
