import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	enabledFlags: new Set(),
	from: vi.fn(),
	rpc: vi.fn(),
	apiFetch: vi.fn(),
	parseApiError: vi.fn(),
	refreshFlags: vi.fn(async () => {}),
	setUserLocation: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		from: (...args) => mockState.from(...args),
		rpc: (...args) => mockState.rpc(...args),
	},
	isSupabaseSchemaCacheError: (error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
}));

vi.mock("../../src/services/apiClient", () => ({
	apiFetch: (...args) => mockState.apiFetch(...args),
	parseApiError: (...args) => mockState.parseApiError(...args),
}));

vi.mock("../../src/store/featureFlagStore", () => ({
	useFeatureFlagStore: () => ({
		refreshFlags: mockState.refreshFlags,
		isEnabled: (key) => mockState.enabledFlags.has(key),
	}),
}));

vi.mock("../../src/store/locationStore", () => ({
	useLocationStore: () => ({
		userLocation: [18.7883, 98.9853],
		setUserLocation: mockState.setUserLocation,
	}),
}));

vi.mock("../../src/store/userStore", () => ({
	useUserStore: () => ({
		isAuthenticated: false,
	}),
}));

import { useShopStore } from "../../src/store/shopStore";

const createVenueRow = (overrides = {}) => ({
	id: overrides.id ?? 1,
	slug: overrides.slug ?? "test-venue",
	name: overrides.name ?? "Test Venue",
	category: overrides.category ?? "Cafe",
	status: overrides.status ?? "active",
	created_at: overrides.created_at ?? "2026-03-18T00:00:00.000Z",
	latitude: overrides.latitude ?? 18.7883,
	longitude: overrides.longitude ?? 98.9853,
	image_urls: overrides.image_urls ?? ["https://example.com/venue.jpg"],
	...overrides,
});

const createSupabaseTableMock = (handler) => ({
	select: (selection) => ({
		order: (...args) => handler({ method: "order", selection, args }),
		in: (...args) => handler({ method: "in", selection, args }),
		eq: (...args) => ({
			maybeSingle: () => handler({ method: "maybeSingle", selection, args }),
			order: (...orderArgs) => ({
				limit: (...limitArgs) =>
					handler({
						method: "eqOrderLimit",
						selection,
						args,
						orderArgs,
						limitArgs,
					}),
			}),
		}),
	}),
	insert: () => ({
		select: () => ({
			single: async () => ({ data: null, error: null }),
		}),
	}),
});

describe("shopStore discovery fallbacks", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockState.enabledFlags.clear();
		mockState.from.mockReset();
		mockState.rpc.mockReset();
		mockState.apiFetch.mockReset();
		mockState.parseApiError.mockReset();
		mockState.refreshFlags.mockClear();
		mockState.setUserLocation.mockReset();
		mockState.parseApiError.mockResolvedValue("reviews_api_unavailable");
		vi.restoreAllMocks();
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	it("falls back to local search when v2 search fails transiently", async () => {
		const store = useShopStore();
		store.setShops([
			createVenueRow({ id: 1, name: "Blue Cafe", slug: "blue-cafe" }),
			createVenueRow({
				id: 2,
				name: "Red Bar",
				slug: "red-bar",
				category: "Nightlife",
			}),
		]);
		mockState.enabledFlags.add("use_v2_search");
		mockState.rpc.mockResolvedValue({
			data: null,
			error: new TypeError("Failed to fetch"),
		});

		await store.searchV2("Blue");

		expect(store.error).toBeNull();
		expect(store.searchQuery).toBe("Blue");
		expect(store.filteredShops).toHaveLength(1);
		expect(store.filteredShops[0].name).toBe("Blue Cafe");

		store.stopRotationTimer();
	});

	it("keeps current venue state when discovery fetch fails transiently", async () => {
		const store = useShopStore();
		store.setShops([createVenueRow({ id: 7, name: "Stable Venue" })]);

		mockState.from.mockImplementation((table) => {
			if (table !== "venues") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return createSupabaseTableMock(() =>
				Promise.resolve({
					data: null,
					error: new TypeError("Failed to fetch"),
				}),
			);
		});

		await store.fetchShops(true);

		expect(store.error).toBeNull();
		expect(store.shops).toHaveLength(1);
		expect(store.shops[0].name).toBe("Stable Venue");

		store.stopRotationTimer();
	});

	it("keeps base venue rows when optional enrichment fails transiently", async () => {
		const store = useShopStore();
		const baseRow = createVenueRow({
			id: 9,
			name: "Discovery Venue",
			description: "Base row",
		});

		mockState.from.mockImplementation((table) => {
			if (table === "venues") {
				return createSupabaseTableMock(() =>
					Promise.resolve({
						data: [baseRow],
						error: null,
					}),
				);
			}
			if (table === "venues_public") {
				return createSupabaseTableMock(() =>
					Promise.resolve({
						data: null,
						error: new TypeError("Failed to fetch"),
					}),
				);
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		await store.fetchShops(true);

		expect(store.error).toBeNull();
		expect(store.shops).toHaveLength(1);
		expect(store.shops[0].name).toBe("Discovery Venue");

		store.stopRotationTimer();
	});

	it("adds a temporary review immediately and replaces it after successful submission", async () => {
		const store = useShopStore();
		let resolveApi;
		mockState.apiFetch.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveApi = resolve;
				}),
		);

		const submitPromise = store.addReview(77, {
			rating: 5,
			comment: "Great place",
			userName: "Tester",
		});

		expect(store.getShopReviews(77)).toHaveLength(1);
		expect(store.getShopReviews(77)[0].optimistic).toBe(true);

		resolveApi({
			ok: true,
			json: async () => ({
				id: "review-1",
				comment: "Great place",
				user_name: "Tester",
			}),
		});

		const result = await submitPromise;

		expect(result).toEqual({
			success: true,
			data: {
				id: "review-1",
				comment: "Great place",
				user_name: "Tester",
			},
		});
		expect(store.getShopReviews(77)).toEqual([
			{
				id: "review-1",
				comment: "Great place",
				user_name: "Tester",
			},
		]);

		store.stopRotationTimer();
	});

	it("rolls back the temporary review when all review submission paths fail", async () => {
		const store = useShopStore();
		mockState.apiFetch.mockRejectedValue(new Error("API down"));
		mockState.from.mockImplementation((table) => {
			if (table !== "reviews") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return {
				insert: () => ({
					select: () => ({
						single: async () => ({
							data: null,
							error: new Error("DB down"),
						}),
					}),
				}),
			};
		});

		const submitPromise = store.addReview(88, {
			rating: 4,
			comment: "Needs work",
			userName: "Tester",
		});

		expect(store.getShopReviews(88)).toHaveLength(1);
		expect(store.getShopReviews(88)[0].optimistic).toBe(true);

		const result = await submitPromise;

		expect(result).toEqual({
			success: false,
			error: "DB down",
		});
		expect(store.getShopReviews(88)).toEqual([]);

		store.stopRotationTimer();
	});

	it("filters hidden review statuses when Supabase review fallback is used", async () => {
		const store = useShopStore();
		mockState.apiFetch.mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({ detail: "missing route" }),
		});
		mockState.from.mockImplementation((table) => {
			if (table !== "reviews") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return createSupabaseTableMock(({ method, args }) => {
				if (method !== "eqOrderLimit") {
					throw new Error(`Unexpected reviews method: ${method}`);
				}
				expect(args).toEqual(["venue_id", 55]);
				return Promise.resolve({
					data: [
						{
							id: "visible-review",
							comment: "Still visible",
							status: "approved",
						},
						{
							id: "flagged-review",
							comment: "Should be hidden",
							status: "flagged",
						},
						{
							id: "deleted-review",
							comment: "[deleted]",
							status: "deleted",
						},
					],
					error: null,
				});
			});
		});

		await store.fetchShopReviews(55);

		expect(store.getShopReviews(55)).toEqual([
			{
				id: "visible-review",
				comment: "Still visible",
				status: "approved",
			},
		]);

		store.stopRotationTimer();
	});
});
