import { describe, expect, it } from "vitest";
import {
	hasBasemapResourceActivitySince,
	hasRenderableStyleSourcesFromStyle,
	isMapContentReadyForMode,
} from "../../../src/composables/map/mapContentReadiness";

describe("mapContentReadiness", () => {
	it("detects renderable style sources", () => {
		expect(
			hasRenderableStyleSourcesFromStyle({
				sources: {
					base: {
						type: "vector",
						tiles: ["https://tiles.example.com/{z}/{x}/{y}.pbf"],
					},
				},
			}),
		).toBe(true);
		expect(
			hasRenderableStyleSourcesFromStyle({
				sources: {
					overlay: {
						type: "geojson",
						data: "https://example.com/overlay.geojson",
					},
				},
			}),
		).toBe(true);
		expect(hasRenderableStyleSourcesFromStyle({ sources: {} })).toBe(false);
	});

	it("requires real basemap resource activity after the current readiness epoch", () => {
		const entries = [
			{
				name: "https://demotiles.maplibre.org/tiles/5/10/12.pbf",
				startTime: 250,
			},
			{
				name: "http://localhost:5431/map-styles/vibecity-neon.json",
				startTime: 200,
			},
		];
		expect(
			hasBasemapResourceActivitySince(entries, 100, [
				"openfreemap.org",
				"openmaptiles.org",
				"demotiles.maplibre.org",
			]),
		).toBe(true);
		expect(
			hasBasemapResourceActivitySince(entries, 260, [
				"openfreemap.org",
				"openmaptiles.org",
				"demotiles.maplibre.org",
			]),
		).toBe(false);
	});

	it("keeps prod readiness blocked until both sources and basemap activity exist", () => {
		const style = {
			sources: {
				base: {
					type: "vector",
					url: "https://tiles.example.com",
				},
			},
		};
		const resourceEntries = [
			{
				name: "https://openfreemap.org/tiles/6/40/23.pbf",
				startTime: 400,
			},
		];
		expect(
			isMapContentReadyForMode({
				styleMode: "prod",
				style,
				resourceEntries,
				since: 200,
				hostSnippets: ["openfreemap.org"],
			}),
		).toBe(true);
		expect(
			isMapContentReadyForMode({
				styleMode: "prod",
				style,
				resourceEntries: [],
				since: 200,
				hostSnippets: ["openfreemap.org"],
			}),
		).toBe(false);
	});

	it("allows quiet mode to become ready from shell readiness without remote basemap activity", () => {
		expect(
			isMapContentReadyForMode({
				styleMode: "quiet",
				shellReady: true,
				style: { sources: {} },
			}),
		).toBe(true);
		expect(
			isMapContentReadyForMode({
				styleMode: "quiet",
				shellReady: false,
				style: { sources: {} },
			}),
		).toBe(false);
	});
});
