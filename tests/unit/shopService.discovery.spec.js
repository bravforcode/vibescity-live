import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n.js", () => ({
	default: {
		global: {
			t: (key) => key,
		},
	},
}));

const mockState = vi.hoisted(() => ({
	from: vi.fn(),
	rpc: vi.fn(),
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test",
}));

vi.mock("../../src/lib/supabase", () => ({
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
	supabase: {
		from: (...args) => mockState.from(...args),
		rpc: (...args) => mockState.rpc(...args),
	},
}));

import { getFeedCards, getShops } from "../../src/services/shopService";

describe("shopService legacy discovery policy", () => {
	beforeEach(() => {
		mockState.from.mockReset();
		mockState.rpc.mockReset();
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("returns an empty list when legacy venue discovery fails transiently", async () => {
		mockState.from.mockReturnValue({
			select: () =>
				Promise.resolve({
					data: null,
					error: new TypeError("Failed to fetch"),
				}),
		});

		const result = await getShops();

		expect(result).toEqual([]);
		expect(console.error).not.toHaveBeenCalled();
	});

	it("returns an empty list when legacy feed discovery fails transiently", async () => {
		mockState.rpc.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		const result = await getFeedCards(18.7883, 98.9853);

		expect(result).toEqual([]);
		expect(console.error).not.toHaveBeenCalled();
	});
});
