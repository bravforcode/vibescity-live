import { describe, expect, it } from "vitest";
import {
	getDrilldownZoomForLevel,
	MAP_LEVEL_THRESHOLDS,
	MAP_RENDER_LEVELS,
	resolveMapRenderLevel,
} from "../../src/utils/mapZoomLevels";

describe("map zoom levels", () => {
	it("resolves detail/zone/province levels from default thresholds", () => {
		const detail = Number(MAP_LEVEL_THRESHOLDS.detailMinZoom);
		const zone = Number(MAP_LEVEL_THRESHOLDS.zoneMinZoom);
		expect(resolveMapRenderLevel(detail + 1)).toBe(MAP_RENDER_LEVELS.DETAIL);
		expect(resolveMapRenderLevel(zone + 0.1)).toBe(MAP_RENDER_LEVELS.ZONE);
		expect(resolveMapRenderLevel(zone - 1)).toBe(MAP_RENDER_LEVELS.PROVINCE);
	});

	it("supports custom thresholds", () => {
		const custom = { detailMinZoom: 13, zoneMinZoom: 8 };
		expect(resolveMapRenderLevel(12.9, custom)).toBe(MAP_RENDER_LEVELS.ZONE);
		expect(resolveMapRenderLevel(13, custom)).toBe(MAP_RENDER_LEVELS.DETAIL);
		expect(resolveMapRenderLevel(7.9, custom)).toBe(MAP_RENDER_LEVELS.PROVINCE);
	});

	it("returns drilldown zoom targets", () => {
		expect(
			getDrilldownZoomForLevel(MAP_RENDER_LEVELS.PROVINCE),
		).toBeGreaterThan(MAP_LEVEL_THRESHOLDS.zoneMinZoom - 0.1);
		expect(
			getDrilldownZoomForLevel(MAP_RENDER_LEVELS.ZONE),
		).toBeGreaterThanOrEqual(MAP_LEVEL_THRESHOLDS.detailMinZoom);
		expect(getDrilldownZoomForLevel("unknown")).toBeGreaterThan(
			MAP_LEVEL_THRESHOLDS.detailMinZoom,
		);
		expect(MAP_LEVEL_THRESHOLDS.detailMinZoom).toBeGreaterThan(
			MAP_LEVEL_THRESHOLDS.zoneMinZoom,
		);
	});

	it("uses configured defaults for boundary behavior", () => {
		const detail = Number(MAP_LEVEL_THRESHOLDS.detailMinZoom);
		const zone = Number(MAP_LEVEL_THRESHOLDS.zoneMinZoom);
		expect(resolveMapRenderLevel(detail - 0.01)).toBe(MAP_RENDER_LEVELS.ZONE);
		expect(resolveMapRenderLevel(detail)).toBe(MAP_RENDER_LEVELS.DETAIL);
		expect(resolveMapRenderLevel(zone - 0.01)).toBe(MAP_RENDER_LEVELS.PROVINCE);
		expect(resolveMapRenderLevel(zone)).toBe(MAP_RENDER_LEVELS.ZONE);
	});
});
