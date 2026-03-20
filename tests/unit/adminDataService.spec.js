import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	queryRange: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		from: () => ({
			select: () => ({
				order: () => ({
					range: (...args) => mockState.queryRange(...args),
				}),
			}),
		}),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

import { adminDataService } from "../../src/services/adminDataService";

describe("adminDataService unified read policy", () => {
	beforeEach(() => {
		mockState.queryRange.mockReset();
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("returns an empty page for transient paginated query failures", async () => {
		mockState.queryRange.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
			count: null,
		});

		const result = await adminDataService.queryTable("user_profiles", {
			page: 2,
			pageSize: 25,
		});

		expect(result).toEqual({
			rows: [],
			total: 0,
			page: 2,
			pageSize: 25,
			totalPages: 0,
		});
		expect(console.error).not.toHaveBeenCalled();
	});
});
