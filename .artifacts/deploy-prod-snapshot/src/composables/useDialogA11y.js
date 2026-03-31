import { nextTick, onUnmounted, watch } from "vue";
import { useBodyScrollLock } from "./useBodyScrollLock";

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const resolveOpenState = (isOpen) =>
	typeof isOpen === "function" ? Boolean(isOpen()) : Boolean(isOpen?.value);

export function useDialogA11y({
	isOpen,
	containerRef,
	initialFocusRef = null,
	onClose = null,
	lockScroll = true,
}) {
	let previousFocusedElement = null;
	const { lock, unlock } = useBodyScrollLock();

	const lockBodyScroll = (locked) => {
		if (!lockScroll || typeof document === "undefined") return;
		if (locked) {
			lock();
		} else {
			unlock();
		}
	};

	const trapFocus = (event) => {
		if (event.key !== "Tab") return;
		const root = containerRef?.value;
		if (!root) return;
		const focusables = root.querySelectorAll(FOCUSABLE_SELECTOR);
		if (!focusables?.length) return;

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const handleKeydown = (event) => {
		if (!resolveOpenState(isOpen)) return;
		if (event.key === "Escape" && typeof onClose === "function") {
			event.preventDefault();
			onClose();
			return;
		}
		trapFocus(event);
	};

	watch(
		() => resolveOpenState(isOpen),
		(open) => {
			if (typeof document === "undefined") return;
			if (open) {
				previousFocusedElement = document.activeElement;
				lockBodyScroll(true);
				document.addEventListener("keydown", handleKeydown);
				nextTick(() => {
					initialFocusRef?.value?.focus?.();
				});
				return;
			}

			lockBodyScroll(false);
			document.removeEventListener("keydown", handleKeydown);
			if (previousFocusedElement?.focus) {
				nextTick(() => previousFocusedElement.focus());
			}
		},
		{ immediate: true },
	);

	onUnmounted(() => {
		lockBodyScroll(false);
		if (typeof document !== "undefined") {
			document.removeEventListener("keydown", handleKeydown);
		}
	});
}
