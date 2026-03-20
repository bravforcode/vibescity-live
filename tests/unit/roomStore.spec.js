import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	select: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		from: () => ({
			select: (...args) => mockState.select(...args),
		}),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

vi.mock("../../src/store/userStore", () => ({
	useUserStore: () => ({
		userId: null,
		profile: null,
	}),
}));

import { useRoomStore } from "../../src/store/roomStore";

describe("roomStore Supabase read policy", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockState.select.mockReset();
		mockState.select.mockResolvedValue({ data: [], error: null });
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("preserves existing counts on transient initial-count failures", async () => {
		const store = useRoomStore();
		store.updateSingleCount("venue-1", 5);
		mockState.select.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		await store.fetchInitialCounts();

		expect(store.getCount("venue-1")).toBe(5);
		expect(console.error).not.toHaveBeenCalled();
	});
});
