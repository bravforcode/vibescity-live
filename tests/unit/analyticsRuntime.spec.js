import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	hasAnalyticsConsent,
	isBrowserAnalyticsEnabled,
} from "../../src/lib/analyticsRuntime";

describe("analyticsRuntime", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps browser analytics disabled by default when env is unset", () => {
		expect(isBrowserAnalyticsEnabled({ analyticsEnabledEnv: "" })).toBe(false);
		expect(isBrowserAnalyticsEnabled({ analyticsEnabledEnv: undefined })).toBe(
			false,
		);
	});

	it("enables browser analytics only when explicitly opted in", () => {
		expect(isBrowserAnalyticsEnabled({ analyticsEnabledEnv: "true" })).toBe(
			true,
		);
		expect(
			isBrowserAnalyticsEnabled({
				analyticsEnabledEnv: "true",
				analyticsDisabledEnv: "true",
			}),
		).toBe(false);
	});

	it("respects consent storage and Do Not Track", () => {
		const grantedStorage = {
			getItem(key) {
				return key === "vibe_analytics_consent" ? "granted" : null;
			},
		};
		expect(
			hasAnalyticsConsent({
				storage: grantedStorage,
				doNotTrack: "0",
			}),
		).toBe(true);
		expect(
			hasAnalyticsConsent({
				storage: grantedStorage,
				doNotTrack: "1",
			}),
		).toBe(false);
	});
});
