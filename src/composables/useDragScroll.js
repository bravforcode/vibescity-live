/**
 * 📁 src/composables/useDragScroll.js
 * ✅ Drag-to-scroll composable for horizontal scrolling containers
 * Features: Mouse drag, touch support, momentum, snap support
 */
import { onMounted, onUnmounted, ref } from "vue";

/**
 * Enables drag-to-scroll on a container element
 * @param {Ref<HTMLElement|null>} containerRef - Vue ref to the scrollable container
 * @param {Object} options - Configuration options
 */
export function useDragScroll(containerRef, options = {}) {
	const {
		momentum = true,
		snapSelector = null,
		sensitivity = 1.5,
		deceleration = 0.95,
		onScrollStart = null,
		onScrollEnd = null,
	} = options;

	const isDragging = ref(false);
	const isScrolling = ref(false);

	let startX = 0;
	let scrollLeft = 0;
	let velocity = 0;
	let lastX = 0;
	let lastTime = 0;
	let momentumFrame = null;

	// Handle mouse/touch start
	const handleStart = (e) => {
		const container = containerRef.value;
		if (!container) return;

		isDragging.value = true;
		isScrolling.value = true;
		container.style.cursor = "grabbing";
		container.style.scrollBehavior = "auto";

		// Get starting position
		const pageX = e.type.includes("touch") ? e.touches[0].pageX : e.pageX;
		startX = pageX - container.offsetLeft;
		scrollLeft = container.scrollLeft;
		lastX = pageX;
		lastTime = performance.now();
		velocity = 0;

		// Cancel any ongoing momentum
		if (momentumFrame) {
			cancelAnimationFrame(momentumFrame);
			momentumFrame = null;
		}

		onScrollStart?.();
	};

	// Handle mouse/touch move
	const handleMove = (e) => {
		if (!isDragging.value) return;
		const container = containerRef.value;
		if (!container) return;

		const pageX = e.type.includes("touch") ? e.touches[0].pageX : e.pageX;
		const x = pageX - container.offsetLeft;
		const walk = (x - startX) * sensitivity;

		// Calculate velocity for momentum
		const now = performance.now();
		const dt = now - lastTime;
		if (dt > 0) {
			velocity = (pageX - lastX) / dt;
		}
		lastX = pageX;
		lastTime = now;

		container.scrollLeft = scrollLeft - walk;

		// Prevent default to avoid page scroll on mobile
		if (e.cancelable) e.preventDefault();
	};

	// Handle mouse/touch end
	const handleEnd = () => {
		if (!isDragging.value) return;
		const container = containerRef.value;
		if (!container) return;

		isDragging.value = false;
		container.style.cursor = "grab";

		// Apply momentum scrolling
		if (momentum && Math.abs(velocity) > 0.1) {
			applyMomentum();
		} else {
			finishScroll();
		}
	};

	// Momentum animation
	const applyMomentum = () => {
		const container = containerRef.value;
		if (!container) return;

		velocity *= deceleration;

		if (Math.abs(velocity) > 0.01) {
			container.scrollLeft -= velocity * 16; // ~60fps
			momentumFrame = requestAnimationFrame(applyMomentum);
		} else {
			finishScroll();
		}
	};

	// Finish scroll - snap if needed
	const finishScroll = () => {
		const container = containerRef.value;
		if (!container) return;

		// Restore smooth scroll for snapping
		container.style.scrollBehavior = "smooth";
		isScrolling.value = false;

		// Snap to nearest element if selector provided
		if (snapSelector) {
			const items = container.querySelectorAll(snapSelector);
			if (items.length > 0) {
				const containerRect = container.getBoundingClientRect();
				const containerCenter = containerRect.left + containerRect.width / 2;

				let closestItem = null;
				let closestDistance = Infinity;

				items.forEach((item) => {
					const rect = item.getBoundingClientRect();
					const itemCenter = rect.left + rect.width / 2;
					const distance = Math.abs(itemCenter - containerCenter);

					if (distance < closestDistance) {
						closestDistance = distance;
						closestItem = item;
					}
				});

				if (closestItem) {
					closestItem.scrollIntoView({
						behavior: "smooth",
						inline: "center",
						block: "nearest",
					});
				}
			}
		}

		onScrollEnd?.();
	};

	// Setup event listeners
	const setupListeners = () => {
		const container = containerRef.value;
		if (!container) return;

		container.style.cursor = "grab";

		// Mouse events
		container.addEventListener("mousedown", handleStart);
		container.addEventListener("mousemove", handleMove);
		container.addEventListener("mouseup", handleEnd);
		container.addEventListener("mouseleave", handleEnd);

		// Touch events
		container.addEventListener("touchstart", handleStart, { passive: true });
		container.addEventListener("touchmove", handleMove, { passive: false });
		container.addEventListener("touchend", handleEnd);
	};

	// Cleanup
	const cleanup = () => {
		const container = containerRef.value;
		if (!container) return;

		container.removeEventListener("mousedown", handleStart);
		container.removeEventListener("mousemove", handleMove);
		container.removeEventListener("mouseup", handleEnd);
		container.removeEventListener("mouseleave", handleEnd);
		container.removeEventListener("touchstart", handleStart);
		container.removeEventListener("touchmove", handleMove);
		container.removeEventListener("touchend", handleEnd);

		if (momentumFrame) {
			cancelAnimationFrame(momentumFrame);
		}
	};

	onMounted(() => {
		// Wait for ref to be populated
		setTimeout(setupListeners, 100);
	});

	onUnmounted(cleanup);

	return {
		isDragging,
		isScrolling,
		setupListeners,
		cleanup,
	};
}

export default useDragScroll;
