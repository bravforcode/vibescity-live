import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
	getSession: vi.fn(),
}));

vi.mock("../../src/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: (...args) => mockState.getSession(...args),
		},
	},
}));

import {
	getAdminAuthHeaders,
	requestAdminJson,
} from "../../src/services/adminRequestPolicy";

describe("adminRequestPolicy", () => {
	beforeEach(() => {
		mockState.getSession.mockReset();
		mockState.getSession.mockResolvedValue({
			data: {
				session: {
					access_token: "token-123",
				},
			},
		});
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("retries transient admin HTTP failures before succeeding", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 503,
					json: async () => ({ message: "Service unavailable" }),
					text: async () => "Service unavailable",
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				}),
		);

		const result = await requestAdminJson({
			url: "https://admin.test/dashboard",
			fallbackMessage: "Failed to fetch dashboard",
		});

		expect(result).toEqual({ success: true });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("applies unauthorized override messaging for protected admin flows", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: async () => ({ message: "Unauthorized" }),
				text: async () => "Unauthorized",
			}),
		);

		await expect(
			requestAdminJson({
				url: "https://admin.test/pii",
				fallbackMessage: "Failed to fetch PII dashboard",
				unauthorizedMessage: "Unauthorized (PIN required)",
			}),
		).rejects.toMatchObject({
			message: "Unauthorized (PIN required)",
			status: 401,
		});
	});

	it("includes the current session access token in admin headers", async () => {
		const headers = await getAdminAuthHeaders({ "X-Test": "1" });

		expect(headers).toEqual({
			"Content-Type": "application/json",
			Authorization: "Bearer token-123",
			"X-Test": "1",
		});
	});
});
