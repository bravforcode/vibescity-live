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

	// Source-of-truth: Night Neon default (custom style), day falls back to Mapbox light.
	const NIGHT_STYLE = "mapbox://styles/phirrr/cmlktq68u002601se295iazmm";
	const DAY_STYLE = "mapbox://styles/phirrr/cmlktq68u002601se295iazmm";

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
		return isNightMode.value ? NIGHT_STYLE : DAY_STYLE;
	});

	return {
		isNightMode,
		mapStyle,
		currentHour,
	};
}
