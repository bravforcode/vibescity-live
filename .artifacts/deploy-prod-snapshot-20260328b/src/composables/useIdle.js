import { onMounted, onUnmounted, ref } from "vue";

export function useIdle(timeout = 3000) {
	const isIdle = ref(false);
	let timer = null;

	const resetTimer = () => {
		isIdle.value = false;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			isIdle.value = true;
		}, timeout);
	};

	const setupListeners = () => {
		// Events that count as "activity"
		const events = [
			"mousedown",
			"mousemove",
			"keydown",
			"scroll",
			"touchstart",
			"touchmove",
			"click",
		];

		events.forEach((event) => {
			window.addEventListener(event, resetTimer, { passive: true });
		});

		// Initial start
		resetTimer();
	};

	const cleanupListeners = () => {
		const events = [
			"mousedown",
			"mousemove",
			"keydown",
			"scroll",
			"touchstart",
			"touchmove",
			"click",
		];

		events.forEach((event) => {
			window.removeEventListener(event, resetTimer);
		});
		if (timer) clearTimeout(timer);
	};

	onMounted(() => {
		setupListeners();
	});

	onUnmounted(() => {
		cleanupListeners();
	});

	return {
		isIdle,
		kick: resetTimer, // Manual wake-up
	};
}
