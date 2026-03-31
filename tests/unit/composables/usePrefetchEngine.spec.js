import { describe, expect, it } from "vitest";

import { shouldSkipSpeculativeVenuePrefetch } from "../../../src/composables/usePrefetchEngine";

describe("usePrefetchEngine speculative prefetch policy", () => {
	it("skips speculative venue prefetch in frontend-only dev", () => {
		expect(
			shouldSkipSpeculativeVenuePrefetch({
				isFrontendOnlyDev: true,
				isOffline: false,
				backoffUntil: 0,
				now: 100,
			}),
		).toBe(true);
	});

	it("skips speculative venue prefetch while offline or during backoff", () => {
		expect(
			shouldSkipSpeculativeVenuePrefetch({
				isFrontendOnlyDev: false,
				isOffline: true,
				backoffUntil: 0,
				now: 100,
			}),
		).toBe(true);

		expect(
			shouldSkipSpeculativeVenuePrefetch({
				isFrontendOnlyDev: false,
				isOffline: false,
				backoffUntil: 200,
				now: 100,
			}),
		).toBe(true);
	});

	it("allows speculative venue prefetch when the lane is healthy", () => {
		expect(
			shouldSkipSpeculativeVenuePrefetch({
				isFrontendOnlyDev: false,
				isOffline: false,
				backoffUntil: 0,
				now: 100,
			}),
		).toBe(false);
	});
});
