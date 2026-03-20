/**
 * useFocusTrap.js — Lightweight focus trap composable for modals/drawers.
 * Traps Tab/Shift+Tab within the container and returns focus to trigger on close.
 */
import { onMounted, onUnmounted } from "vue";

export function useFocusTrap(containerRef, triggerRef = null) {
	const getFocusableElements = () => {
		if (!containerRef.value) return [];
		const selector = [
			"a[href]",
			"button:not([disabled])",
			"input:not([disabled])",
			"textarea:not([disabled])",
			"select:not([disabled])",
			"[tabindex]:not([tabindex='-1'])",
		].join(",");
		return Array.from(containerRef.value.querySelectorAll(selector));
	};

	const handleKeyDown = (e) => {
		if (e.key !== "Tab") return;

		const focusable = getFocusableElements();
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement;

		if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	};

	onMounted(() => {
		const container = containerRef.value;
		if (!container) return;

		// Focus first element on mount
		const focusable = getFocusableElements();
		if (focusable.length > 0) {
			focusable[0].focus();
		}

		container.addEventListener("keydown", handleKeyDown);
	});

	onUnmounted(() => {
		const container = containerRef.value;
		if (container) {
			container.removeEventListener("keydown", handleKeyDown);
		}

		// Return focus to trigger element if it exists
		if (triggerRef?.value) {
			triggerRef.value.focus();
		}
	});
}
