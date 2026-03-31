import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.fn();

vi.mock("../../src/i18n.js", () => ({
	default: { global: { t: (key) => key } },
}));

vi.mock("../../src/lib/supabase", () => ({
	isSupabaseSchemaCacheError: vi.fn(() => false),
	supabase: {
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(),
				order: vi.fn(),
			})),
		})),
	},
}));

vi.mock("../../src/utils/debugFlags", () => ({
	isAppDebugLoggingEnabled: vi.fn(() => false),
}));

vi.mock("../../src/utils/networkErrorUtils", () => ({
	isExpectedAbortError: vi.fn(() => false),
	logUnexpectedNetworkError: vi.fn(),
}));

vi.mock("../../src/utils/supabaseReadPolicy", () => ({
	isSoftSupabaseReadError: vi.fn(() => false),
	logUnexpectedSupabaseReadError: vi.fn(),
	runSupabaseReadPolicy: vi.fn(async ({ run }) => run()),
}));

vi.mock("../../src/services/apiClient", () => ({
	apiFetch: apiFetchMock,
}));

const buildStaticMediaPayload = () => ({
	rows: [
		{
			shop_id: "venue-1",
			name: "Venue 1",
			images: ["https://cdn.example.com/venue-1.jpg"],
			videos: ["https://cdn.example.com/venue-1.mp4"],
			video_url: "https://cdn.example.com/venue-1.mp4",
			media: [
				{
					type: "image",
					url: "https://cdn.example.com/venue-1.jpg",
					source: "venues.image_urls",
				},
				{
					type: "video",
					url: "https://cdn.example.com/venue-1.mp4",
					source: "venues.video_url",
				},
			],
			counts: {
				images: 1,
				videos: 1,
				total: 2,
			},
			coverage: {
				has_images: true,
				has_videos: true,
				has_media: true,
				has_complete_media: true,
			},
			social_links: {},
		},
	],
});

describe("shopService real media fallback", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		window.history.replaceState({}, "", "http://localhost:3000/");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("falls back to the generated static media index when the API route returns 422", async () => {
		vi.stubEnv("VITE_API_PROXY_DEV", "true");

		apiFetchMock.mockResolvedValue({
			ok: false,
			status: 422,
			json: async () => ({
				detail: [
					{
						loc: ["path", "shop_id"],
						msg: "Input should be a valid integer",
					},
				],
			}),
		});

		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify(buildStaticMediaPayload()), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
					},
				}),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const { getRealVenueMedia, getRealVenueMediaIndex } = await import(
			"../../src/services/shopService.js"
		);

		const index = await getRealVenueMediaIndex({ force: true });
		const media = await getRealVenueMedia("venue-1");

		expect(index.get("venue-1")).toMatchObject({
			shopId: "venue-1",
			images: ["https://cdn.example.com/venue-1.jpg"],
			videos: ["https://cdn.example.com/venue-1.mp4"],
		});
		expect(media).toMatchObject({
			shopId: "venue-1",
			videoUrl: "https://cdn.example.com/venue-1.mp4",
			counts: { images: 1, videos: 1, total: 2 },
		});
		expect(apiFetchMock).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(
			"/data/venues-real-media-index.json",
			expect.objectContaining({
				cache: "no-store",
				headers: expect.objectContaining({
					Accept: "application/json",
				}),
			}),
		);
	});

	it("prefers the static media index immediately on frontend-only dev hosts", async () => {
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify(buildStaticMediaPayload()), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
					},
				}),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const { getRealVenueMediaIndex } = await import(
			"../../src/services/shopService.js"
		);

		const index = await getRealVenueMediaIndex({ force: true });

		expect(index.get("venue-1")).toMatchObject({
			shopId: "venue-1",
		});
		expect(apiFetchMock).not.toHaveBeenCalled();
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(
			"/data/venues-real-media-index.json",
			expect.objectContaining({
				cache: "no-store",
				headers: expect.objectContaining({
					Accept: "application/json",
				}),
			}),
		);
	});
});
