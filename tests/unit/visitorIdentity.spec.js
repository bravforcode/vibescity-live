import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockApiRequest } = vi.hoisted(() => ({
	mockApiRequest: vi.fn(),
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test/api/v1",
}));

vi.mock("../../src/services/apiService", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		request: mockApiRequest,
	};
});

import {
	isRuntimeLaneUnavailable,
	RUNTIME_LANES,
} from "../../src/lib/runtimeLaneAvailability";
import {
	bootstrapVisitor,
	getVisitorToken,
} from "../../src/services/visitorIdentity";

describe("visitorIdentity", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		vi.clearAllMocks();
		mockApiRequest.mockReset();
		localStorage.setItem(
			"vibe_visitor_id",
			"11111111-1111-4111-8111-111111111111",
		);
	});

	it("cools down bootstrap retries after the live backend reports the endpoint missing", async () => {
		const missingEndpointError = Object.assign(
			new Error("Not Found"),
			{
				response: {
					status: 404,
					data: { detail: "Not Found" },
				},
			},
		);
		mockApiRequest.mockRejectedValue(missingEndpointError);

		const first = await bootstrapVisitor();

		expect(mockApiRequest).toHaveBeenCalledTimes(2);
		expect(first.visitorId).toBe("11111111-1111-4111-8111-111111111111");
		expect(first.visitorToken).toMatch(/\.legacy$/);
		expect(getVisitorToken()).toBe(first.visitorToken);
		expect(isRuntimeLaneUnavailable(RUNTIME_LANES.visitorBootstrap)).toBe(true);

		const second = await bootstrapVisitor({ forceRefresh: true });

		expect(mockApiRequest).toHaveBeenCalledTimes(2);
		expect(second.visitorToken).toMatch(/\.legacy$/);
	});
});
