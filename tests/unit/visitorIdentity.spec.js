import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test/api/v1",
}));

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
		localStorage.setItem(
			"vibe_visitor_id",
			"11111111-1111-4111-8111-111111111111",
		);
	});

	it("cools down bootstrap retries after the live backend reports the endpoint missing", async () => {
		const fetchSpy = vi.fn(
			async () =>
				new Response(JSON.stringify({ detail: "Not Found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				}),
		);
		vi.stubGlobal("fetch", fetchSpy);

		const first = await bootstrapVisitor();

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(first.visitorId).toBe("11111111-1111-4111-8111-111111111111");
		expect(first.visitorToken).toMatch(/\.legacy$/);
		expect(getVisitorToken()).toBe(first.visitorToken);
		expect(isRuntimeLaneUnavailable(RUNTIME_LANES.visitorBootstrap)).toBe(true);

		const second = await bootstrapVisitor({ forceRefresh: true });

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(second.visitorToken).toMatch(/\.legacy$/);
	});
});
