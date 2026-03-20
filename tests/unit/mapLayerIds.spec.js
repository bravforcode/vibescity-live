import { describe, expect, it } from "vitest";
import {
	CAR_LAYER_IDS,
	MAP_LAYERS,
	MAP_SOURCES,
	NEON_SIGN_LAYER_IDS,
} from "../../src/constants/mapLayerIds";

describe("mapLayerIds registry", () => {
	it("exports stable map source and layer ids", () => {
		expect(MAP_SOURCES.PINS).toBeTruthy();
		expect(MAP_SOURCES.USER_LOCATION).toBe("user-location");
		expect(MAP_LAYERS.NEON_FULL).toBeTruthy();
		expect(MAP_LAYERS.GIANT_PIN_COUNT).toBeTruthy();
	});

	it("contains required neon and car layer groups", () => {
		expect(NEON_SIGN_LAYER_IDS).toEqual([
			MAP_LAYERS.NEON_FULL,
			MAP_LAYERS.NEON_COMPACT,
			MAP_LAYERS.NEON_MINI,
		]);
		expect(CAR_LAYER_IDS).toEqual([
			MAP_LAYERS.ROAD_CARS_PRIMARY,
			MAP_LAYERS.ROAD_CARS_SECONDARY,
			MAP_LAYERS.ROAD_CARS_TERTIARY,
		]);
	});
});
