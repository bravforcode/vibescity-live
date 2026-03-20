import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("../../src/services/apiClient", () => ({
	apiFetch: vi.fn(),
}));

import { useMapNavigation } from "../../src/composables/map/useMapNavigation";
import { apiFetch } from "../../src/services/apiClient";

const createJsonResponse = (payload) =>
	new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});

describe("useMapNavigation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps the latest route when a previous request is aborted", async () => {
		const setData = vi.fn();
		apiFetch
			.mockImplementationOnce((_url, { signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						reject(
							new DOMException("The operation was aborted.", "AbortError"),
						);
					});
				}),
			)
			.mockResolvedValueOnce(
				createJsonResponse({
					routes: [
						{
							distance: 321,
							duration: 123,
							geometry: {
								type: "LineString",
								coordinates: [
									[98.968, 18.799],
									[98.981, 18.801],
								],
							},
						},
					],
				}),
			);

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const map = ref({
			getSource: vi.fn(() => ({ setData })),
		});

		const { fetchRoute, roadDistance, roadDuration } = useMapNavigation(map);

		const firstRequest = fetchRoute([18.799, 98.968], [18.793, 98.973], "old");
		await Promise.resolve();
		await fetchRoute([18.799, 98.968], [18.801, 98.981], "latest");
		await firstRequest;

		expect(apiFetch).toHaveBeenCalledTimes(2);
		expect(roadDistance.value).toBe(321);
		expect(roadDuration.value).toBe(123);
		expect(setData).toHaveBeenCalledWith({
			type: "Feature",
			geometry: {
				type: "LineString",
				coordinates: [
					[98.968, 18.799],
					[98.981, 18.801],
				],
			},
		});
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
