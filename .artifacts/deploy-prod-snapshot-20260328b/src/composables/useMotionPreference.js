import { computed, onMounted, ref } from "vue";

/**
 * Composable to check and respect user's motion preferences
 * Follows WCAG 2.1 Level AAA standards
 */
export function useMotionPreference() {
	const prefersReducedMotion = ref(false);

	onMounted(() => {
		if (!import.meta.env.SSR && typeof window !== "undefined") {
			const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
			prefersReducedMotion.value = mediaQuery.matches;

			// Listen for changes in preference
			const handleChange = (e) => {
				prefersReducedMotion.value = e.matches;
			};
			mediaQuery.addEventListener("change", handleChange);

			// Cleanup
			return () => mediaQuery.removeEventListener("change", handleChange);
		}
	});

	const shouldReduceMotion = computed(() => prefersReducedMotion.value);

	/**
	 * Get animation duration respecting motion preferences
	 * @param {number} duration - Normal duration in ms
	 * @returns {number} Reduced duration if motion is reduced, otherwise normal
	 */
	const getAnimationDuration = (duration) =>
		shouldReduceMotion.value ? 1 : duration;

	/**
	 * Get transition speed respecting motion preferences
	 * @param {number} speed - Normal speed in ms
	 * @returns {number} Minimal speed if motion is reduced, otherwise normal
	 */
	const getTransitionSpeed = (speed) => (shouldReduceMotion.value ? 1 : speed);

	return {
		prefersReducedMotion: shouldReduceMotion,
		shouldReduceMotion,
		getAnimationDuration,
		getTransitionSpeed,
	};
}
