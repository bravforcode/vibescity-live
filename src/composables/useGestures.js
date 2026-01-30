// src/composables/useGestures.js
import { onMounted, onUnmounted, ref } from "vue";
import { useHaptics } from "./useHaptics";

export function useEdgeSwipe(onOpenDrawer) {
	const { successFeedback } = useHaptics();
	const touchStart = ref({ x: 0, y: 0 });

	const onTouchStart = (e) => {
		touchStart.value = { x: e.touches[0].clientX, y: e.touches[0].clientY };
	};

	const onTouchEnd = (e) => {
		const touchEnd = {
			x: e.changedTouches[0].clientX,
			y: e.changedTouches[0].clientY,
		};
		const diffX = touchEnd.x - touchStart.value.x;
		const diffY = touchEnd.y - touchStart.value.y;

		// Swipe Right from Edge Condition:
		// 1. Started near left edge (< 50px)
		// 2. Swiped right > 100px
		// 3. Horizontal movement dominance
		if (
			touchStart.value.x < 50 &&
			diffX > 100 &&
			Math.abs(diffX) > Math.abs(diffY) * 2
		) {
			if (onOpenDrawer) onOpenDrawer();
			successFeedback(); // Haptic for gesture success
		}
	};

	onMounted(() => {
		window.addEventListener("touchstart", onTouchStart, { passive: true });
		window.addEventListener("touchend", onTouchEnd, { passive: true });
	});

	onUnmounted(() => {
		window.removeEventListener("touchstart", onTouchStart);
		window.removeEventListener("touchend", onTouchEnd);
	});
}
