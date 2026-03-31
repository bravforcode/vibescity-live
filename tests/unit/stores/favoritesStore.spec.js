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
			upsert: vi.fn(async () => ({ error: null })),
			delete: vi.fn(() => ({
				eq: vi.fn(() => ({
					eq: vi.fn(async () => ({ error: null })),
				})),
			})),
			select: vi.fn(() => ({
				eq: vi.fn(async () => ({ data: [], error: null })),
			})),
		})),
	},
	isSupabaseSchemaCacheError: vi.fn(() => false),
}));

vi.mock("../../../src/i18n.js", () => ({
	default: { global: { locale: { value: "en" } } },
}));

vi.mock("../../../src/services/networkState", () => ({
	getNetworkOnlineState: vi.fn(() => true),
}));

vi.mock("../../../src/services/offlineActionQueue", () => ({
	appendOfflineAction: vi.fn(async () => []),
	clearOfflineActionQueue: vi.fn(async () => {}),
	deduplicateQueue: vi.fn((q) => q),
	getBackoffDelay: vi.fn(() => 0),
	loadOfflineActionQueue: vi.fn(async () => []),
	MAX_RETRIES: 3,
	saveOfflineActionQueue: vi.fn(async () => {}),
}));

import { useFavoritesStore } from "../../../src/store/favoritesStore";

describe("favoritesStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	// ─── isFavorite ───────────────────────────────────────────────────────
	describe("isFavorite", () => {
		it("returns false for an unknown shopId", () => {
			const store = useFavoritesStore();
			expect(store.isFavorite("shop-1")).toBe(false);
		});

		it("returns true after adding to favorites", () => {
			const store = useFavoritesStore();
			store.addFavorite("shop-1");
			expect(store.isFavorite("shop-1")).toBe(true);
		});

		it("returns false after removing from favorites", () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["shop-1"] });
			store.removeFavorite("shop-1");
			expect(store.isFavorite("shop-1")).toBe(false);
		});
	});

	// ─── toggleFavorite ───────────────────────────────────────────────────
	describe("toggleFavorite", () => {
		it("adds shopId when not a favorite and returns true", () => {
			const store = useFavoritesStore();
			const wasAdded = store.toggleFavorite("shop-1");
			expect(wasAdded).toBe(true);
			expect(store.favoriteIds).toContain("shop-1");
		});

		it("removes shopId when already a favorite and returns false", () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["shop-1"] });
			const wasAdded = store.toggleFavorite("shop-1");
			expect(wasAdded).toBe(false);
			expect(store.favoriteIds).not.toContain("shop-1");
		});

		it("toggles correctly on repeated calls", () => {
			const store = useFavoritesStore();
			store.toggleFavorite("shop-2"); // add
			store.toggleFavorite("shop-2"); // remove
			expect(store.isFavorite("shop-2")).toBe(false);
		});
	});

	// ─── addFavorite ──────────────────────────────────────────────────────
	describe("addFavorite", () => {
		it("adds a new shop to favorites and returns true", () => {
			const store = useFavoritesStore();
			const result = store.addFavorite("shop-2");
			expect(result).toBe(true);
			expect(store.isFavorite("shop-2")).toBe(true);
		});

		it("returns false if shop is already a favorite", () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["shop-2"] });
			const result = store.addFavorite("shop-2");
			expect(result).toBe(false);
		});

		it("does not create duplicate entries", () => {
			const store = useFavoritesStore();
			store.addFavorite("shop-5");
			store.addFavorite("shop-5");
			expect(
				store.favoriteIds.filter((id) => id === "shop-5"),
			).toHaveLength(1);
		});
	});

	// ─── removeFavorite ───────────────────────────────────────────────────
	describe("removeFavorite", () => {
		it("removes a shop from favorites", () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["shop-3"] });
			store.removeFavorite("shop-3");
			expect(store.isFavorite("shop-3")).toBe(false);
		});

		it("returns false if shop is not a favorite", () => {
			const store = useFavoritesStore();
			const result = store.removeFavorite("shop-99");
			expect(result).toBe(false);
		});
	});

	// ─── count and hasFavorites ───────────────────────────────────────────
	describe("count and hasFavorites", () => {
		it("count is 0 initially", () => {
			const store = useFavoritesStore();
			expect(store.count).toBe(0);
		});

		it("count reflects the number of favorites", () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["a", "b", "c"] });
			expect(store.count).toBe(3);
		});

		it("hasFavorites is false when empty", () => {
			const store = useFavoritesStore();
			expect(store.hasFavorites).toBe(false);
		});

		it("hasFavorites is true when at least one favorite exists", () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["shop-1"] });
			expect(store.hasFavorites).toBe(true);
		});

		it("count updates after toggle", () => {
			const store = useFavoritesStore();
			store.toggleFavorite("shop-x");
			expect(store.count).toBe(1);
			store.toggleFavorite("shop-x");
			expect(store.count).toBe(0);
		});
	});

	// ─── clearAll ─────────────────────────────────────────────────────────
	describe("clearAll", () => {
		it("empties all favorites immediately", async () => {
			const store = useFavoritesStore();
			store.$patch({ favoriteIds: ["shop-1", "shop-2", "shop-3"] });
			await store.clearAll();
			expect(store.favoriteIds).toHaveLength(0);
			expect(store.count).toBe(0);
		});

		it("is safe when favorites are already empty", async () => {
			const store = useFavoritesStore();
			await expect(store.clearAll()).resolves.not.toThrow();
			expect(store.favoriteIds).toHaveLength(0);
		});
	});

	// ─── collections ──────────────────────────────────────────────────────
	describe("collections", () => {
		it("createCollection adds a new collection with name and icon", () => {
			const store = useFavoritesStore();
			const id = store.createCollection("Nightlife", "🌙");
			expect(store.collections).toHaveLength(1);
			expect(store.collections[0].name).toBe("Nightlife");
			expect(store.collections[0].icon).toBe("🌙");
			expect(store.collections[0].id).toBe(id);
		});

		it("createCollection defaults icon to ❤️", () => {
			const store = useFavoritesStore();
			store.createCollection("Bars");
			expect(store.collections[0].icon).toBe("❤️");
		});

		it("addToCollection adds shopId to the collection", () => {
			const store = useFavoritesStore();
			const colId = store.createCollection("Bars");
			const result = store.addToCollection(colId, "shop-5");
			expect(result).toBe(true);
			expect(store.collections[0].items).toContain("shop-5");
		});

		it("addToCollection prevents duplicate items", () => {
			const store = useFavoritesStore();
			const colId = store.createCollection("Bars");
			store.addToCollection(colId, "shop-5");
			store.addToCollection(colId, "shop-5");
			expect(
				store.collections[0].items.filter((id) => id === "shop-5"),
			).toHaveLength(1);
		});

		it("addToCollection returns false for unknown collection", () => {
			const store = useFavoritesStore();
			const result = store.addToCollection("nonexistent-id", "shop-5");
			expect(result).toBe(false);
		});

		it("removeFromCollection removes a shop from the collection", () => {
			const store = useFavoritesStore();
			const colId = store.createCollection("Test");
			store.addToCollection(colId, "shop-7");
			store.removeFromCollection(colId, "shop-7");
			expect(store.collections[0].items).not.toContain("shop-7");
		});

		it("deleteCollection removes the collection by id", () => {
			const store = useFavoritesStore();
			const colId = store.createCollection("Delete Me");
			store.deleteCollection(colId);
			expect(store.collections).toHaveLength(0);
		});

		it("deleteCollection only removes the matching collection", async () => {
			const store = useFavoritesStore();
			const id1 = store.createCollection("Keep");
			// Small delay so Date.now() produces a different value for the second collection
			await new Promise((resolve) => setTimeout(resolve, 2));
			const id2 = store.createCollection("Delete Me");
			store.deleteCollection(id2);
			expect(store.collections).toHaveLength(1);
			expect(store.collections[0].id).toBe(id1);
		});
	});
});
