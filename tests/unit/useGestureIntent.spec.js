import { describe, expect, it } from "vitest";
import {
	classifyGestureIntent,
	GESTURE_INTENT,
	isDismissSwipeIntent,
	isMomentumTailIntent,
} from "../../src/composables/useGestureIntent";

describe("useGestureIntent", () => {
	it("classifies dismiss swipe intent", () => {
		const intent = classifyGestureIntent({
			velocityY: 920,
			distanceY: 120,
			directionDown: true,
		});
		expect(intent).toBe(GESTURE_INTENT.DISMISS_SWIPE);
		expect(
			isDismissSwipeIntent({
				velocityY: 920,
				distanceY: 120,
				directionDown: true,
			}),
		).toBe(true);
	});

	it("classifies momentum tail intent", () => {
		const context = {
			velocityY: 120,
			decelerating: true,
		};
		expect(classifyGestureIntent(context)).toBe(GESTURE_INTENT.MOMENTUM_TAIL);
		expect(isMomentumTailIntent(context)).toBe(true);
	});

	it("classifies tap intent", () => {
		expect(
			classifyGestureIntent({
				pointerDistancePx: 4,
				durationMs: 120,
				velocityY: 0,
			}),
		).toBe(GESTURE_INTENT.TAP_INTENT);
	});
});
