import { computed, onMounted, onUnmounted, ref } from "vue";

/**
 * useTimeTheme - Manages dynamic map styles based on time of day.
 *
 * Logic:
 * - Day Mode (06:00 - 17:59): Light/Standard Map Style.
 * - Night Mode (18:00 - 05:59): Dark/Neon Map Style.
 */
export function useTimeTheme() {
	const currentHour = ref(new Date().getHours());
	const intervalId = ref(null);

	const updateTime = () => {
		currentHour.value = new Date().getHours();
	};

	onMounted(() => {
		updateTime();
		// Check every minute to be efficient
		intervalId.value = setInterval(updateTime, 60000);
	});

	onUnmounted(() => {
		if (intervalId.value) clearInterval(intervalId.value);
	});

	const isNightMode = computed(() => {
		return currentHour.value >= 18 || currentHour.value < 6;
	});

	const mapStyle = computed(() => {
		// Mapbox Style URIs (Replace with your actual style URLs)
		// Using standard Mapbox styles as placeholders if custom ones aren't defined
		return isNightMode.value
			? "mapbox://styles/mapbox/dark-v11" // Night: Dark/Neon
			: "mapbox://styles/mapbox/light-v11"; // Day: Standard
	});

	return {
		isNightMode,
		mapStyle,
		currentHour,
	};
}
