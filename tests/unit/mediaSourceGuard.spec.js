import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getUsableMediaUrl,
	markMediaElementFailed,
	markMediaUrlFailed,
	normalizeMediaUrl,
	resetFailedMediaUrls,
} from "../../src/utils/mediaSourceGuard";

describe("mediaSourceGuard", () => {
	beforeEach(() => {
		resetFailedMediaUrls();
	});

	afterEach(() => {
		resetFailedMediaUrls();
	});

	it("normalizes supported URLs and rejects unsafe protocols", () => {
		expect(normalizeMediaUrl("/images/pins/pin-red.png")).toMatch(
			/^https?:\/\/.+\/images\/pins\/pin-red\.png$/,
		);
		expect(normalizeMediaUrl("https://cdn.example.com/video.mp4#t=1")).toBe(
			"https://cdn.example.com/video.mp4",
		);
		expect(normalizeMediaUrl("javascript:alert(1)")).toBe("");
	});

	it("blacklists failed media URLs for the rest of the session", () => {
		const source = "https://cdn.example.com/video.mp4";

		expect(getUsableMediaUrl(source)).toBe(source);
		expect(markMediaUrlFailed(source)).toBe(true);
		expect(getUsableMediaUrl(source)).toBe("");
	});

	it("ignores media abort events instead of blacklisting the asset", () => {
		const source = "https://cdn.example.com/video.mp4";
		const abortedEvent = {
			target: {
				error: {
					code: 1,
				},
			},
		};

		expect(markMediaElementFailed(abortedEvent, source)).toBe(false);
		expect(getUsableMediaUrl(source)).toBe(source);
	});
});
