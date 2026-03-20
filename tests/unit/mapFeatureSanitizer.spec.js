import { describe, expect, it } from "vitest";
import {
	isValidCoordinatePair,
	sanitizeFeatureCollection,
	sanitizeFeatures,
	sanitizeShopName,
} from "../../src/utils/mapFeatureSanitizer";

describe("mapFeatureSanitizer", () => {
	it("sanitizes shop name safely", () => {
		const value = sanitizeShopName("  <Hello>\u0007 'x'  ");
		expect(value).toBe("Hello x");
	});

	it("validates coordinate pairs correctly", () => {
		expect(isValidCoordinatePair([100.5, 13.7])).toBe(true);
		expect(isValidCoordinatePair([0, 0])).toBe(false);
		expect(isValidCoordinatePair([190, 13])).toBe(false);
		expect(isValidCoordinatePair(["bad", 13])).toBe(false);
	});

	it("filters invalid features and normalizes properties", () => {
		const features = [
			{
				type: "Feature",
				geometry: { type: "Point", coordinates: [100.5, 13.7] },
				properties: { name: "<A>", sign_nudge_x: "3", sign_nudge_y: "4" },
			},
			{
				type: "Feature",
				geometry: { type: "Point", coordinates: [0, 0] },
				properties: { name: "Bad" },
			},
		];
		const sanitized = sanitizeFeatures(features);
		expect(sanitized).toHaveLength(1);
		expect(sanitized[0].properties.name).toBe("A");
		expect(sanitized[0].properties.sign_offset).toEqual([3, 4]);
	});

	it("returns sanitized feature collection", () => {
		const output = sanitizeFeatureCollection({
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					geometry: { type: "Point", coordinates: [100.5, 13.7] },
					properties: { name: "Ok" },
				},
			],
		});
		expect(output.type).toBe("FeatureCollection");
		expect(output.features).toHaveLength(1);
	});
});
