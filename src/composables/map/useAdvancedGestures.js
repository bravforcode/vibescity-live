/**
 * useAdvancedGestures - Enhanced Touch & Mouse Gestures
 *
 * Features:
 * - Multi-touch gestures (pinch, rotate, swipe)
 * - Momentum scrolling
 * - Smart gesture recognition
 * - Haptic feedback integration
 * - Gesture history for ML predictions
 * - Accessibility support
 */

import { computed, onMounted, onUnmounted, ref } from "vue";
import { useHaptics } from "../useHaptics";

const SWIPE_THRESHOLD = 50; // pixels
const SWIPE_VELOCITY_THRESHOLD = 0.5; // pixels/ms
const PINCH_THRESHOLD = 0.1; // scale difference
const ROTATION_THRESHOLD = 5; // degrees
const DOUBLE_TAP_DELAY = 300; // ms
const LONG_PRESS_DELAY = 500; // ms

export function useAdvancedGestures(mapContainer, map, options = {}) {
	const { impactFeedback, selectionFeedback } = useHaptics();

	const isGesturing = ref(false);
	const gestureType = ref(null); // 'pan', 'pinch', 'rotate', 'swipe'
	const gestureHistory = ref([]);

	let touchStartTime = 0;
	let touchStartPos = { x: 0, y: 0 };
	let lastTouchPos = { x: 0, y: 0 };
	let touchVelocity = { x: 0, y: 0 };
	let initialPinchDistance = 0;
	let initialRotation = 0;
	let lastTapTime = 0;
	let longPressTimer = null;
	let momentumAnimationFrame = null;

	// Calculate distance between two touch points
	const getTouchDistance = (touch1, touch2) => {
		const dx = touch2.clientX - touch1.clientX;
		const dy = touch2.clientY - touch1.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	};

	// Calculate angle between two touch points
	const getTouchAngle = (touch1, touch2) => {
		const dx = touch2.clientX - touch1.clientX;
		const dy = touch2.clientY - touch1.clientY;
		return Math.atan2(dy, dx) * (180 / Math.PI);
	};

	// Handle touch start
	const handleTouchStart = (e) => {
		const touches = e.touches;
		touchStartTime = Date.now();

		if (touches.length === 1) {
			// Single touch
			touchStartPos = {
				x: touches[0].clientX,
				y: touches[0].clientY,
			};
			lastTouchPos = { ...touchStartPos };

			// Start long press detection
			longPressTimer = setTimeout(() => {
				handleLongPress(touchStartPos);
			}, LONG_PRESS_DELAY);
		} else if (touches.length === 2) {
			// Multi-touch
			clearTimeout(longPressTimer);
			initialPinchDistance = getTouchDistance(touches[0], touches[1]);
			initialRotation = getTouchAngle(touches[0], touches[1]);
			isGesturing.value = true;
		}
	};

	// Handle touch move
	const handleTouchMove = (e) => {
		const touches = e.touches;

		// Cancel long press if moved
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (touches.length === 1) {
			// Pan gesture
			const currentPos = {
				x: touches[0].clientX,
				y: touches[0].clientY,
			};

			const deltaTime = Date.now() - touchStartTime;
			if (deltaTime > 0) {
				touchVelocity = {
					x: (currentPos.x - lastTouchPos.x) / deltaTime,
					y: (currentPos.y - lastTouchPos.y) / deltaTime,
				};
			}

			lastTouchPos = currentPos;
			gestureType.value = "pan";
		} else if (touches.length === 2) {
			// Pinch or rotate gesture
			const currentDistance = getTouchDistance(touches[0], touches[1]);
			const currentRotation = getTouchAngle(touches[0], touches[1]);

			const scaleDiff =
				Math.abs(currentDistance - initialPinchDistance) / initialPinchDistance;
			const rotationDiff = Math.abs(currentRotation - initialRotation);

			if (scaleDiff > PINCH_THRESHOLD) {
				gestureType.value = "pinch";
				impactFeedback("light");
			}

			if (rotationDiff > ROTATION_THRESHOLD) {
				gestureType.value = "rotate";
				impactFeedback("light");
			}
		}
	};

	// Handle touch end
	const handleTouchEnd = (_e) => {
		clearTimeout(longPressTimer);

		const touchDuration = Date.now() - touchStartTime;
		const touchDistance = Math.sqrt(
			(lastTouchPos.x - touchStartPos.x) ** 2 +
				(lastTouchPos.y - touchStartPos.y) ** 2,
		);

		// Detect swipe
		if (touchDistance > SWIPE_THRESHOLD) {
			const velocity = Math.sqrt(
				touchVelocity.x * touchVelocity.x + touchVelocity.y * touchVelocity.y,
			);

			if (velocity > SWIPE_VELOCITY_THRESHOLD) {
				handleSwipe(touchVelocity);
			}
		}

		// Detect tap
		if (touchDuration < 200 && touchDistance < 10) {
			handleTap(touchStartPos);
		}

		// Apply momentum if panning
		if (gestureType.value === "pan" && !isGesturing.value) {
			applyMomentum(touchVelocity);
		}

		// Record gesture in history
		gestureHistory.value.push({
			type: gestureType.value,
			duration: touchDuration,
			distance: touchDistance,
			velocity: touchVelocity,
			timestamp: Date.now(),
		});

		// Keep only last 20 gestures
		if (gestureHistory.value.length > 20) {
			gestureHistory.value.shift();
		}

		isGesturing.value = false;
		gestureType.value = null;
	};

	// Handle tap
	const handleTap = (pos) => {
		const now = Date.now();
		const timeSinceLastTap = now - lastTapTime;

		if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
			// Double tap detected
			handleDoubleTap(pos);
		} else {
			// Single tap
			selectionFeedback();
		}

		lastTapTime = now;
	};

	// Handle double tap
	const handleDoubleTap = (pos) => {
		if (!map.value) return;

		impactFeedback("medium");

		// Zoom in on double tap location
		const point = map.value.project([pos.x, pos.y]);
		map.value.easeTo({
			center: map.value.unproject(point),
			zoom: map.value.getZoom() + 1,
			duration: 300,
		});
	};

	// Handle long press
	const handleLongPress = (pos) => {
		impactFeedback("heavy");

		// Emit long press event for context menu
		if (options.onLongPress) {
			options.onLongPress(pos);
		}
	};

	// Handle swipe
	const handleSwipe = (velocity) => {
		const direction = Math.atan2(velocity.y, velocity.x) * (180 / Math.PI);

		impactFeedback("medium");

		// Emit swipe event
		if (options.onSwipe) {
			options.onSwipe({
				direction,
				velocity,
			});
		}
	};

	// Apply momentum scrolling
	const applyMomentum = (velocity) => {
		if (!map.value) return;

		const friction = 0.92;
		let vx = velocity.x * 100;
		let vy = velocity.y * 100;

		const animate = () => {
			if (Math.abs(vx) < 0.1 && Math.abs(vy) < 0.1) {
				momentumAnimationFrame = null;
				return;
			}

			const center = map.value.getCenter();
			const newCenter = [center.lng + vx * 0.001, center.lat - vy * 0.001];

			map.value.setCenter(newCenter);

			vx *= friction;
			vy *= friction;

			momentumAnimationFrame = requestAnimationFrame(animate);
		};

		animate();
	};

	// Mouse wheel zoom with momentum
	const handleWheel = (e) => {
		if (!map.value || !options.enableMomentumZoom) return;

		e.preventDefault();

		const delta = -e.deltaY;
		const zoomDelta = delta > 0 ? 0.5 : -0.5;

		map.value.easeTo({
			zoom: map.value.getZoom() + zoomDelta,
			duration: 200,
		});

		impactFeedback("light");
	};

	// Keyboard shortcuts
	const handleKeyDown = (e) => {
		if (!map.value || !options.enableKeyboardShortcuts) return;

		const key = e.key.toLowerCase();

		switch (key) {
			case "+":
			case "=":
				map.value.zoomIn();
				break;
			case "-":
			case "_":
				map.value.zoomOut();
				break;
			case "r":
				map.value.resetNorth();
				break;
			case "f":
				if (options.onFocusUser) {
					options.onFocusUser();
				}
				break;
		}
	};

	// Setup event listeners
	const setupListeners = () => {
		if (!mapContainer.value) return;

		const container = mapContainer.value;

		container.addEventListener("touchstart", handleTouchStart, {
			passive: true,
		});
		container.addEventListener("touchmove", handleTouchMove, { passive: true });
		container.addEventListener("touchend", handleTouchEnd, { passive: true });
		container.addEventListener("wheel", handleWheel, { passive: false });

		if (options.enableKeyboardShortcuts) {
			window.addEventListener("keydown", handleKeyDown);
		}
	};

	// Remove event listeners
	const removeListeners = () => {
		if (!mapContainer.value) return;

		const container = mapContainer.value;

		container.removeEventListener("touchstart", handleTouchStart);
		container.removeEventListener("touchmove", handleTouchMove);
		container.removeEventListener("touchend", handleTouchEnd);
		container.removeEventListener("wheel", handleWheel);

		if (options.enableKeyboardShortcuts) {
			window.removeEventListener("keydown", handleKeyDown);
		}

		if (momentumAnimationFrame) {
			cancelAnimationFrame(momentumAnimationFrame);
		}
	};

	// Gesture prediction based on history
	const predictNextGesture = () => {
		if (gestureHistory.value.length < 3) return null;

		const recent = gestureHistory.value.slice(-3);
		const types = recent.map((g) => g.type);

		// Simple pattern detection
		if (types.every((t) => t === "pan")) {
			return "pan";
		}
		if (types.filter((t) => t === "pinch").length >= 2) {
			return "pinch";
		}

		return null;
	};

	onMounted(setupListeners);
	onUnmounted(removeListeners);

	return {
		isGesturing,
		gestureType,
		gestureHistory,
		predictNextGesture,
		setupListeners,
		removeListeners,
	};
}
