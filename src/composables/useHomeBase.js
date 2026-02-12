/**
 * useHomeBase.js
 * Stores user's first location as "Home Base" for navigation back feature.
 * Works anonymously without requiring login.
 */

import { computed, onMounted, ref } from "vue";

const STORAGE_KEY = "vibe_home_base";

// Shared state across all component instances
const homeBase = ref(null);
const isSet = ref(false);

export function useHomeBase() {
	// Load from localStorage on first use
	onMounted(() => {
		if (!isSet.value) {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				try {
					homeBase.value = JSON.parse(stored);
					isSet.value = true;
				} catch (e) {
					// Invalid data, will be overwritten
				}
			}
		}
	});

	/**
	 * Set home base location (called on first app open)
	 * @param {number} lat - Latitude
	 * @param {number} lng - Longitude
	 * @param {string} [name] - Optional location name
	 */
	const setHomeBase = (lat, lng, name = "My Home") => {
		// Only set if not already set (first time only)
		if (isSet.value) return false;

		const data = {
			lat,
			lng,
			name,
			setAt: new Date().toISOString(),
			source: "auto", // 'auto' = geolocation, 'manual' = user set
		};

		homeBase.value = data;
		isSet.value = true;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

		return true;
	};

	/**
	 * Update home base manually (user can change their home)
	 */
	const updateHomeBase = (lat, lng, name = "My Home") => {
		const data = {
			lat,
			lng,
			name,
			setAt: new Date().toISOString(),
			source: "manual",
		};

		homeBase.value = data;
		isSet.value = true;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

		return true;
	};

	/**
	 * Clear home base (reset)
	 */
	const clearHomeBase = () => {
		homeBase.value = null;
		isSet.value = false;
		localStorage.removeItem(STORAGE_KEY);
	};

	/**
	 * Get directions URL to home base
	 * @param {string} provider - 'google' | 'grab' | 'bolt'
	 */
	const getDirectionsUrl = (provider = "google") => {
		if (!homeBase.value) return null;

		const { lat, lng } = homeBase.value;

		switch (provider) {
			case "grab":
				return `grab://open?screenType=BOOKING&dropOffLatitude=${lat}&dropOffLongitude=${lng}`;
			case "bolt":
				return `bolt://r?destination_lat=${lat}&destination_lng=${lng}`;
			default:
				return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
		}
	};

	return {
		homeBase: computed(() => homeBase.value),
		hasHomeBase: computed(() => isSet.value),
		setHomeBase,
		updateHomeBase,
		clearHomeBase,
		getDirectionsUrl,
	};
}
