import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	computeBackoffDelayMs,
	getRetryPolicy,
	isCircuitOpen,
	recordFailure,
	recordSuccess,
	shouldRetryResource,
} from "../../../src/utils/retryPolicy";

describe("retryPolicy", () => {
	// ─── getRetryPolicy ────────────────────────────────────────────────────
	describe("getRetryPolicy", () => {
		it("returns the policy for a known resource type", () => {
			const policy = getRetryPolicy("tile");
			expect(policy).toMatchObject({ max: 2, backoff: "linear", baseMs: 1000 });
		});

		it("returns the policy for sprite", () => {
			const policy = getRetryPolicy("sprite");
			expect(policy).toMatchObject({ max: 3, backoff: "exponential", baseMs: 500 });
		});

		it("returns a zero-retry fallback for unknown resource type", () => {
			const policy = getRetryPolicy("totally_unknown");
			expect(policy).toMatchObject({ max: 0, backoff: "none", baseMs: 0 });
		});

		it("returns fallback when called with no argument", () => {
			const policy = getRetryPolicy();
			expect(policy.max).toBe(0);
		});

		it("returns fallback for empty string", () => {
			const policy = getRetryPolicy("");
			expect(policy.max).toBe(0);
		});

		it("policy objects are frozen (immutable)", () => {
			const policy = getRetryPolicy("tile");
			expect(Object.isFrozen(policy)).toBe(true);
		});
	});

	// ─── shouldRetryResource ───────────────────────────────────────────────
	describe("shouldRetryResource", () => {
		it("returns true on attempt 0 for tile (max=2)", () => {
			expect(shouldRetryResource({ resourceType: "tile", attempt: 0 })).toBe(true);
		});

		it("returns true on attempt 1 for tile (max=2)", () => {
			expect(shouldRetryResource({ resourceType: "tile", attempt: 1 })).toBe(true);
		});

		it("returns false once attempt reaches max", () => {
			expect(shouldRetryResource({ resourceType: "tile", attempt: 2 })).toBe(false);
		});

		it("returns false for feed (max=1) on attempt 1", () => {
			expect(shouldRetryResource({ resourceType: "feed", attempt: 1 })).toBe(false);
		});

		it("returns true for feed (max=1) on attempt 0", () => {
			expect(shouldRetryResource({ resourceType: "feed", attempt: 0 })).toBe(true);
		});

		it("returns false for unknown resource type (max=0) on attempt 0", () => {
			expect(shouldRetryResource({ resourceType: "unknown", attempt: 0 })).toBe(false);
		});

		it("returns false when called with no args", () => {
			expect(shouldRetryResource()).toBe(false);
		});
	});

	// ─── computeBackoffDelayMs ─────────────────────────────────────────────
	describe("computeBackoffDelayMs", () => {
		it("returns 0 for unknown resource (no baseMs)", () => {
			expect(computeBackoffDelayMs({ resourceType: "unknown", attempt: 0 })).toBe(0);
		});

		it("linear backoff: attempt 0 = 1x baseMs", () => {
			// tile: linear, baseMs=1000 → attempt 0 = 1000*(0+1) = 1000
			expect(computeBackoffDelayMs({ resourceType: "tile", attempt: 0 })).toBe(1000);
		});

		it("linear backoff: attempt 1 = 2x baseMs", () => {
			// tile: linear, baseMs=1000 → attempt 1 = 1000*(1+1) = 2000
			expect(computeBackoffDelayMs({ resourceType: "tile", attempt: 1 })).toBe(2000);
		});

		it("exponential backoff: attempt 0 = baseMs * 2^0", () => {
			// sprite: exponential, baseMs=500 → attempt 0 = 500 * 1 = 500
			expect(computeBackoffDelayMs({ resourceType: "sprite", attempt: 0 })).toBe(500);
		});

		it("exponential backoff: attempt 1 = baseMs * 2^1", () => {
			// sprite: exponential, baseMs=500 → attempt 1 = 500 * 2 = 1000
			expect(computeBackoffDelayMs({ resourceType: "sprite", attempt: 1 })).toBe(1000);
		});

		it("exponential backoff: attempt 2 = baseMs * 2^2", () => {
			// sprite: exponential, baseMs=500 → attempt 2 = 500 * 4 = 2000
			expect(computeBackoffDelayMs({ resourceType: "sprite", attempt: 2 })).toBe(2000);
		});

		it("returns 0 for rum (baseMs=0)", () => {
			expect(computeBackoffDelayMs({ resourceType: "rum", attempt: 0 })).toBe(0);
		});

		it("handles negative attempt as 0", () => {
			// negative attempt should be treated as 0 via Math.max(0, ...)
			const base = computeBackoffDelayMs({ resourceType: "tile", attempt: 0 });
			const neg = computeBackoffDelayMs({ resourceType: "tile", attempt: -5 });
			expect(neg).toBe(base);
		});
	});

	// ─── Circuit Breaker ───────────────────────────────────────────────────
	describe("Circuit Breaker (isCircuitOpen / recordFailure / recordSuccess)", () => {
		// Use a unique key per test to avoid cross-test state pollution
		let resourceKey;

		beforeEach(() => {
			resourceKey = `test_cb_${Math.random().toString(36).slice(2)}`;
		});

		afterEach(() => {
			// Always reset after each test
			recordSuccess(resourceKey);
		});

		it("circuit is closed initially", () => {
			expect(isCircuitOpen(resourceKey)).toBe(false);
		});

		it("circuit remains closed after 1 failure", () => {
			recordFailure(resourceKey);
			expect(isCircuitOpen(resourceKey)).toBe(false);
		});

		it("circuit remains closed after 2 failures", () => {
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			expect(isCircuitOpen(resourceKey)).toBe(false);
		});

		it("circuit opens after 3 consecutive failures", () => {
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			expect(isCircuitOpen(resourceKey)).toBe(true);
		});

		it("circuit resets to closed after recordSuccess", () => {
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			recordSuccess(resourceKey);
			expect(isCircuitOpen(resourceKey)).toBe(false);
		});

		it("circuit is closed for a different resource key", () => {
			const other = `other_${Math.random().toString(36).slice(2)}`;
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			expect(isCircuitOpen(other)).toBe(false);
			recordSuccess(other);
		});

		it("circuit half-opens after 60 seconds and allows retry", () => {
			vi.useFakeTimers();
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			recordFailure(resourceKey);
			expect(isCircuitOpen(resourceKey)).toBe(true);

			// Advance past the 60s half-open window
			vi.advanceTimersByTime(61_000);
			expect(isCircuitOpen(resourceKey)).toBe(false);
			vi.useRealTimers();
		});
	});
});
