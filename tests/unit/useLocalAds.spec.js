import { reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let locationStore;
const { getByLocation, isSupabaseSchemaCacheError } = vi.hoisted(() => ({
	getByLocation: vi.fn(),
	isSupabaseSchemaCacheError: vi.fn((error) =>
		String(error?.message || "").toLowerCase().includes("schema cache"),
	),
}));

vi.mock("../../src/store/locationStore", () => ({
	useLocationStore: () => locationStore,
}));

vi.mock("../../src/services/localAdService", () => ({
	localAdService: {
		getByLocation,
	},
}));

vi.mock("../../src/lib/supabase", () => ({
	isSupabaseSchemaCacheError,
}));

import { useLocalAds } from "../../src/composables/useLocalAds";

const flushPromises = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe("useLocalAds", () => {
	beforeEach(() => {
		locationStore = reactive({ locationObject: null });
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps previous ads when a transient fetch failure occurs", async () => {
		getByLocation
			.mockResolvedValueOnce([{ id: "ad-1", title: "First ad" }])
			.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const { ads, cleanup, error, fetchAds } = useLocalAds();

		locationStore.locationObject = { lat: 18.79, lng: 98.98 };
		await flushPromises();
		expect(ads.value).toEqual([{ id: "ad-1", title: "First ad" }]);

		await fetchAds();
		expect(ads.value).toEqual([{ id: "ad-1", title: "First ad" }]);
		expect(error.value).toBeNull();

		cleanup();
	});

	it("ignores stale ad responses after a newer request wins", async () => {
		let resolveFirst;
		getByLocation
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce([{ id: "ad-2", title: "Fresh ad" }]);

		const { ads, cleanup, fetchAds } = useLocalAds();

		locationStore.locationObject = { lat: 18.79, lng: 98.98 };
		await flushPromises();

		await fetchAds();
		expect(ads.value).toEqual([{ id: "ad-2", title: "Fresh ad" }]);

		resolveFirst([{ id: "ad-1", title: "Stale ad" }]);
		await flushPromises();
		expect(ads.value).toEqual([{ id: "ad-2", title: "Fresh ad" }]);

		cleanup();
	});
});
