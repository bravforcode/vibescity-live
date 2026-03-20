import { describe, expect, it } from "vitest";
import { buildMapPinPresentation } from "../../src/utils/mapPinHierarchy";
import { MAP_RENDER_LEVELS } from "../../src/utils/mapZoomLevels";

const makeFeature = ({
	id,
	name,
	lat,
	lng,
	zone,
	province,
	pin_metadata,
	visibility_score = 0,
	pin_type = "normal",
}) => ({
	type: "Feature",
	geometry: { type: "Point", coordinates: [lng, lat] },
	properties: {
		id,
		name,
		zone,
		province,
		pin_type,
		pin_state: "open",
		visibility_score,
		pin_metadata,
	},
});

const projector = ([lng, lat]) => ({
	x: lng * 100000,
	y: lat * 100000,
});

describe("map pin hierarchy automation", () => {
	it("keeps detail level as individual features", () => {
		const features = [
			makeFeature({
				id: "a",
				name: "A",
				lat: 18.78,
				lng: 98.98,
				zone: "Nimman",
				province: "Chiang Mai",
			}),
			makeFeature({
				id: "b",
				name: "B",
				lat: 18.781,
				lng: 98.981,
				zone: "Nimman",
				province: "Chiang Mai",
			}),
		];

		const result = buildMapPinPresentation({ features, zoom: 15, projector });
		expect(result.level).toBe(MAP_RENDER_LEVELS.DETAIL);
		expect(result.features).toHaveLength(2);
		expect(result.features[0].properties.sign_scale).toBeGreaterThan(0.6);
	});

	it("aggregates zone level into giant pins", () => {
		const features = [
			makeFeature({
				id: "z1",
				name: "Shop 1",
				lat: 18.78,
				lng: 98.98,
				zone: "Nimman",
				province: "Chiang Mai",
			}),
			makeFeature({
				id: "z2",
				name: "Shop 2",
				lat: 18.781,
				lng: 98.981,
				zone: "Nimman",
				province: "Chiang Mai",
			}),
			makeFeature({
				id: "z3",
				name: "Shop 3",
				lat: 18.79,
				lng: 98.99,
				zone: "Old Town",
				province: "Chiang Mai",
			}),
		];

		const result = buildMapPinPresentation({ features, zoom: 11, projector });
		expect(result.level).toBe(MAP_RENDER_LEVELS.ZONE);
		expect(result.features.length).toBe(2);
		expect(
			result.features.every(
				(feature) => feature.properties.aggregate_level === MAP_RENDER_LEVELS.ZONE,
			),
		).toBe(true);
		expect(
			result.features.some(
				(feature) => feature.properties.aggregate_shop_count === 2,
			),
		).toBe(true);
	});

	it("aggregates province level for Thailand-wide view", () => {
		const features = [
			makeFeature({
				id: "p1",
				name: "CNX 1",
				lat: 18.78,
				lng: 98.98,
				zone: "Nimman",
				province: "Chiang Mai",
			}),
			makeFeature({
				id: "p2",
				name: "BKK 1",
				lat: 13.75,
				lng: 100.5,
				zone: "Sukhumvit",
				province: "Bangkok",
			}),
		];

		const result = buildMapPinPresentation({ features, zoom: 6.5, projector });
		expect(result.level).toBe(MAP_RENDER_LEVELS.PROVINCE);
		expect(result.features.length).toBe(2);
		expect(
			result.features.every(
				(feature) =>
					feature.properties.aggregate_level === MAP_RENDER_LEVELS.PROVINCE,
			),
		).toBe(true);
	});

	it("gives dominant promoted signs larger scale and shrinks nearby neighbors", () => {
		const features = [
			makeFeature({
				id: "dominant",
				name: "Dominant",
				lat: 18.78001,
				lng: 98.98001,
				zone: "Nimman",
				province: "Chiang Mai",
				visibility_score: 60,
				pin_metadata: {
					features: {
						mega_sign: true,
						district_takeover: true,
					},
				},
			}),
			makeFeature({
				id: "neighbor",
				name: "Neighbor",
				lat: 18.78007,
				lng: 98.98007,
				zone: "Nimman",
				province: "Chiang Mai",
				visibility_score: 8,
			}),
		];

		const result = buildMapPinPresentation({ features, zoom: 15, projector });
		const dominant = result.features.find(
			(feature) => feature.properties.id === "dominant",
		);
		const neighbor = result.features.find(
			(feature) => feature.properties.id === "neighbor",
		);
		expect(dominant).toBeTruthy();
		expect(neighbor).toBeTruthy();
		expect(Number(dominant.properties.sign_scale)).toBeGreaterThan(
			Number(neighbor.properties.sign_scale),
		);
		expect(Number(neighbor.properties.sign_scale)).toBeLessThan(1);
	});
});
