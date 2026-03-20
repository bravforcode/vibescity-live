import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	loadOfflineActionQueue: vi.fn(),
	appendOfflineAction: vi.fn(),
	saveOfflineActionQueue: vi.fn(),
	clearOfflineActionQueue: vi.fn(),
	getNetworkOnlineState: vi.fn(),
	userStore: {
		isAuthenticated: false,
		userId: null,
	},
	selectEq: vi.fn(),
	deleteEq: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		from: () => ({
			select: () => ({
				eq: (...args) => mockState.selectEq(...args),
			}),
			delete: () => ({
				eq: (...args) => mockState.deleteEq(...args),
			}),
		}),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

vi.mock("../../src/services/networkState", () => ({
	getNetworkOnlineState: () => mockState.getNetworkOnlineState(),
}));

vi.mock("../../src/services/offlineActionQueue", () => ({
	appendOfflineAction: (...args) => mockState.appendOfflineAction(...args),
	clearOfflineActionQueue: (...args) => mockState.clearOfflineActionQueue(...args),
	deduplicateQueue: (items) => items,
	getBackoffDelay: () => 0,
	loadOfflineActionQueue: (...args) => mockState.loadOfflineActionQueue(...args),
	MAX_RETRIES: 3,
	saveOfflineActionQueue: (...args) => mockState.saveOfflineActionQueue(...args),
}));

vi.mock("../../src/store/userStore", () => ({
	useUserStore: () => mockState.userStore,
}));

import { useFavoritesStore } from "../../src/store/favoritesStore";

describe("favoritesStore Supabase read policy", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockState.userStore.isAuthenticated = false;
		mockState.userStore.userId = null;
		mockState.loadOfflineActionQueue.mockReset();
		mockState.appendOfflineAction.mockReset();
		mockState.saveOfflineActionQueue.mockReset();
		mockState.clearOfflineActionQueue.mockReset();
		mockState.getNetworkOnlineState.mockReset();
		mockState.selectEq.mockReset();
		mockState.deleteEq.mockReset();
		mockState.loadOfflineActionQueue.mockResolvedValue([]);
		mockState.getNetworkOnlineState.mockReturnValue(true);
		mockState.selectEq.mockResolvedValue({ data: [], error: null });
		mockState.deleteEq.mockResolvedValue({ error: null });
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("preserves favorites on transient fetch failures", async () => {
		const store = useFavoritesStore();
		store.favoriteIds = ["venue-1", "venue-2"];
		mockState.userStore.isAuthenticated = true;
		mockState.userStore.userId = "user-1";
		mockState.selectEq.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		await store.fetchFavorites();

		expect(store.favoriteIds).toEqual(["venue-1", "venue-2"]);
		expect(store.syncStatus).toBe("idle");
		expect(console.error).not.toHaveBeenCalled();
	});

	it("rolls back optimistic clearAll when deletion fails", async () => {
		const store = useFavoritesStore();
		store.favoriteIds = ["venue-1", "venue-2"];
		mockState.userStore.isAuthenticated = true;
		mockState.userStore.userId = "user-1";
		mockState.deleteEq.mockResolvedValue({
			error: new Error("Delete failed"),
		});

		const result = await store.clearAll();

		expect(result).toEqual({
			success: false,
			error: "Delete failed",
		});
		expect(store.favoriteIds).toEqual(["venue-1", "venue-2"]);
	});
});
