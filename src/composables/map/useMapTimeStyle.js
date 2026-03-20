import { computed, onMounted, onUnmounted, ref, watch } from "vue";

/**
 * Auto day/night map style switcher for Chiang Mai.
 * Uses approximate sunrise/sunset times (no external API needed).
 * Chiang Mai: ~6:00 sunrise, ~18:15 sunset (varies ±30min seasonally).
 */

const SUNRISE_HOUR = 6; // 06:00
const SUNSET_HOUR = 18; // 18:00

const DAY_OVERRIDES = {
	background: "#e8e4dd",
	water: "#a3c4e0",
	building: "#d0cfc8",
	buildingOutline: "rgba(150, 148, 140, 0.3)",
	roadFill: "#ffffff",
	roadCasing: "#d6d5cf",
	landuse: "#d5e3c4",
	fog: {
		color: "#e8e6e0",
		"high-color": "#b0c8e0",
		"horizon-blend": 0.08,
		"star-intensity": 0,
	},
};

const NIGHT_OVERRIDES = {
	background: "#0b0321",
	water: "#181236",
	building: "#1a1940",
	buildingOutline: "rgba(139, 233, 253, 0.35)",
	roadFill: "#2d2b55",
	roadCasing: "#1e1b3a",
	landuse: "#0f1e0a",
	fog: {
		color: "#0b0321",
		"high-color": "#6272a4",
		"horizon-blend": 0.2,
		"star-intensity": 0.7,
	},
};

/**
 * @param {import('vue').Ref} map - Mapbox/MapLibre map instance ref
 */
export function useMapTimeStyle(map) {
	const isDaytime = ref(false);
	let intervalId = null;

	const checkTime = () => {
		const now = new Date();
		// Use Chiang Mai timezone (UTC+7)
		const utcHours = now.getUTCHours();
		const localHour = (utcHours + 7) % 24;
		isDaytime.value = localHour >= SUNRISE_HOUR && localHour < SUNSET_HOUR;
	};

	const applyTimeStyle = () => {
		const m = map?.value;
		if (!m || !m.isStyleLoaded?.()) return;

		const overrides = isDaytime.value ? DAY_OVERRIDES : NIGHT_OVERRIDES;

		try {
			// Background
			if (m.getLayer("background")) {
				m.setPaintProperty(
					"background",
					"background-color",
					overrides.background,
				);
			}

			// Water
			if (m.getLayer("water")) {
				m.setPaintProperty("water", "fill-color", overrides.water);
			}

			// Building outline (cyber layer)
			if (m.getLayer("buildings-cyber-outline")) {
				m.setPaintProperty(
					"buildings-cyber-outline",
					"line-color",
					overrides.buildingOutline,
				);
			}

			// Fog/atmosphere
			if (typeof m.setFog === "function") {
				m.setFog({
					range: [0.8, 8],
					"space-color": isDaytime.value ? "#87ceeb" : "#000000",
					...overrides.fog,
				});
			}
		} catch {
			// Style may still be transitioning; safe to skip.
		}
	};

	onMounted(() => {
		checkTime();
		// Re-check every 5 minutes
		intervalId = setInterval(checkTime, 5 * 60 * 1000);
	});

	onUnmounted(() => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	});

	// Apply style whenever isDaytime or map changes
	watch([isDaytime, map], () => {
		applyTimeStyle();
	});

	return {
		isDaytime: computed(() => isDaytime.value),
		applyTimeStyle,
	};
}
