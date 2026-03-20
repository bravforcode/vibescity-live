import { describe, expect, it } from "vitest";
import {
	computeBackoffDelayMs,
	getRetryPolicy,
	RETRY_POLICY,
	shouldRetryResource,
} from "../../src/utils/retryPolicy";

describe("retryPolicy", () => {
	it("returns expected policies by resource type", () => {
		expect(getRetryPolicy("tile")).toEqual(RETRY_POLICY.tile);
		expect(getRetryPolicy("sprite")).toEqual(RETRY_POLICY.sprite);
		expect(getRetryPolicy("feed")).toEqual(RETRY_POLICY.feed);
		expect(getRetryPolicy("events")).toEqual(RETRY_POLICY.events);
		expect(getRetryPolicy("localAds")).toEqual(RETRY_POLICY.localAds);
		expect(getRetryPolicy("venueDiscovery")).toEqual(RETRY_POLICY.venueDiscovery);
		expect(getRetryPolicy("venueEnrichment")).toEqual(
			RETRY_POLICY.venueEnrichment,
		);
		expect(getRetryPolicy("venueSearch")).toEqual(RETRY_POLICY.venueSearch);
		expect(getRetryPolicy("nearbyDiscovery")).toEqual(
			RETRY_POLICY.nearbyDiscovery,
		);
		expect(getRetryPolicy("featureFlags")).toEqual(RETRY_POLICY.featureFlags);
		expect(getRetryPolicy("gamificationStats")).toEqual(
			RETRY_POLICY.gamificationStats,
		);
		expect(getRetryPolicy("roomCounts")).toEqual(RETRY_POLICY.roomCounts);
		expect(getRetryPolicy("favoritesRead")).toEqual(RETRY_POLICY.favoritesRead);
		expect(getRetryPolicy("userProfileRead")).toEqual(
			RETRY_POLICY.userProfileRead,
		);
		expect(getRetryPolicy("osmDiscovery")).toEqual(RETRY_POLICY.osmDiscovery);
		expect(getRetryPolicy("adminApi")).toEqual(RETRY_POLICY.adminApi);
		expect(getRetryPolicy("adminRead")).toEqual(RETRY_POLICY.adminRead);
		expect(getRetryPolicy("unknown")).toMatchObject({
			max: 0,
			backoff: "none",
			baseMs: 0,
		});
	});

	it("computes linear and exponential backoff delays", () => {
		expect(computeBackoffDelayMs({ resourceType: "tile", attempt: 0 })).toBe(
			1000,
		);
		expect(computeBackoffDelayMs({ resourceType: "tile", attempt: 1 })).toBe(
			2000,
		);
		expect(computeBackoffDelayMs({ resourceType: "sprite", attempt: 0 })).toBe(
			500,
		);
		expect(computeBackoffDelayMs({ resourceType: "sprite", attempt: 2 })).toBe(
			2000,
		);
		expect(computeBackoffDelayMs({ resourceType: "feed", attempt: 0 })).toBe(
			250,
		);
		expect(computeBackoffDelayMs({ resourceType: "events", attempt: 1 })).toBe(
			600,
		);
		expect(computeBackoffDelayMs({ resourceType: "localAds", attempt: 0 })).toBe(
			300,
		);
		expect(
			computeBackoffDelayMs({ resourceType: "venueDiscovery", attempt: 1 }),
		).toBe(600);
		expect(
			computeBackoffDelayMs({ resourceType: "venueEnrichment", attempt: 0 }),
		).toBe(250);
		expect(
			computeBackoffDelayMs({ resourceType: "nearbyDiscovery", attempt: 1 }),
		).toBe(500);
		expect(
			computeBackoffDelayMs({ resourceType: "featureFlags", attempt: 1 }),
		).toBe(600);
		expect(
			computeBackoffDelayMs({ resourceType: "gamificationStats", attempt: 0 }),
		).toBe(250);
		expect(
			computeBackoffDelayMs({ resourceType: "favoritesRead", attempt: 1 }),
		).toBe(500);
		expect(
			computeBackoffDelayMs({ resourceType: "userProfileRead", attempt: 0 }),
		).toBe(250);
		expect(
			computeBackoffDelayMs({ resourceType: "osmDiscovery", attempt: 1 }),
		).toBe(800);
		expect(
			computeBackoffDelayMs({ resourceType: "adminApi", attempt: 1 }),
		).toBe(700);
		expect(
			computeBackoffDelayMs({ resourceType: "adminRead", attempt: 0 }),
		).toBe(300);
	});

	it("respects retry limits", () => {
		expect(
			shouldRetryResource({ resourceType: "shopDetail", attempt: 0 }),
		).toBe(true);
		expect(
			shouldRetryResource({ resourceType: "shopDetail", attempt: 2 }),
		).toBe(false);
		expect(shouldRetryResource({ resourceType: "rum", attempt: 0 })).toBe(
			false,
		);
		expect(shouldRetryResource({ resourceType: "feed", attempt: 0 })).toBe(true);
		expect(shouldRetryResource({ resourceType: "feed", attempt: 1 })).toBe(
			false,
		);
		expect(
			shouldRetryResource({ resourceType: "venueDiscovery", attempt: 0 }),
		).toBe(true);
		expect(
			shouldRetryResource({ resourceType: "nearbyDiscovery", attempt: 1 }),
		).toBe(false);
		expect(
			shouldRetryResource({ resourceType: "featureFlags", attempt: 0 }),
		).toBe(true);
		expect(
			shouldRetryResource({ resourceType: "roomCounts", attempt: 1 }),
		).toBe(false);
		expect(
			shouldRetryResource({ resourceType: "favoritesRead", attempt: 0 }),
		).toBe(true);
		expect(
			shouldRetryResource({ resourceType: "userProfileRead", attempt: 1 }),
		).toBe(false);
		expect(
			shouldRetryResource({ resourceType: "adminApi", attempt: 1 }),
		).toBe(true);
		expect(
			shouldRetryResource({ resourceType: "adminRead", attempt: 1 }),
		).toBe(false);
	});
});
