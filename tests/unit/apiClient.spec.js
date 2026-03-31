import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test",
	isLocalBrowserHostname: (hostname) =>
		/^(localhost|127\.0\.0\.1)$/i.test(String(hostname || "")),
}));

vi.mock("../../src/services/visitorIdentity", () => ({
	bootstrapVisitor: vi.fn(async () => {}),
	getOrCreateVisitorId: vi.fn(() => "visitor-123"),
	getVisitorToken: vi.fn(() => "token-abc"),
	isVisitorTokenExpired: vi.fn(() => false),
}));

import {
	ApiClientError,
	apiFetch,
	isAbortLikeApiError,
	isRetriableApiError,
	parseApiError,
} from "../../src/services/apiClient";
import * as visitorIdentity from "../../src/services/visitorIdentity";

describe("apiClient", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("injects visitor headers and JSON body", async () => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		await apiFetch("/ping", {
			method: "POST",
			body: { ok: true },
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://api.test/ping",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ ok: true }),
				headers: expect.objectContaining({
					"Content-Type": "application/json",
					"X-Visitor-Id": "visitor-123",
					"X-Visitor-Token": "token-abc",
				}),
			}),
		);
	});

	it("refreshes visitor token when requested and expired", async () => {
		visitorIdentity.getVisitorToken
			.mockReturnValueOnce("expired-token")
			.mockReturnValueOnce("expired-token")
			.mockReturnValueOnce("fresh-token");
		visitorIdentity.isVisitorTokenExpired.mockReturnValue(true);

		const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		await apiFetch("/secure", { refreshVisitorTokenIfNeeded: true });

		expect(visitorIdentity.bootstrapVisitor).toHaveBeenCalledWith({
			forceRefresh: true,
		});
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://api.test/secure",
			expect.objectContaining({
				headers: expect.objectContaining({
					"X-Visitor-Token": "fresh-token",
				}),
			}),
		);
	});

	it("wraps timeout abort as retriable ApiClientError", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((_url, init) => {
				return new Promise((_resolve, reject) => {
					init.signal.addEventListener("abort", () => {
						reject(new DOMException("Request timed out", "TimeoutError"));
					});
				});
			}),
		);

		await expect(apiFetch("/slow", { timeoutMs: 10 })).rejects.toMatchObject({
			code: "API_TIMEOUT",
			timeout: true,
			retriable: true,
			path: "/slow",
		});
	});

	it("marks wrapped abort causes as non-retriable", () => {
		const abortCause = new DOMException(
			"The operation was aborted.",
			"AbortError",
		);
		const error = new ApiClientError("Request aborted", {
			cause: abortCause,
			path: "/abort",
		});

		expect(isAbortLikeApiError(error)).toBe(true);
		expect(isRetriableApiError(error)).toBe(false);
	});

	it("parses ApiClientError and response error payloads", async () => {
		const direct = new ApiClientError("network down", { status: 503 });
		expect(await parseApiError(direct, "fallback")).toBe("network down");
		expect(isRetriableApiError(direct)).toBe(true);

		const response = new Response(JSON.stringify({ detail: "bad request" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
		expect(await parseApiError(response, "fallback")).toBe("bad request");
		expect(isRetriableApiError({ status: 400 })).toBe(false);
	});

	it("falls back to the direct API base when dev proxy mode is enabled", async () => {
		vi.stubEnv("VITE_API_PROXY_DEV", "true");
		const fetchSpy = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));

		vi.stubGlobal("fetch", fetchSpy);

		await apiFetch("/media/test-venue/real");

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(fetchSpy).toHaveBeenNthCalledWith(
			1,
			"http://localhost:3000/api/v1/media/test-venue/real",
			expect.any(Object),
		);
		expect(fetchSpy).toHaveBeenNthCalledWith(
			2,
			"https://api.test/media/test-venue/real",
			expect.any(Object),
		);
	});
});
