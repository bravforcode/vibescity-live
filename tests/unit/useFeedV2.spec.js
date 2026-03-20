import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isSupabaseSchemaCacheError, supabaseRpc } = vi.hoisted(() => ({
	supabaseRpc: vi.fn(),
	isSupabaseSchemaCacheError: vi.fn(() => false),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		rpc: supabaseRpc,
	},
	isSupabaseSchemaCacheError,
}));

vi.mock("../../src/store/locationStore", () => ({
	useLocationStore: () => ({
		userLocation: null,
	}),
}));

import { fetchFeedPage } from "../../src/composables/useFeedV2";

describe("useFeedV2", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("returns an empty feed when the RPC is missing", async () => {
		supabaseRpc.mockResolvedValue({
			data: null,
			error: { code: "PGRST202", message: "function not found" },
		});

		await expect(fetchFeedPage({ lat: 18.79, lng: 98.98 })).resolves.toEqual(
			[],
		);
		expect(supabaseRpc).toHaveBeenCalledTimes(1);
	});

	it("retries transient failures and recovers when the next attempt succeeds", async () => {
		vi.useFakeTimers();
		supabaseRpc
			.mockResolvedValueOnce({
				data: null,
				error: { status: 503, message: "Service unavailable" },
			})
			.mockResolvedValueOnce({
				data: [{ id: "feed-1", name: "Recovered" }],
				error: null,
			});

		const request = fetchFeedPage({ lat: 18.79, lng: 98.98 });
		await vi.runAllTimersAsync();

		await expect(request).resolves.toEqual([
			{ id: "feed-1", name: "Recovered" },
		]);
		expect(supabaseRpc).toHaveBeenCalledTimes(2);
	});
});
