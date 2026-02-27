/**
 * useScrollReveal — Triggers an animation class when an element enters the viewport.
 * Uses IntersectionObserver for performance.
 *
 * Usage:
 *   const { revealRef, isRevealed } = useScrollReveal({ threshold: 0.2 });
 *   <div ref="revealRef" :class="{ 'revealed': isRevealed }"> ... </div>
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * @param {Object} opts
 * @param {number} [opts.threshold=0.15] - Visibility ratio to trigger (0..1)
 * @param {string} [opts.rootMargin='0px 0px -40px 0px'] - Margin around root
 * @param {boolean} [opts.once=true] - Only trigger once (don't re-hide)
 */
export function useScrollReveal(opts = {}) {
	const {
		threshold = 0.15,
		rootMargin = "0px 0px -40px 0px",
		once = true,
	} = opts;

	const revealRef = ref(null);
	const isRevealed = ref(false);
	let observer = null;

	onMounted(() => {
		if (!revealRef.value || typeof IntersectionObserver === "undefined") {
			isRevealed.value = true; // Fallback: just show
			return;
		}

		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						isRevealed.value = true;
						if (once && observer) {
							observer.unobserve(entry.target);
						}
					} else if (!once) {
						isRevealed.value = false;
					}
				}
			},
			{ threshold, rootMargin },
		);

		observer.observe(revealRef.value);
	});

	onBeforeUnmount(() => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
	});

	return {
		/** Template ref to attach to the element */
		revealRef,
		/** Whether the element is visible */
		isRevealed,
	};
}
