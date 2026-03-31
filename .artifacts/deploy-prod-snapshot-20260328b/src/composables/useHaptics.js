import { useUserPreferencesStore } from "../store/userPreferencesStore";

export const useHaptics = () => {
	const prefs = useUserPreferencesStore();

	// Check if vibration API is supported, enabled, AND user has interacted with the page.
	// Browsers block navigator.vibrate until after a tap/click/keypress event.
	const isSupported = () => {
		return (
			typeof navigator !== "undefined" &&
			"vibrate" in navigator &&
			prefs.isHapticsEnabled &&
			(navigator.userActivation?.hasBeenActive ?? true)
		);
	};

	const microFeedback = () => {
		if (isSupported()) {
			navigator.vibrate([20]);
		}
	};

	/**
	 * Light tap feedback - for minor interactions
	 */
	const tapFeedback = () => {
		if (isSupported()) {
			navigator.vibrate(10);
		}
	};

	/**
	 * Selection feedback - for selecting items
	 */
	const selectFeedback = () => {
		if (isSupported()) {
			navigator.vibrate([10, 30, 10]);
		}
	};

	/**
	 * Success feedback - for completing actions
	 */
	const successFeedback = () => {
		if (isSupported()) {
			navigator.vibrate([10, 50, 20, 50, 30]);
		}
	};

	/**
	 * Error feedback - for errors
	 */
	const errorFeedback = () => {
		if (isSupported()) {
			navigator.vibrate([50, 100, 50]);
		}
	};

	/**
	 * Heavy impact - for important actions
	 */
	const heavyFeedback = () => {
		if (isSupported()) {
			navigator.vibrate(50);
		}
	};

	/**
	 * Impact feedback with levels (light | medium | heavy)
	 */
	const impactFeedback = (level = "light") => {
		if (!isSupported()) return;

		const patterns = {
			light: 12,
			medium: [14, 40],
			heavy: [30, 60, 30],
		};

		const pattern = patterns[level] || patterns.light;
		navigator.vibrate(pattern);
	};

	return {
		isSupported: isSupported(),
		microFeedback,
		tapFeedback,
		selectFeedback,
		successFeedback,
		errorFeedback,
		heavyFeedback,
		impactFeedback,
	};
};

export default useHaptics;
