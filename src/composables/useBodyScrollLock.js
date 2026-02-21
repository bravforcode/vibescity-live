// src/composables/useBodyScrollLock.js
import { onUnmounted } from "vue";

const state = {
	locked: false,
	scrollY: 0,
};

export function useBodyScrollLock() {
	const lock = () => {
		if (typeof window === "undefined") return;
		if (state.locked) return;

		state.scrollY = window.scrollY || 0;
		state.locked = true;

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
		if (!state.locked) return;

		state.locked = false;

		document.body.style.position = "";
		document.body.style.top = "";
		document.body.style.left = "";
		document.body.style.right = "";
		document.body.style.width = "";
		document.body.style.overflow = "";
		document.body.style.touchAction = "";

		window.scrollTo(0, state.scrollY);
	};

	onUnmounted(() => {
		unlock();
	});

	return { lock, unlock };
}
