import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/i18n.js", () => ({
	default: {
		global: {
			t: (key) => key,
		},
	},
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test",
}));

import { useTransportLogic } from "../../src/composables/useTransportLogic";

const location = [18.799, 98.968];
const firstShop = { lat: 18.793, lng: 98.973 };
const secondShop = { lat: 18.801, lng: 98.981 };

const createJsonResponse = (payload) =>
	new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

const waitForMicrotasks = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe("useTransportLogic", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("keeps the latest ride estimates when an older request is replaced", async () => {
		const latestProviders = [
			{
				name: "NewRide",
				service: "Express",
				price: 210,
				currency: "THB",
				eta_mins: 3,
				icon: "🚕",
			},
		];
		const fetchSpy = vi
			.fn()
			.mockImplementationOnce((_url, init) =>
				new Promise((_resolve, reject) => {
					init.signal.addEventListener("abort", () => {
						reject(
							new DOMException("The operation was aborted.", "AbortError"),
						);
					});
				}),
			)
			.mockResolvedValueOnce(createJsonResponse({ providers: latestProviders }));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		vi.stubGlobal("fetch", fetchSpy);

		const { estimates, fetchRideEstimates, isLoading } = useTransportLogic();

		const firstRequest = fetchRideEstimates(firstShop, location);
		await waitForMicrotasks();
		await fetchRideEstimates(secondShop, location);
		await firstRequest;

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(estimates.value).toEqual(latestProviders);
		expect(isLoading.value).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("falls back silently when the ride estimate request times out", async () => {
		vi.useFakeTimers();
		const fetchSpy = vi.fn((_url, init) =>
			new Promise((_resolve, reject) => {
				init.signal.addEventListener("abort", () => {
					reject(
						new DOMException("The operation was aborted.", "AbortError"),
					);
				});
			}),
		);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		vi.stubGlobal("fetch", fetchSpy);

		const { error, estimates, fetchRideEstimates, isLoading } =
			useTransportLogic();

		const request = fetchRideEstimates(firstShop, location);
		await vi.advanceTimersByTimeAsync(4500);
		await request;

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(estimates.value).toHaveLength(3);
		expect(error.value).toBeNull();
		expect(isLoading.value).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
