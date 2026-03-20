import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	rpc: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		rpc: (...args) => mockState.rpc(...args),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

import { getNearbyShops, getShopsInBounds } from "../../src/services/geoService";

describe("geoService discovery fallbacks", () => {
	beforeEach(() => {
		mockState.rpc.mockReset();
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("retries transient nearby discovery once before succeeding", async () => {
		mockState.rpc
			.mockResolvedValueOnce({
				data: null,
				error: new TypeError("Failed to fetch"),
			})
			.mockResolvedValueOnce({
				data: [{ id: 1, name: "Nearby Cafe" }],
				error: null,
			});

		const result = await getNearbyShops(18.7883, 98.9853);

		expect(mockState.rpc).toHaveBeenCalledTimes(2);
		expect(result).toEqual([{ id: 1, name: "Nearby Cafe" }]);
		expect(console.error).not.toHaveBeenCalled();
	});

	it("returns an empty list when bounds discovery keeps failing transiently", async () => {
		mockState.rpc.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		const result = await getShopsInBounds(18.78, 98.98, 18.79, 98.99);

		expect(mockState.rpc).toHaveBeenCalledTimes(2);
		expect(result).toEqual([]);
		expect(console.error).not.toHaveBeenCalled();
	});
});
