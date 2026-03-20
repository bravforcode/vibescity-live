import { describe, expect, it } from "vitest";

import {
	API_VERSION_CONTRACT,
	unwrapApiEnvelope,
} from "../../src/services/api/dashboardApiAdapter";
import { parseApiJson } from "../../src/services/apiClient";

describe("dashboard API envelope contract", () => {
	it("wraps legacy raw payload into envelope shape", () => {
		const payload = { hello: "world" };
		const wrapped = unwrapApiEnvelope(payload);

		expect(wrapped.data).toEqual(payload);
		expect(wrapped.meta.version).toBe(API_VERSION_CONTRACT.version);
		expect(Array.isArray(wrapped.errors)).toBe(true);
	});

	it("preserves server envelope metadata", () => {
		const payload = {
			data: { ok: true },
			meta: {
				version: "v2",
				requestId: "req-1",
				timestamp: "2026-03-06T12:00:00Z",
			},
			errors: [],
		};

		const wrapped = unwrapApiEnvelope(payload);
		expect(wrapped.data).toEqual({ ok: true });
		expect(wrapped.meta.version).toBe("v2");
		expect(wrapped.meta.requestId).toBe("req-1");
	});

	it("parseApiJson returns envelope for successful raw response", async () => {
		const response = new Response(JSON.stringify({ foo: "bar" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});

		const parsed = await parseApiJson(response, "failed");
		expect(parsed.data).toEqual({ foo: "bar" });
		expect(parsed.meta.version).toBe(API_VERSION_CONTRACT.version);
	});

	it("parseApiJson throws with envelope error message", async () => {
		const response = new Response(
			JSON.stringify({
				data: { detail: "invalid payload" },
				meta: {
					version: "v1",
					requestId: "req-2",
					timestamp: "2026-03-06T12:00:00Z",
				},
				errors: [{ code: "API_ERROR", message: "invalid payload" }],
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);

		await expect(parseApiJson(response, "failed")).rejects.toThrow(
			"invalid payload",
		);
	});
});
