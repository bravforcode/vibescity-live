export const GESTURE_INTENT = Object.freeze({
	DISMISS_SWIPE: "DISMISS_SWIPE",
	SCROLL_PAST: "SCROLL_PAST",
	MOMENTUM_TAIL: "MOMENTUM_TAIL",
	TAP_INTENT: "TAP_INTENT",
	UNKNOWN: "UNKNOWN",
});

const toFinite = (value, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const classifyGestureIntent = (context = {}) => {
	const velocityY = Math.abs(toFinite(context.velocityY, 0));
	const distanceY = Math.abs(toFinite(context.distanceY, 0));
	const durationMs = Math.max(0, toFinite(context.durationMs, 0));
	const pointerDistancePx = Math.abs(
		toFinite(context.pointerDistancePx, distanceY),
	);
	const decelerating = Boolean(context.decelerating);
	const directionDown = Boolean(context.directionDown);

	if (directionDown && velocityY > 800 && distanceY > 40) {
		return GESTURE_INTENT.DISMISS_SWIPE;
	}
	if (decelerating && velocityY < 200) {
		return GESTURE_INTENT.MOMENTUM_TAIL;
	}
	if (velocityY > 200) {
		return GESTURE_INTENT.SCROLL_PAST;
	}
	if (pointerDistancePx < 10 && durationMs > 0 && durationMs < 220) {
		return GESTURE_INTENT.TAP_INTENT;
	}
	return GESTURE_INTENT.UNKNOWN;
};

export const isMomentumTailIntent = (context = {}) =>
	classifyGestureIntent(context) === GESTURE_INTENT.MOMENTUM_TAIL;

export const isDismissSwipeIntent = (context = {}) =>
	classifyGestureIntent(context) === GESTURE_INTENT.DISMISS_SWIPE;
