import { onUnmounted, ref, watch } from "vue";
import { useInteractionState } from "./useInteractionState";

const DEFAULT_SPRING = Object.freeze({
	mass: 1,
	tension: 420,
	friction: 46,
	settleVelocity: 10, // px/s == 0.01 px/ms
	settleDistance: 0.6, // px
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const rubberBand = (distance, maxOvershoot, decay) =>
	-maxOvershoot * (1 - Math.exp(-distance / decay));

const springAcceleration = (position, velocity, target, spring) =>
	(-spring.tension * (position - target) - spring.friction * velocity) /
	spring.mass;

const integrateSpringRK4 = (motion, dt, spring) => {
	const x = motion.position;
	const v = motion.velocity;
	const t = motion.target;

	const k1x = v;
	const k1v = springAcceleration(x, v, t, spring);

	const x2 = x + 0.5 * dt * k1x;
	const v2 = v + 0.5 * dt * k1v;
	const k2x = v2;
	const k2v = springAcceleration(x2, v2, t, spring);

	const x3 = x + 0.5 * dt * k2x;
	const v3 = v + 0.5 * dt * k2v;
	const k3x = v3;
	const k3v = springAcceleration(x3, v3, t, spring);

	const x4 = x + dt * k3x;
	const v4 = v + dt * k3v;
	const k4x = v4;
	const k4v = springAcceleration(x4, v4, t, spring);

	motion.position = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
	motion.velocity = v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
};

const isSettled = (motion, spring) =>
	Math.abs(motion.velocity) <= spring.settleVelocity &&
	Math.abs(motion.position - motion.target) <= spring.settleDistance;

const projectLanding = (position, velocityPxMs, projectionMs, decelPerMs) => {
	const travel =
		(velocityPxMs / decelPerMs) * (1 - Math.exp(-decelPerMs * projectionMs));
	return position + travel;
};

export function useSwipeToDismiss(options = {}) {
	const {
		threshold = 120,
		dismissVelocityThreshold = 0.8, // px/ms
		onClose,
		compositorOnly = false,
		onFrame,
		onDrag,
		onPredictRestState,
		maxOvershoot = 44,
		overshootDecay = 120,
		predictionWindowMs = 220,
		predictionDecelPerMs = 0.0038,
		dragStartSlop = 6,
		spring: springOverrides = {},
	} = options;

	const spring = { ...DEFAULT_SPRING, ...springOverrides };
	const prefersReducedMotion =
		typeof window !== "undefined"
			? window.matchMedia("(prefers-reduced-motion: reduce)").matches
			: false;

	const elementRef = ref(null);
	const pullY = ref(0);
	const isDragging = ref(false);

	const motion = {
		phase: "idle", // idle | drag | spring
		pointerActive: false,
		pointerId: null,
		ignoreGesture: false,
		dragCommitted: false,
		startY: 0,
		lastPointerY: 0,
		lastPointerTime: 0,
		velocityPxMs: 0,
		dragPosition: 0,
		position: 0,
		velocity: 0, // px/s
		target: 0,
		shouldCloseOnSettle: false,
		predictedState: "open",
		rafId: null,
		lastFrameTime: 0,
	};

	const { beginDrawerDrag, endDrawerDrag } = useInteractionState();

	const clearTransform = () => {
		const el = elementRef.value;
		if (!el) return;
		el.style.transform = "";
		el.style.transition = "";
		el.style.willChange = "";
	};

	const applyFrame = (y, dragging, phase) => {
		const el = elementRef.value;
		if (el) {
			if (dragging) {
				el.style.transition = "none";
				el.style.willChange = "transform";
			}
			el.style.transform = y !== 0 ? `translate3d(0, ${y}px, 0)` : "";
		}

		if (!compositorOnly) {
			pullY.value = y;
		}

		onFrame?.({
			y,
			dragging,
			phase,
			velocityPxMs: motion.velocityPxMs,
		});
		onDrag?.(y, dragging);
	};

	const syncFinalState = (y) => {
		pullY.value = y;
		isDragging.value = false;
	};

	const resolveDismissTarget = () => {
		const viewportHeight =
			typeof window !== "undefined" ? window.innerHeight : 900;
		const drawerHeight =
			elementRef.value?.getBoundingClientRect?.().height || viewportHeight;
		return Math.max(viewportHeight, drawerHeight) + 56;
	};

	const emitPrediction = (source) => {
		const projectedY = projectLanding(
			motion.position,
			motion.velocityPxMs,
			predictionWindowMs,
			predictionDecelPerMs,
		);
		const shouldClose =
			projectedY > threshold || motion.velocityPxMs > dismissVelocityThreshold;
		const nextState = shouldClose ? "close" : "open";

		if (nextState === motion.predictedState) return;
		motion.predictedState = nextState;

		onPredictRestState?.({
			state: nextState,
			projectedY,
			velocityPxMs: motion.velocityPxMs,
			source,
		});
	};

	const stopLoop = () => {
		if (motion.rafId !== null) {
			cancelAnimationFrame(motion.rafId);
			motion.rafId = null;
		}
		motion.lastFrameTime = 0;
	};

	const tick = (now) => {
		if (motion.lastFrameTime === 0) {
			motion.lastFrameTime = now;
		}

		const dt = clamp((now - motion.lastFrameTime) / 1000, 1 / 240, 1 / 30);
		motion.lastFrameTime = now;

		if (motion.phase === "drag") {
			motion.position = motion.dragPosition;
			applyFrame(motion.position, true, "drag");
		} else if (motion.phase === "spring") {
			integrateSpringRK4(motion, dt, spring);
			applyFrame(motion.position, false, "spring");

			if (isSettled(motion, spring)) {
				motion.position = motion.target;
				motion.velocity = 0;
				applyFrame(motion.position, false, "settled");

				if (motion.shouldCloseOnSettle) {
					syncFinalState(0);
					clearTransform();
					motion.phase = "idle";
					stopLoop();
					onClose?.();
					return;
				}

				motion.phase = "idle";
				syncFinalState(0);
				clearTransform();
				stopLoop();
				return;
			}
		}

		if (motion.phase !== "idle") {
			motion.rafId = requestAnimationFrame(tick);
		} else {
			stopLoop();
		}
	};

	const startLoop = () => {
		if (motion.rafId !== null) return;
		motion.rafId = requestAnimationFrame(tick);
	};

	const onPointerDown = (e) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;

		const scrollable = e.target.closest(
			".overflow-y-auto, .overflow-auto, .touch-pan-y",
		);
		if (scrollable && scrollable.scrollTop > 5) {
			motion.ignoreGesture = true;
			return;
		}

		motion.ignoreGesture = false;
		if (!beginDrawerDrag()) {
			motion.ignoreGesture = true;
			return;
		}

		motion.pointerActive = true;
		motion.pointerId = e.pointerId;
		motion.dragCommitted = false;
		motion.startY = e.clientY;
		motion.lastPointerY = e.clientY;
		motion.lastPointerTime = performance.now();
		motion.velocityPxMs = 0;
		motion.dragPosition = 0;
		motion.position = 0;
		motion.velocity = 0;
		motion.target = 0;
		motion.shouldCloseOnSettle = false;
		motion.phase = "drag";
		motion.predictedState = "open";

		isDragging.value = false;
		if (!compositorOnly) {
			pullY.value = 0;
		}

		if (elementRef.value) {
			elementRef.value.style.transition = "none";
			elementRef.value.style.willChange = "transform";
		}

		startLoop();
	};

	const onPointerMove = (e) => {
		if (!motion.pointerActive || motion.ignoreGesture) return;
		if (motion.pointerId !== null && e.pointerId !== motion.pointerId) return;

		const now = performance.now();
		const deltaY = e.clientY - motion.startY;
		const dtMs = now - motion.lastPointerTime;

		if (dtMs > 0) {
			const instantaneousVelocity = (e.clientY - motion.lastPointerY) / dtMs;
			motion.velocityPxMs =
				motion.velocityPxMs * 0.72 + instantaneousVelocity * 0.28;
		}

		motion.lastPointerY = e.clientY;
		motion.lastPointerTime = now;

		if (!motion.dragCommitted && Math.abs(deltaY) >= dragStartSlop) {
			motion.dragCommitted = true;
			isDragging.value = true;
		}

		if (!motion.dragCommitted) return;

		if (deltaY > 0 && e.cancelable) {
			e.preventDefault();
		}

		motion.dragPosition =
			deltaY >= 0
				? deltaY
				: rubberBand(Math.abs(deltaY), maxOvershoot, overshootDecay);
		motion.position = motion.dragPosition;
		emitPrediction("drag");
		startLoop();
	};

	const finishGestureImmediately = (shouldClose) => {
		motion.pointerActive = false;
		motion.pointerId = null;
		motion.phase = "idle";
		stopLoop();

		if (shouldClose) {
			syncFinalState(0);
			clearTransform();
			onClose?.();
			return;
		}

		syncFinalState(0);
		clearTransform();
	};

	const onPointerUp = () => {
		if (!motion.pointerActive) return;

		motion.pointerActive = false;
		motion.pointerId = null;
		motion.ignoreGesture = false;
		endDrawerDrag();

		if (!motion.dragCommitted) {
			motion.phase = "idle";
			isDragging.value = false;
			stopLoop();
			return;
		}

		const isFlickDown = motion.velocityPxMs > dismissVelocityThreshold;
		const isDistancePassed = motion.position > threshold;
		const projectedY = projectLanding(
			motion.position,
			motion.velocityPxMs,
			predictionWindowMs,
			predictionDecelPerMs,
		);
		const shouldClose =
			isFlickDown || isDistancePassed || projectedY > threshold;

		emitPrediction("release");

		if (prefersReducedMotion) {
			finishGestureImmediately(shouldClose);
			return;
		}

		isDragging.value = false;
		motion.shouldCloseOnSettle = shouldClose;
		motion.target = shouldClose ? resolveDismissTarget() : 0;
		motion.velocity = motion.velocityPxMs * 1000;
		motion.phase = "spring";
		startLoop();
	};

	const attach = (el) => {
		if (!el) return;
		el.addEventListener("pointerdown", onPointerDown, { passive: true });
		window.addEventListener("pointermove", onPointerMove, { passive: false });
		window.addEventListener("pointerup", onPointerUp, { passive: true });
		window.addEventListener("pointercancel", onPointerUp, { passive: true });
	};

	const detach = (el) => {
		if (!el) return;
		el.removeEventListener("pointerdown", onPointerDown);
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", onPointerUp);
		window.removeEventListener("pointercancel", onPointerUp);
	};

	watch(elementRef, (newEl, oldEl) => {
		if (oldEl) detach(oldEl);
		if (newEl) attach(newEl);
	});

	onUnmounted(() => {
		stopLoop();
		if (elementRef.value) detach(elementRef.value);
	});

	return { elementRef, pullY, isDragging };
}
