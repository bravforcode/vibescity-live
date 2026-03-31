import { describe, expect, it } from "vitest";
import {
	buildMapSelectionIntent,
	getCenteredSelectionSource,
	getDefaultSelectionCameraMode,
	normalizeSelectionVenueId,
} from "../../../src/composables/map/mapSelectionIntent";

describe("mapSelectionIntent", () => {
	it("normalizes venue ids and centered preview sources", () => {
		expect(normalizeSelectionVenueId(" 101 ")).toBe("101");
		expect(normalizeSelectionVenueId("")).toBeNull();
		expect(getCenteredSelectionSource("startup")).toBe("startup");
		expect(getCenteredSelectionSource("carousel")).toBe("carousel");
		expect(getCenteredSelectionSource("anything-else")).toBe("startup");
	});

	it("derives default camera modes from the surface", () => {
		expect(getDefaultSelectionCameraMode("preview")).toBe("preview-focus");
		expect(getDefaultSelectionCameraMode("detail")).toBe("detail-focus");
	});

	it("builds preview intents without route mutation by default", () => {
		const intent = buildMapSelectionIntent({
			requestId: 7,
			shop: { id: " 101 ", lat: "18.79", lng: "98.98" },
			source: "startup",
			surface: "preview",
			issuedAt: 123,
		});

		expect(intent).toEqual({
			requestId: 7,
			shopId: "101",
			source: "startup",
			surface: "preview",
			cameraMode: "preview-focus",
			popupMode: "compact",
			routeMode: "none",
			coords: [18.79, 98.98],
			issuedAt: 123,
		});
	});

	it("builds explicit detail intents with stable route/popup semantics", () => {
		const intent = buildMapSelectionIntent({
			requestId: 9,
			shopId: "venue-9",
			source: "detail",
			surface: "detail",
			popupMode: "compact",
			routeMode: "push",
			issuedAt: 999,
		});

		expect(intent).toEqual({
			requestId: 9,
			shopId: "venue-9",
			source: "detail",
			surface: "detail",
			cameraMode: "detail-focus",
			popupMode: "compact",
			routeMode: "push",
			coords: null,
			issuedAt: 999,
		});
	});

	it("returns null when selection id is missing", () => {
		expect(buildMapSelectionIntent({ shop: { id: " " } })).toBeNull();
		expect(buildMapSelectionIntent({ shopId: null })).toBeNull();
	});
});
