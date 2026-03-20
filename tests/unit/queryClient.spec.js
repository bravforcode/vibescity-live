import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../src/services/apiClient";
import { vueQueryOptions } from "../../src/plugins/queryClient";

const retryFn = vueQueryOptions.queryClient.getDefaultOptions().queries.retry;

describe("query retry policy", () => {
	it("does not retry wrapped abort errors", () => {
		const wrappedAbort = new ApiClientError("The operation was aborted.", {
			code: "API_NETWORK_ERROR",
			status: 0,
			cause: new DOMException("The operation was aborted.", "AbortError"),
		});

		expect(retryFn(0, wrappedAbort)).toBe(false);
	});

	it("retries timeout errors", () => {
		const timeoutError = new ApiClientError("Request timeout after 8000ms", {
			code: "API_TIMEOUT",
			status: 0,
			timeout: true,
		});

		expect(retryFn(0, timeoutError)).toBe(true);
	});
});
