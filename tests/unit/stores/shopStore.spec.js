import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const venueMaybeSingleMock = vi.fn(async () => ({ data: null, error: null }));
const venueOrderMock = vi.fn(async () => ({ data: [], error: null }));
const venueSelectMock = vi.fn(() => ({
	order: venueOrderMock,
	eq: vi.fn(() => ({ maybeSingle: venueMaybeSingleMock })),
	in: vi.fn(async () => ({ data: [], error: null })),
}));
const supabaseFromMock = vi.fn(() => ({
	select: venueSelectMock,
}));
const supabaseRpcMock = vi.fn(async () => ({ data: [], error: null }));
const featureFlagRefreshMock = vi.fn(async () => {});
const featureFlagIsEnabledMock = vi.fn((key) => {
	if (key === "enable_feed_virtualization_v2") return true;
	if (key === "use_v2_feed") return true;
	if (key === "use_v2_search") return true;
	return false;
});

const mockShouldUseLocalVenueSnapshot = vi.fn(() => false);
const mockGetRealVenueMedia = vi.fn(async () => null);
const mockApiFetch = vi.fn(async () => ({ ok: true, json: async () => [] }));

vi.mock("../../../src/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
			onAuthStateChange: vi.fn(() => ({
				data: { subscription: { unsubscribe: vi.fn() } },
			})),
		},
		from: supabaseFromMock,
		rpc: supabaseRpcMock,
		functions: {
			invoke: vi.fn(async () => ({ data: null, error: null })),
		},
	},
	isSupabaseSchemaCacheError: vi.fn(() => false),
}));

vi.mock("../../../src/lib/localVenueSnapshot", () => ({
	getLocalVenueSnapshotRowById: vi.fn(async () => null),
	loadLocalVenueSnapshotRows: vi.fn(async () => []),
	shouldUseLocalVenueSnapshot: mockShouldUseLocalVenueSnapshot,
}));

vi.mock("../../../src/services/shopService", () => ({
	enrichVenueRowsWithRealMedia: vi.fn(async (rows) => rows),
	getRealVenueMedia: mockGetRealVenueMedia,
	mergeVenueRowWithRealMedia: vi.fn((row, mediaRecord) => ({
		...row,
		image_urls: Array.isArray(mediaRecord?.images) ? mediaRecord.images : [],
		video_url: mediaRecord?.videoUrl || mediaRecord?.video_url || "",
		real_media: Array.isArray(mediaRecord?.media) ? mediaRecord.media : [],
		media_counts: mediaRecord?.counts || { images: 0, videos: 0, total: 0 },
		has_real_image: Number(mediaRecord?.counts?.images || 0) > 0,
		has_real_video: Number(mediaRecord?.counts?.videos || 0) > 0,
	})),
}));

vi.mock("../../../src/i18n.js", () => ({
	default: { global: { locale: { value: "en" } } },
}));

// Pass-through: let shopStore's internal normalizeStatusForUi and normalizeCoords run on raw data
vi.mock("../../../src/domain/venue/viewModel", () => ({
	normalizeVenueViewModel: vi.fn((shop) => ({ ...shop })),
	normalizeVenueCollection: vi.fn((rows) => (Array.isArray(rows) ? rows : [])),
}));

vi.mock("../../../src/services/apiClient", () => ({
	apiFetch: mockApiFetch,
	parseApiError: vi.fn(async () => ""),
}));

vi.mock("../../../src/store/featureFlagStore", () => ({
	useFeatureFlagStore: () => ({
		refreshFlags: featureFlagRefreshMock,
		isEnabled: featureFlagIsEnabledMock,
	}),
}));

vi.mock("../../../src/config/featureFlagGovernance", () => ({
	getFlagGovernanceViolations: vi.fn(() => []),
	validateFlagDependencies: vi.fn(() => []),
}));

import { shouldUseLocalVenueSnapshot } from "../../../src/lib/localVenueSnapshot";
import { getRealVenueMedia } from "../../../src/services/shopService";
import { apiFetch } from "../../../src/services/apiClient";
import { useLocationStore } from "../../../src/store/locationStore";
import { useShopStore } from "../../../src/store/shopStore";

// Helper: produce a minimal valid venue for testing filters
const makeShop = (overrides = {}) => ({
	id: String(Math.random()),
	name: "Test Venue",
	category: "Cafe",
	status: "live",
	description: "A test venue",
	lat: 18.7883,
	lng: 98.9853,
	rating: 4.0,
	total_views: 10,
	created_at: new Date().toISOString(),
	...overrides,
});

describe("shopStore", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		venueMaybeSingleMock.mockResolvedValue({ data: null, error: null });
		venueOrderMock.mockResolvedValue({ data: [], error: null });
		supabaseRpcMock.mockResolvedValue({ data: [], error: null });
		mockShouldUseLocalVenueSnapshot.mockReturnValue(false);
		mockGetRealVenueMedia.mockResolvedValue(null);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ─── Initial State ─────────────────────────────────────────────────────
	describe("initial state", () => {
		it("starts with empty rawShops", () => {
			const store = useShopStore();
			expect(store.rawShops).toHaveLength(0);
		});

		it("starts with isLoading = true", () => {
			const store = useShopStore();
			expect(store.isLoading).toBe(true);
		});

		it("activeCategories is empty by default", () => {
			const store = useShopStore();
			expect(store.activeCategories).toHaveLength(0);
		});

		it('activeStatus is "ALL" by default', () => {
			const store = useShopStore();
			expect(store.activeStatus).toBe("ALL");
		});

		it("searchQuery is empty by default", () => {
			const store = useShopStore();
			expect(store.searchQuery).toBe("");
		});

		it("shopCount is 0 initially", () => {
			const store = useShopStore();
			expect(store.shopCount).toBe(0);
		});
	});

	// ─── Filter Actions ────────────────────────────────────────────────────
	describe("setSearch / setCategories / setStatus / clearFilters", () => {
		it("setSearch updates searchQuery", () => {
			const store = useShopStore();
			store.setSearch("nightlife");
			expect(store.searchQuery).toBe("nightlife");
		});

		it("setCategories updates activeCategories", () => {
			const store = useShopStore();
			store.setCategories(["Bar", "Cafe"]);
			expect(store.activeCategories).toEqual(["Bar", "Cafe"]);
		});

		it("setStatus updates activeStatus", () => {
			const store = useShopStore();
			store.setStatus("LIVE");
			expect(store.activeStatus).toBe("LIVE");
		});

		it("clearFilters resets all filter state", () => {
			const store = useShopStore();
			store.setSearch("test");
			store.setCategories(["Bar"]);
			store.setStatus("LIVE");
			store.clearFilters();
			expect(store.searchQuery).toBe("");
			expect(store.activeCategories).toHaveLength(0);
			expect(store.activeStatus).toBe("ALL");
		});
	});

	// ─── filteredShops computed ────────────────────────────────────────────
	describe("filteredShops", () => {
		it("returns all shops when no filter is active", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({
						id: "1",
						name: "Vibe Cafe",
						category: "Cafe",
						status: "live",
					}),
					makeShop({
						id: "2",
						name: "Night Bar",
						category: "Bar",
						status: "live",
					}),
				],
			});
			expect(store.filteredShops).toHaveLength(2);
		});

		it("filters by category", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({
						id: "1",
						name: "Vibe Cafe",
						category: "Cafe",
						status: "live",
					}),
					makeShop({
						id: "2",
						name: "Night Bar",
						category: "Bar",
						status: "live",
					}),
				],
			});
			store.setCategories(["Cafe"]);
			const result = store.filteredShops;
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Vibe Cafe");
		});

		it("filters by status LIVE", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({ id: "1", name: "Open Place", status: "live" }),
					makeShop({ id: "2", name: "Closed Place", status: "off" }),
				],
			});
			store.setStatus("LIVE");
			const result = store.filteredShops;
			expect(result.every((s) => s.status === "LIVE")).toBe(true);
			expect(result.some((s) => s.name === "Open Place")).toBe(true);
			expect(result.some((s) => s.name === "Closed Place")).toBe(false);
		});

		it("filters by search query (name)", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({ id: "1", name: "Vibe Cafe", status: "live" }),
					makeShop({ id: "2", name: "Disco Palace", status: "live" }),
				],
			});
			store.setSearch("vibe");
			const result = store.filteredShops;
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Vibe Cafe");
		});

		it("search is case-insensitive", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [makeShop({ id: "1", name: "Vibe Cafe", status: "live" })],
			});
			store.setSearch("VIBE");
			expect(store.filteredShops).toHaveLength(1);
		});

		it("returns empty array when no shops match search", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [makeShop({ id: "1", name: "Vibe Cafe", status: "live" })],
			});
			store.setSearch("zzznomatch");
			expect(store.filteredShops).toHaveLength(0);
		});

		it("combines category and search filters", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({
						id: "1",
						name: "Vibe Cafe",
						category: "Cafe",
						status: "live",
					}),
					makeShop({
						id: "2",
						name: "Vibe Bar",
						category: "Bar",
						status: "live",
					}),
					makeShop({
						id: "3",
						name: "Night Bar",
						category: "Bar",
						status: "live",
					}),
				],
			});
			store.setCategories(["Bar"]);
			store.setSearch("vibe");
			const result = store.filteredShops;
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("Vibe Bar");
		});
	});

	describe("authoritative media gating", () => {
		it("keeps only venues with both real images and real videos on public lanes", () => {
			const store = useShopStore();
			store.setShops([
				makeShop({
					id: "complete",
					media_counts: { images: 2, videos: 1, total: 3 },
					has_real_image: true,
					has_real_video: true,
				}),
				makeShop({
					id: "image-only",
					media_counts: { images: 2, videos: 0, total: 2 },
					has_real_image: true,
					has_real_video: false,
				}),
				makeShop({
					id: "video-only",
					media_counts: { images: 0, videos: 1, total: 1 },
					has_real_image: false,
					has_real_video: true,
				}),
			]);

			expect(store.rawShops.map((shop) => shop.id)).toEqual(["complete"]);
		});

		it("keeps localhost snapshot rows available even when complete media is missing", () => {
			mockShouldUseLocalVenueSnapshot.mockReturnValueOnce(true);
			const store = useShopStore();
			store.setShops([
				makeShop({
					id: "snapshot-row",
					media_counts: { images: 0, videos: 0, total: 0 },
					has_real_image: false,
					has_real_video: false,
				}),
			]);

			expect(store.rawShops.map((shop) => shop.id)).toEqual(["snapshot-row"]);
		});

		it("fails closed on venue detail when the media API lacks complete coverage", async () => {
			venueMaybeSingleMock.mockResolvedValueOnce({
				data: makeShop({ id: "detail-1", slug: "detail-1" }),
				error: null,
			});
			mockGetRealVenueMedia.mockResolvedValueOnce({
				shopId: "detail-1",
				counts: { images: 1, videos: 0, total: 1 },
				coverage: { has_complete_media: false },
				images: ["https://cdn.example.com/detail-1.jpg"],
				videos: [],
				videoUrl: "",
				media: [
					{
						type: "image",
						url: "https://cdn.example.com/detail-1.jpg",
						source: "venues.image_urls",
					},
				],
			});

			const store = useShopStore();
			const result = await store.fetchVenueDetail("detail-1");

			expect(result).toBeNull();
		});
	});

	// ─── categories computed ───────────────────────────────────────────────
	describe("categories", () => {
		it("returns empty array when no shops", () => {
			const store = useShopStore();
			expect(store.categories).toHaveLength(0);
		});

		it("extracts unique categories from rawShops", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({ id: "1", category: "Cafe" }),
					makeShop({ id: "2", category: "Bar" }),
					makeShop({ id: "3", category: "Cafe" }),
				],
			});
			const catNames = store.categories.map((c) => c.name);
			expect(catNames).toContain("Cafe");
			expect(catNames).toContain("Bar");
			expect(store.categories).toHaveLength(2);
		});

		it("counts venues per category", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({ id: "1", category: "Cafe" }),
					makeShop({ id: "2", category: "Cafe" }),
					makeShop({ id: "3", category: "Bar" }),
				],
			});
			const cafe = store.categories.find((c) => c.name === "Cafe");
			expect(cafe?.count).toBe(2);
		});

		it("sorts categories by count descending", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [
					makeShop({ id: "1", category: "Bar" }),
					makeShop({ id: "2", category: "Cafe" }),
					makeShop({ id: "3", category: "Cafe" }),
				],
			});
			expect(store.categories[0].name).toBe("Cafe"); // 2 count first
			expect(store.categories[1].name).toBe("Bar"); // 1 count second
		});
	});

	// ─── setActiveShop / activeShop ───────────────────────────────────────
	describe("setActiveShop / activeShop", () => {
		it("activeShop is null with no selection", () => {
			const store = useShopStore();
			expect(store.activeShop).toBeNull();
		});

		it("setActiveShop(null) clears active shop", () => {
			const store = useShopStore();
			store.setActiveShop("shop-1");
			store.setActiveShop(null);
			expect(store.activeShopId).toBeNull();
		});
	});

	describe("default nearby selection", () => {
		it("keeps nearby venues first and fills the remaining slots with the nearest overflow", () => {
			const baseLat = 18.7883;
			const baseLng = 98.9853;
			const locationStore = useLocationStore();
			locationStore.setUserLocation([baseLat, baseLng]);
			const store = useShopStore();
			const nearbyShops = Array.from({ length: 12 }, (_, index) =>
				makeShop({
					id: `nearby-${index + 1}`,
					name: `Nearby ${index + 1}`,
					lat: baseLat + index * 0.003,
					lng: baseLng + (index % 3) * 0.002,
				}),
			);
			const overflowShops = Array.from({ length: 28 }, (_, index) =>
				makeShop({
					id: `overflow-${index + 1}`,
					name: `Overflow ${index + 1}`,
					lat: baseLat + 0.22 + index * 0.01,
					lng: baseLng + 0.18,
				}),
			);

			store.$patch({
				rawShops: [...nearbyShops, ...overflowShops],
			});

			const visibleIds = store.visibleShops.map((shop) => shop.id);
			expect(visibleIds).toHaveLength(30);
			expect(visibleIds.slice(0, 12)).toEqual(
				nearbyShops.map((shop) => shop.id),
			);
			expect(
				visibleIds.slice(12).every((id) => id.startsWith("overflow-")),
			).toBe(true);
			expect(store.visibleShops[11].distance).toBeLessThanOrEqual(20);
			expect(store.visibleShops[12].distance).toBeGreaterThan(20);
			expect(
				store.visibleShops.every((shop, index, list) =>
					index === 0
						? true
						: Number(shop.distance) >= Number(list[index - 1].distance),
				),
			).toBe(true);
		});

		it("falls back to the broader venue query when V2 feed returns no venues inside 20km", async () => {
			const baseLat = 18.7883;
			const baseLng = 98.9853;
			const locationStore = useLocationStore();
			locationStore.setUserLocation([baseLat, baseLng], false);
			const store = useShopStore();
			const toMediaVenue = (id, lat, lng) =>
				makeShop({
					id,
					lat,
					lng,
					image_urls: [`https://cdn.example.com/${id}.jpg`],
					video_url: `https://cdn.example.com/${id}.mp4`,
				});
			const toV2Row = (shop) => ({
				id: shop.id,
				name: shop.name,
				slug: shop.slug,
				category: shop.category,
				status: shop.status,
				rating: shop.rating,
				view_count: shop.total_views,
				image_url: shop.image_urls?.[0] || "",
				video_url: shop.video_url,
				latitude: shop.lat,
				longitude: shop.lng,
				pin_type: "normal",
				pin_metadata: {},
				verified_active: false,
				glow_active: false,
				boost_active: false,
				giant_active: false,
				visibility_score: 0,
			});
			const farV2Rows = Array.from({ length: 30 }, (_, index) =>
				toMediaVenue(
					`far-v2-${index + 1}`,
					baseLat + 0.24 + index * 0.004,
					baseLng + 0.18,
				),
			);
			const nearbyStandardRows = Array.from({ length: 6 }, (_, index) =>
				toMediaVenue(
					`nearby-standard-${index + 1}`,
					baseLat + 0.01 + index * 0.004,
					baseLng + (index % 2) * 0.003,
				),
			);
			const overflowStandardRows = Array.from({ length: 30 }, (_, index) =>
				toMediaVenue(
					`overflow-standard-${index + 1}`,
					baseLat + 0.25 + index * 0.004,
					baseLng + 0.21,
				),
			);

			supabaseRpcMock.mockResolvedValueOnce({
				data: farV2Rows.map(toV2Row),
				error: null,
			});
			venueOrderMock.mockResolvedValueOnce({
				data: [...nearbyStandardRows, ...overflowStandardRows],
				error: null,
			});

			await store.fetchShops(true);

			expect(venueOrderMock).toHaveBeenCalledTimes(1);
			expect(store.visibleShops).toHaveLength(30);
			expect(store.visibleShops[0].id).toBe("nearby-standard-1");
			expect(store.visibleShops[0].distance).toBeLessThan(20);
			expect(
				store.visibleShops
					.slice(0, nearbyStandardRows.length)
					.every((shop) => shop.id.startsWith("nearby-standard-")),
			).toBe(true);
		});
	});

	// ─── shopCount ─────────────────────────────────────────────────────────
	describe("shopCount", () => {
		it("reflects rawShops length", () => {
			const store = useShopStore();
			store.$patch({
				rawShops: [makeShop({ id: "1" }), makeShop({ id: "2" })],
			});
			expect(store.shopCount).toBe(2);
		});
	});

	// ─── Integration Tests: Emoji Reactions & Reviews ──────────────────────
	describe("emoji reactions and reviews integration", () => {
		it("submits a reaction via apiFetch with correct headers and structure", async () => {
			const store = useShopStore();
			const shopId = "test-shop-123";
			const reviewData = {
				rating: null,
				comment: "Reaction: 😍 love",
				userName: "Vibe Explorer",
			};

			mockApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: "new-rev-id", ...reviewData }),
			});

			const result = await store.addReview(shopId, reviewData);

			expect(result.success).toBe(true);
			expect(mockApiFetch).toHaveBeenCalledWith(
				`/shops/${shopId}/reviews`,
				expect.objectContaining({
					method: "POST",
					includeVisitor: true,
					body: expect.objectContaining({
						comment: reviewData.comment,
						userName: reviewData.userName,
					}),
				}),
			);
			expect(store.reviews[shopId][0].id).toBe("new-rev-id");
		});

		it("falls back to direct Supabase insert when reviews API is disabled", async () => {
			const store = useShopStore();
			const shopId = "test-shop-456";
			const reviewData = {
				rating: 5,
				comment: "Great place!",
				userName: "Test User",
			};

			// mockApiFetch will fail with 404 to trigger fallback
			mockApiFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
			});

			const insertMock = vi.fn(() => ({
				select: vi.fn(() => ({
					single: vi.fn(async () => ({
						data: { id: "sb-rev-id", ...reviewData },
						error: null,
					})),
				})),
			}));
			supabaseFromMock.mockReturnValueOnce({ insert: insertMock });

			const result = await store.addReview(shopId, reviewData);

			expect(result.success).toBe(true);
			expect(insertMock).toHaveBeenCalledWith(
				expect.objectContaining({
					venue_id: shopId,
					comment: reviewData.comment,
					user_name: reviewData.userName,
				}),
			);
			expect(store.reviews[shopId][0].id).toBe("sb-rev-id");
		});
	});
});
