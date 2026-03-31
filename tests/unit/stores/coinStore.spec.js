import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
			onAuthStateChange: vi.fn(() => ({
				data: { subscription: { unsubscribe: vi.fn() } },
			})),
		},
		from: vi.fn(() => ({
			insert: vi.fn(async () => ({ error: null })),
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					single: vi.fn(async () => ({ data: null, error: null })),
				})),
			})),
		})),
		functions: {
			invoke: vi.fn(async () => ({
				data: { success: true, amount: 10 },
				error: null,
			})),
		},
	},
	isSupabaseSchemaCacheError: vi.fn(() => false),
}));

vi.mock("../../../src/i18n.js", () => ({
	default: { global: { locale: { value: "en" } } },
}));

vi.mock("../../../src/services/gamificationService", () => ({
	gamificationService: {
		// Throw so fetchUserStats' catch block runs — coins stay at test-patched values
		getDailyCheckinStatus: vi.fn(async () => {
			throw new Error("test mock — no stats");
		}),
	},
}));

vi.mock("../../../src/services/visitorIdentity", () => ({
	bootstrapVisitor: vi.fn(async () => {}),
}));

import { useCoinStore } from "../../../src/store/coinStore";

describe("coinStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	// ─── Initial State ─────────────────────────────────────────────────────
	describe("initial state", () => {
		it("starts with 0 coins", () => {
			const store = useCoinStore();
			expect(store.coins).toBe(0);
		});

		it("starts with empty collectedVenues", () => {
			const store = useCoinStore();
			expect(store.collectedVenues).toHaveLength(0);
		});

		it("venuesVisited is 0 initially", () => {
			const store = useCoinStore();
			expect(store.venuesVisited).toBe(0);
		});

		it("pendingRewards is empty initially", () => {
			const store = useCoinStore();
			expect(store.pendingRewards).toHaveLength(0);
		});

		it("isProcessing is false initially", () => {
			const store = useCoinStore();
			expect(store.isProcessing).toBe(false);
		});
	});

	// ─── currentLevel ─────────────────────────────────────────────────────
	describe("currentLevel", () => {
		it("returns level 1 at 0 coins", () => {
			const store = useCoinStore();
			expect(store.currentLevel.level).toBe(1);
		});

		it("returns level 2 at 100 coins", () => {
			const store = useCoinStore();
			store.$patch({ coins: 100 });
			expect(store.currentLevel.level).toBe(2);
		});

		it("returns level 3 at 300 coins", () => {
			const store = useCoinStore();
			store.$patch({ coins: 300 });
			expect(store.currentLevel.level).toBe(3);
		});

		it("returns level 4 at 600 coins", () => {
			const store = useCoinStore();
			store.$patch({ coins: 600 });
			expect(store.currentLevel.level).toBe(4);
		});

		it("returns level 7 (max) at 5000+ coins", () => {
			const store = useCoinStore();
			store.$patch({ coins: 9999 });
			expect(store.currentLevel.level).toBe(7);
		});
	});

	// ─── levelProgress ────────────────────────────────────────────────────
	describe("levelProgress", () => {
		it("is 0 at level start", () => {
			const store = useCoinStore();
			store.$patch({ coins: 0 });
			expect(store.levelProgress).toBe(0);
		});

		it("is 0.5 at halfway to next level", () => {
			const store = useCoinStore();
			// Level 1: 0–100, midpoint = 50
			store.$patch({ coins: 50 });
			expect(store.levelProgress).toBeCloseTo(0.5, 2);
		});

		it("caps at 1 at max level", () => {
			const store = useCoinStore();
			store.$patch({ coins: 99999 });
			expect(store.levelProgress).toBe(1);
		});
	});

	// ─── hasCollected ─────────────────────────────────────────────────────
	describe("hasCollected", () => {
		it("returns false for unknown venueId", () => {
			const store = useCoinStore();
			expect(store.hasCollected("venue-1")).toBe(false);
		});

		it("returns true after addClaimedVenue", () => {
			const store = useCoinStore();
			store.addClaimedVenue("venue-1");
			expect(store.hasCollected("venue-1")).toBe(true);
		});
	});

	// ─── addClaimedVenue ──────────────────────────────────────────────────
	describe("addClaimedVenue", () => {
		it("adds venueId to collectedVenues", () => {
			const store = useCoinStore();
			store.addClaimedVenue("venue-42");
			expect(store.collectedVenues).toContain("venue-42");
			expect(store.venuesVisited).toBe(1);
		});

		it("prevents duplicate entries in collectedVenues", () => {
			const store = useCoinStore();
			store.addClaimedVenue("venue-42");
			store.addClaimedVenue("venue-42");
			const occurrences = store.collectedVenues.filter(
				(id) => id === "venue-42",
			);
			expect(occurrences).toHaveLength(1);
		});

		it("adds to claimedVenueIds", () => {
			const store = useCoinStore();
			store.addClaimedVenue("venue-10");
			expect(store.claimedVenueIds).toContain("venue-10");
		});

		it("prevents duplicate entries in claimedVenueIds", () => {
			const store = useCoinStore();
			store.addClaimedVenue("venue-10");
			store.addClaimedVenue("venue-10");
			expect(
				store.claimedVenueIds.filter((id) => id === "venue-10"),
			).toHaveLength(1);
		});
	});

	// ─── syncFromServer ───────────────────────────────────────────────────
	describe("syncFromServer", () => {
		it("sets coins from server balance", async () => {
			const store = useCoinStore();
			await store.syncFromServer(250, []);
			expect(store.coins).toBe(250);
		});

		it("merges server claimedIds into collectedVenues", async () => {
			const store = useCoinStore();
			await store.syncFromServer(0, ["venue-x", "venue-y"]);
			expect(store.collectedVenues).toContain("venue-x");
			expect(store.collectedVenues).toContain("venue-y");
		});

		it("does not overwrite coins for non-number balance", async () => {
			const store = useCoinStore();
			store.$patch({ coins: 100 });
			await store.syncFromServer("invalid", []);
			expect(store.coins).toBe(100);
		});

		it("does not overwrite coins for negative balance", async () => {
			const store = useCoinStore();
			store.$patch({ coins: 50 });
			await store.syncFromServer(-10, []);
			// negative is < 0, so condition fails and coins stay
			expect(store.coins).toBe(50);
		});
	});

	// ─── spendCoins ───────────────────────────────────────────────────────
	describe("spendCoins", () => {
		it("deducts coins when balance is sufficient", async () => {
			const store = useCoinStore();
			store.$patch({ coins: 100 });
			const result = await store.spendCoins(30);
			expect(result.success).toBe(true);
			expect(result.newBalance).toBe(70);
			expect(store.coins).toBe(70);
		});

		it("fails with insufficient_funds when balance is too low", async () => {
			const store = useCoinStore();
			store.$patch({ coins: 20 });
			const result = await store.spendCoins(50);
			expect(result.success).toBe(false);
			expect(result.reason).toBe("insufficient_funds");
			expect(store.coins).toBe(20);
		});

		it("allows spending exact balance", async () => {
			const store = useCoinStore();
			store.$patch({ coins: 50 });
			const result = await store.spendCoins(50);
			expect(result.success).toBe(true);
			expect(store.coins).toBe(0);
		});
	});

	// ─── awardBonus ───────────────────────────────────────────────────────
	describe("awardBonus", () => {
		it("increments coins and totalEarned", async () => {
			const store = useCoinStore();
			await store.awardBonus(50, "test");
			expect(store.coins).toBe(50);
			expect(store.totalEarned).toBe(50);
		});

		it("queues a pending reward", async () => {
			const store = useCoinStore();
			await store.awardBonus(25, "bonus-reason");
			expect(store.pendingRewards).toHaveLength(1);
			expect(store.pendingRewards[0].amount).toBe(25);
			expect(store.pendingRewards[0].reason).toBe("bonus-reason");
		});

		it("accumulates multiple bonuses", async () => {
			const store = useCoinStore();
			await store.awardBonus(10, "r1");
			await store.awardBonus(20, "r2");
			expect(store.coins).toBe(30);
			expect(store.totalEarned).toBe(30);
			expect(store.pendingRewards).toHaveLength(2);
		});
	});

	// ─── clearPendingReward ───────────────────────────────────────────────
	describe("clearPendingReward", () => {
		it("removes the first pending reward", async () => {
			const store = useCoinStore();
			await store.awardBonus(10, "r1");
			await store.awardBonus(20, "r2");
			store.clearPendingReward();
			expect(store.pendingRewards).toHaveLength(1);
			expect(store.pendingRewards[0].amount).toBe(20);
		});

		it("is safe when queue is empty", () => {
			const store = useCoinStore();
			expect(() => store.clearPendingReward()).not.toThrow();
			expect(store.pendingRewards).toHaveLength(0);
		});
	});

	// ─── xpToNextLevel ────────────────────────────────────────────────────
	describe("xpToNextLevel", () => {
		it("returns 100 at 0 coins (level 1 → 2)", () => {
			const store = useCoinStore();
			expect(store.xpToNextLevel).toBe(100);
		});

		it("returns correct gap at level 2", () => {
			const store = useCoinStore();
			store.$patch({ coins: 100 });
			expect(store.xpToNextLevel).toBe(200); // 300 - 100
		});

		it("returns 0 at max level", () => {
			const store = useCoinStore();
			store.$patch({ coins: 5000 });
			expect(store.xpToNextLevel).toBe(0);
		});
	});
});
