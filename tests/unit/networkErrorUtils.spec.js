import { afterEach, describe, expect, it, vi } from "vitest";

import {
	isAbortLikeError,
	isExpectedAbortError,
	isTransientNetworkError,
	logUnexpectedNetworkError,
} from "../../src/utils/networkErrorUtils";

describe("networkErrorUtils", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("detects direct abort-like errors", () => {
		const error = new DOMException("The operation was aborted.", "AbortError");

		expect(isAbortLikeError(error)).toBe(true);
		expect(isExpectedAbortError(error)).toBe(true);
	});

	it("detects abort-like errors wrapped in cause chains", () => {
		const error = new Error("query cancelled", {
			cause: new DOMException("The operation was aborted.", "AbortError"),
		});

		expect(isAbortLikeError(error)).toBe(true);
		expect(isExpectedAbortError(error)).toBe(true);
	});

	it("treats signal-aborted NetworkError as expected", () => {
		const controller = new AbortController();
		controller.abort();
		const error = new Error("Network request cancelled");
		error.name = "NetworkError";

		expect(isAbortLikeError(error)).toBe(false);
		expect(isExpectedAbortError(error, { signal: controller.signal })).toBe(
			true,
		);
	});

	it("keeps generic network failures actionable", () => {
		const error = new TypeError("Failed to fetch");

		expect(isAbortLikeError(error)).toBe(false);
		expect(isExpectedAbortError(error)).toBe(false);
		expect(isTransientNetworkError(error)).toBe(true);
	});

	it("detects transient service and schema-cache failures", () => {
		expect(
			isTransientNetworkError({
				status: 503,
				message: "Service unavailable",
			}),
		).toBe(true);
		expect(
			isTransientNetworkError({
				code: "PGRST002",
				message: "Schema cache is currently unavailable",
			}),
		).toBe(true);
	});

	it("suppresses logging for expected aborts only", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const abortError = new DOMException(
			"The operation was aborted.",
			"AbortError",
		);
		const networkError = new TypeError("Failed to fetch");

		expect(
			logUnexpectedNetworkError("Expected abort should stay quiet", abortError),
		).toBe(false);
		expect(errorSpy).not.toHaveBeenCalled();

		expect(logUnexpectedNetworkError("Unexpected network failure", networkError)).toBe(
			true,
		);
		expect(errorSpy).toHaveBeenCalledWith(
			"Unexpected network failure",
			networkError,
		);
	});
});
