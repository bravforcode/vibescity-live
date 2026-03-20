import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	getDailyCheckinStatus: vi.fn(),
	bootstrapVisitor: vi.fn(),
	from: vi.fn(),
	coinInsert: vi.fn(),
	userStore: {
		isAuthenticated: false,
		userId: null,
		profile: null,
	},
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		from: (...args) => mockState.from(...args),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

vi.mock("../../src/services/gamificationService", () => ({
	gamificationService: {
		getDailyCheckinStatus: (...args) => mockState.getDailyCheckinStatus(...args),
	},
}));

vi.mock("../../src/services/visitorIdentity", () => ({
	bootstrapVisitor: (...args) => mockState.bootstrapVisitor(...args),
}));

vi.mock("../../src/store/userStore", () => ({
	useUserStore: () => mockState.userStore,
}));

import { useCoinStore } from "../../src/store/coinStore";

describe("coinStore Supabase read policy", () => {
	let store;

	beforeEach(() => {
		setActivePinia(createPinia());
		mockState.getDailyCheckinStatus.mockReset();
		mockState.bootstrapVisitor.mockReset();
		mockState.from.mockReset();
		mockState.coinInsert.mockReset();
		mockState.userStore.isAuthenticated = false;
		mockState.userStore.userId = null;
		mockState.userStore.profile = null;
		mockState.bootstrapVisitor.mockResolvedValue(undefined);
		mockState.getDailyCheckinStatus.mockResolvedValue({
			balance: 0,
			streak: 0,
		});
		mockState.coinInsert.mockResolvedValue({ error: null });
		mockState.from.mockImplementation((table) => {
			if (table === "coin_transactions") {
				return {
					insert: (...args) => mockState.coinInsert(...args),
				};
			}
			return {
				insert: (...args) => mockState.coinInsert(...args),
			};
		});
		vi.restoreAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		store = useCoinStore();
	});

	afterEach(() => {
		store?.$dispose?.();
	});

	it("preserves coin stats on transient user-stats failures", async () => {
		store.coins = 77;
		store.totalEarned = 140;
		store.dailyStreak = 4;
		mockState.getDailyCheckinStatus.mockRejectedValue(
			new TypeError("Failed to fetch"),
		);

		await store.fetchUserStats();

		expect(store.coins).toBe(77);
		expect(store.totalEarned).toBe(140);
		expect(store.dailyStreak).toBe(4);
		expect(console.error).not.toHaveBeenCalled();
	});

	it("rolls back spent coins when transaction persistence fails", async () => {
		mockState.userStore.isAuthenticated = true;
		mockState.userStore.userId = "user-1";
		store.coins = 120;
		mockState.coinInsert.mockResolvedValue({
			error: new Error("Spend failed"),
		});

		const result = await store.spendCoins(40, "purchase");

		expect(result).toEqual({
			success: false,
			reason: "error",
			error: "Spend failed",
		});
		expect(store.coins).toBe(120);
	});
});
