import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeConfigState = vi.hoisted(() => ({
	v1Base: "http://localhost:5173/api/v1",
	directBase: "https://api.vibecity.live/api",
}));

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => runtimeConfigState.v1Base,
	getDirectApiBaseUrl: () => runtimeConfigState.directBase,
}));

const loadVisitorIdentity = async () =>
	import("../../src/services/visitorIdentity");

describe("visitorIdentity bootstrap fallbacks", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
		localStorage.clear();
		localStorage.setItem(
			"vibe_visitor_id",
			"11111111-1111-4111-8111-111111111111",
		);
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("uses a local fallback token in dev when visitor bootstrap is disabled", async () => {
		vi.stubGlobal("fetch", vi.fn());
		const { bootstrapVisitor, getVisitorToken } = await loadVisitorIdentity();

		const result = await bootstrapVisitor();

		expect(result.visitorToken).toContain(".legacy");
		expect(getVisitorToken()).toBe(result.visitorToken);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("falls back from local proxy visitor bootstrap to direct API bootstrap when explicitly enabled", async () => {
		vi.stubEnv("VITE_VISITOR_BOOTSTRAP_DEV", "true");
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					json: async () => ({ detail: "proxy missing" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
					json: async () => ({ detail: "proxy missing" }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						visitor_token: "direct-token",
						expires_at: 1234567890,
					}),
				}),
		);
		const { bootstrapVisitor, getVisitorToken } = await loadVisitorIdentity();

		const result = await bootstrapVisitor();

		expect(result.visitorToken).toBe("direct-token");
		expect(getVisitorToken()).toBe("direct-token");
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(fetch).toHaveBeenNthCalledWith(
			1,
			"http://localhost:5173/api/visitor/bootstrap",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetch).toHaveBeenNthCalledWith(
			2,
			"http://localhost:5173/api/v1/visitor/bootstrap",
			expect.objectContaining({ method: "POST" }),
		);
		expect(fetch).toHaveBeenNthCalledWith(
			3,
			"https://api.vibecity.live/api/visitor/bootstrap",
			expect.objectContaining({ method: "POST" }),
		);
	});
});
