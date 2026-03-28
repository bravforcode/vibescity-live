import { describe, expect, it } from "vitest";
import {
	normalizeMapStyleMode,
	resolveMapStyleUrlForMode,
	resolveRuntimeMapStyleMode,
	shouldEnableMapTextLabels,
} from "../../../src/composables/map/mapStyleMode";

describe("mapStyleMode", () => {
	it("defaults to prod mode unless quiet is explicitly requested", () => {
		expect(normalizeMapStyleMode()).toBe("prod");
		expect(normalizeMapStyleMode("prod")).toBe("prod");
		expect(normalizeMapStyleMode("quiet")).toBe("quiet");
		expect(normalizeMapStyleMode("QUIET")).toBe("quiet");
		expect(normalizeMapStyleMode("unknown")).toBe("prod");
	});

	it("keeps localhost override local-only", () => {
		expect(
			resolveRuntimeMapStyleMode({
				isLocalhostBrowser: true,
				requestedMode: "quiet",
			}),
		).toBe("quiet");
		expect(
			resolveRuntimeMapStyleMode({
				isLocalhostBrowser: true,
				requestedMode: "prod",
			}),
		).toBe("prod");
		expect(
			resolveRuntimeMapStyleMode({
				isLocalhostBrowser: false,
				requestedMode: "quiet",
			}),
		).toBe("prod");
	});

	it("resolves quiet/prod style URLs deterministically and lets strict e2e win", () => {
		expect(
			resolveMapStyleUrlForMode({
				styleMode: "prod",
				prodStyleUrl: "/map-styles/vibecity-neon.json",
				quietStyleUrl: "/map-styles/vibecity-localhost.json",
			}),
		).toBe("/map-styles/vibecity-neon.json");
		expect(
			resolveMapStyleUrlForMode({
				styleMode: "quiet",
				prodStyleUrl: "/map-styles/vibecity-neon.json",
				quietStyleUrl: "/map-styles/vibecity-localhost.json",
			}),
		).toBe("/map-styles/vibecity-localhost.json");
		expect(
			resolveMapStyleUrlForMode({
				styleMode: "quiet",
				prodStyleUrl: "/map-styles/vibecity-neon.json",
				quietStyleUrl: "/map-styles/vibecity-localhost.json",
				isStrictMapE2E: true,
				strictE2EStyleUrl: "/map-styles/vibecity-neon.json",
			}),
		).toBe("/map-styles/vibecity-neon.json");
	});

	it("disables text labels only in quiet mode", () => {
		expect(shouldEnableMapTextLabels("prod")).toBe(true);
		expect(shouldEnableMapTextLabels("quiet")).toBe(false);
	});
});
