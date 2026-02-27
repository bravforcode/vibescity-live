// src/composables/useBodyScrollLock.js
import { onUnmounted } from "vue";

const state = {
	lockCount: 0,
	scrollY: 0,
};

export function useBodyScrollLock() {
	const lock = () => {
		if (typeof window === "undefined") return;
		state.lockCount += 1;
		if (state.lockCount > 1) return;

		state.scrollY = window.scrollY || 0;

		document.body.style.position = "fixed";
		document.body.style.top = `-${state.scrollY}px`;
		document.body.style.left = "0";
		document.body.style.right = "0";
		document.body.style.width = "100%";
		document.body.style.overflow = "hidden";
		document.body.style.touchAction = "none";
	};

	const unlock = () => {
		if (typeof window === "undefined") return;
		if (state.lockCount === 0) return;
		state.lockCount = Math.max(0, state.lockCount - 1);
		if (state.lockCount > 0) return;

		const top = document.body.style.top;
		const scrollY = top ? Math.abs(parseInt(top, 10)) : state.scrollY;

		document.body.style.position = "";
		document.body.style.top = "";
		document.body.style.left = "";
		document.body.style.right = "";
		document.body.style.width = "";
		document.body.style.overflow = "";
		document.body.style.touchAction = "";
		const resolvedScrollY = Number.isFinite(scrollY) ? scrollY : state.scrollY;
		window.scrollTo(0, resolvedScrollY);
		state.scrollY = resolvedScrollY;
	};

	onUnmounted(() => {
		unlock();
	});

	return { lock, unlock };
}
