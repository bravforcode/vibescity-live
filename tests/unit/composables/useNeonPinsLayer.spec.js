import { describe, expect, it } from "vitest";
import {
	buildNeonPinDisplayItems,
	isProjectedNeonCandidateVisible,
	MAX_VISIBLE_NEON_PINS,
	NEON_PIN_CLUSTER_START_ZOOM,
} from "../../../src/composables/map/useNeonPinsLayer";

const buildCandidate = (id, x, y, overrides = {}) => {
	const numericSeed = Number.isFinite(Number(id)) ? Number(id) : 0;
	return {
		x,
		y,
		shop: {
			id: String(id),
			name: `Shop ${id}`,
			category: "Cafe",
			lat: 13.75 + numericSeed * 0.001,
			lng: 100.5 + numericSeed * 0.001,
			isLive: false,
			...overrides,
		},
	};
};

describe("buildNeonPinDisplayItems", () => {
	it("keeps up to 30 real neon pins visible at high zoom", () => {
		const candidates = Array.from(
			{ length: MAX_VISIBLE_NEON_PINS + 5 },
			(_, index) => buildCandidate(index + 1, index * 18, 120 + index),
		);

		const items = buildNeonPinDisplayItems({
			candidates,
			zoom: NEON_PIN_CLUSTER_START_ZOOM + 1,
			centerX: 200,
			centerY: 200,
		});

		expect(items).toHaveLength(MAX_VISIBLE_NEON_PINS);
		expect(items.every((item) => item.kind === "shop")).toBe(true);
	});

	it("respects a dynamic maxVisible pin count", () => {
		const candidates = Array.from(
			{ length: 20 },
			(_, index) => buildCandidate(index + 1, index * 10, index * 10),
		);

		const items = buildNeonPinDisplayItems({
			candidates,
			zoom: 16,
			maxVisible: 8,
			centerX: 100,
			centerY: 100,
		});

		expect(items).toHaveLength(8);
	});

	it("merges nearby venues into a single neon cluster when zoomed out", () => {
		const items = buildNeonPinDisplayItems({
			candidates: [
				buildCandidate(1, 100, 100),
				buildCandidate(2, 124, 112),
				buildCandidate(3, 146, 108),
				buildCandidate(4, 380, 260),
			],
			zoom: 13.9,
			centerX: 240,
			centerY: 180,
		});

		expect(items).toHaveLength(2);
		expect(
			items.find((item) => item.kind === "cluster")?.shop.clusterSize,
		).toBe(3);
		expect(items.find((item) => item.kind === "shop")?.shop.id).toBe("4");
	});

	it("keeps the focused venue separate while clustering surrounding venues", () => {
		const items = buildNeonPinDisplayItems({
			candidates: [
				buildCandidate("focus", 140, 140),
				buildCandidate(2, 150, 144),
				buildCandidate(3, 166, 152),
				buildCandidate(4, 182, 148),
			],
			zoom: 13.8,
			focusId: "focus",
			centerX: 160,
			centerY: 160,
		});

		const focusedItem = items.find((item) => item.key === "shop:focus");
		const clusterItem = items.find((item) => item.kind === "cluster");

		expect(focusedItem).toBeTruthy();
		expect(focusedItem?.overlayType).toBe("selected");
		expect(clusterItem?.shop.clusterSize).toBe(3);
		expect(
			clusterItem?.shop.clusterMembers
				.map((shop) => shop.id)
				.slice()
				.sort(),
		).toEqual(["2", "3", "4"]);
	});

	it("drops regular neon signs that would render clipped against the viewport edge", () => {
		expect(
			isProjectedNeonCandidateVisible({
				x: 30,
				y: 82,
				width: 390,
				height: 844,
				isFocused: false,
			}),
		).toBe(false);
		expect(
			isProjectedNeonCandidateVisible({
				x: 140,
				y: 220,
				width: 390,
				height: 844,
				isFocused: false,
			}),
		).toBe(true);
	});
});
