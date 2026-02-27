import { onMounted, onUnmounted, ref } from "vue";

/**
 * 📱 Visual Viewport Adapter
 * Handles mobile keyboards popping up and obscuring the UI.
 * Item 12: Viewport_Visual_Resize_Adapter()
 */
export function useVisualViewport() {
	const isKeyboardOpen = ref(false);

	const handleViewportChange = () => {
		if (!window.visualViewport) return;

		const vv = window.visualViewport;

		// Set a CSS variable for the visual viewport inner height
		document.documentElement.style.setProperty("--vv-height", `${vv.height}px`);

		// If the visual height is significantly less than the window's inner height,
		// it's very likely the virtual keyboard is open.
		isKeyboardOpen.value = vv.height < window.innerHeight * 0.8;

		if (isKeyboardOpen.value) {
			document.documentElement.classList.add("keyboard-open");
		} else {
			document.documentElement.classList.remove("keyboard-open");
		}
	};

	onMounted(() => {
		if (typeof window === "undefined" || !window.visualViewport) return;

		// Run once on mount
		handleViewportChange();

		// Listen for screen resizes (keyboard toggles) or scrolling over the keyboard
		window.visualViewport.addEventListener("resize", handleViewportChange);
		window.visualViewport.addEventListener("scroll", handleViewportChange);
	});

	onUnmounted(() => {
		if (typeof window === "undefined" || !window.visualViewport) return;
		window.visualViewport.removeEventListener("resize", handleViewportChange);
		window.visualViewport.removeEventListener("scroll", handleViewportChange);
	});

	return {
		isKeyboardOpen,
	};
}
