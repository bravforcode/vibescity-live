import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	rpc: vi.fn(),
	venuesLimit: vi.fn(),
	venuesEqLimit: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		rpc: (...args) => mockState.rpc(...args),
		from: (table) => {
			if (table !== "venues") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return {
				select: () => ({
					eq: () => ({
						limit: (...args) => mockState.venuesEqLimit(...args),
					}),
					limit: (...args) => mockState.venuesLimit(...args),
				}),
				upsert: vi.fn(),
			};
		},
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

import {
	CONFIG,
	fetchOSMPlaces,
	getNearbyShops,
} from "../../src/services/realTimeDataService";

describe("realTimeDataService fallback policy", () => {
	beforeEach(() => {
		mockState.rpc.mockReset();
		mockState.venuesLimit.mockReset();
		mockState.venuesEqLimit.mockReset();
		mockState.venuesLimit.mockResolvedValue({ data: [], error: null });
		mockState.venuesEqLimit.mockResolvedValue({ data: [], error: null });
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.unstubAllGlobals();
	});

	it("uses stale OSM cache when a later transient refresh fails", async () => {
		let now = 0;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						elements: [
							{
								id: 1,
								lat: 18.7883,
								lon: 98.9853,
								tags: {
									name: "Cached Cafe",
									amenity: "cafe",
								},
							},
						],
					}),
				})
				.mockRejectedValueOnce(new TypeError("Failed to fetch")),
		);

		const first = await fetchOSMPlaces("เชียงใหม่");
		now = CONFIG.CACHE_DURATION + 1;
		const second = await fetchOSMPlaces("เชียงใหม่");

		expect(first).toHaveLength(1);
		expect(second).toEqual(first);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(console.error).not.toHaveBeenCalled();
	});

	it("falls back to venue query when nearby RPC fails transiently", async () => {
		mockState.rpc.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});
		mockState.venuesLimit.mockResolvedValue({
			data: [{ id: "fallback-1", name: "Fallback Venue" }],
			error: null,
		});

		const result = await getNearbyShops(18.7883, 98.9853, 5000);

		expect(result).toEqual([{ id: "fallback-1", name: "Fallback Venue" }]);
		expect(console.error).not.toHaveBeenCalled();
	});
});
