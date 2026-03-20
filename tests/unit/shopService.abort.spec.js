import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfigState = vi.hoisted(() => ({
	frontendOnlyDev: false,
}));

vi.mock("@/i18n.js", () => ({
	default: {
		global: {
			t: (key) => key,
		},
	},
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test",
	isFrontendOnlyDevMode: () => runtimeConfigState.frontendOnlyDev,
}));

vi.mock("../../src/lib/supabase", () => ({
	isSupabaseSchemaCacheError: () => false,
	supabase: {
		from: vi.fn(),
		rpc: vi.fn(),
	},
}));

import { getRealVenueMedia } from "../../src/services/shopService";

describe("shopService abort handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		runtimeConfigState.frontendOnlyDev = false;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("suppresses expected abort errors for real venue media fetches", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const abortError = new DOMException(
			"The operation was aborted.",
			"AbortError",
		);

		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(abortError)),
		);

		await expect(getRealVenueMedia(123)).resolves.toBeNull();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("logs unexpected media fetch failures", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const networkError = new TypeError("Failed to fetch");

		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.reject(networkError)),
		);

		await expect(getRealVenueMedia(456)).resolves.toBeNull();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error fetching real venue media:",
			networkError,
		);
	});

	it("normalizes legacy object payloads into media items", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve({
					ok: true,
					json: async () => ({
						video_url: "https://cdn.test/video.mp4",
						images: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
						source: "legacy-object",
					}),
				}),
			),
		);

		await expect(getRealVenueMedia("venue-1")).resolves.toEqual([
			{
				type: "video",
				url: "https://cdn.test/video.mp4",
				source: "legacy-object",
			},
			{
				type: "image",
				url: "https://cdn.test/a.jpg",
				source: "legacy-object",
			},
			{
				type: "image",
				url: "https://cdn.test/b.jpg",
				source: "legacy-object",
			},
		]);
	});

	it("skips backend media fetching in frontend-only dev mode", async () => {
		runtimeConfigState.frontendOnlyDev = true;
		vi.stubGlobal("fetch", vi.fn());

		await expect(getRealVenueMedia("venue-dev")).resolves.toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("marks the media endpoint unavailable after a 404 response", async () => {
		const fetchSpy = vi.fn().mockResolvedValueOnce({
			ok: false,
			status: 404,
		});

		vi.stubGlobal("fetch", fetchSpy);

		await expect(getRealVenueMedia("venue-404")).resolves.toBeNull();
		await expect(getRealVenueMedia("venue-404")).resolves.toBeNull();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
