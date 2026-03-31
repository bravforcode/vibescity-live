import { onMounted, onUnmounted, ref } from "vue";

/**
 * 📱 Visual Viewport Adapter
 * Handles mobile keyboards popping up and obscuring the UI.
 * Item 12: Viewport_Visual_Resize_Adapter()
 */
export function useVisualViewport() {
	const isKeyboardOpen = ref(false);
	let rafId = 0;

	const applyViewportChange = () => {
		rafId = 0;
		if (!window.visualViewport) return;

		const vv = window.visualViewport;

		document.documentElement.style.setProperty("--vv-height", `${vv.height}px`);

		isKeyboardOpen.value = vv.height < window.innerHeight * 0.8;

		if (isKeyboardOpen.value) {
			document.documentElement.classList.add("keyboard-open");
		} else {
			document.documentElement.classList.remove("keyboard-open");
		}
	};

	const handleViewportChange = () => {
		if (rafId) return;
		rafId = requestAnimationFrame(applyViewportChange);
	};

	onMounted(() => {
		if (typeof window === "undefined" || !window.visualViewport) return;

		applyViewportChange();

		window.visualViewport.addEventListener("resize", handleViewportChange, {
			passive: true,
		});
		window.visualViewport.addEventListener("scroll", handleViewportChange, {
			passive: true,
		});
	});

	onUnmounted(() => {
		if (rafId) cancelAnimationFrame(rafId);
		if (typeof window === "undefined" || !window.visualViewport) return;
		window.visualViewport.removeEventListener("resize", handleViewportChange);
		window.visualViewport.removeEventListener("scroll", handleViewportChange);
	});

	return {
		isKeyboardOpen,
	};
}
