import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Create a shared mock for the request function so we can track calls
const mockRequest = vi.fn();

vi.mock("axios", () => {
	const mockAxios = vi.fn((config) => mockRequest(config));
	mockAxios.create = vi.fn(() => mockAxios);
	mockAxios.interceptors = {
		request: { use: vi.fn(), eject: vi.fn() },
		response: { use: vi.fn(), eject: vi.fn() },
	};
	mockAxios.request = vi.fn((config) => mockRequest(config));
	mockAxios.get = vi.fn((url, config) => mockRequest({ ...config, url, method: "get" }));
	mockAxios.post = vi.fn((url, data, config) => mockRequest({ ...config, url, data, method: "post" }));
	return { default: mockAxios };
});

vi.mock("../../src/lib/runtimeConfig", () => ({
	getApiV1BaseUrl: () => "https://api.test/v1",
}));

vi.mock("../../src/services/visitorIdentity", () => ({
	getOrCreateVisitorId: vi.fn(() => "visitor-123"),
	getVisitorToken: vi.fn(() => "token-abc"),
	bootstrapVisitor: vi.fn(async () => ({ visitorToken: "new-token-abc" })),
	isVisitorTokenExpired: vi.fn(() => false),
}));

vi.mock("../../src/composables/useNotifications", () => ({
	useNotifications: () => ({
		notifyError: vi.fn(),
	}),
}));

import apiService, { request, VenueSchema } from "../../src/services/apiService";
import { z } from "zod";

describe("apiService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest.mockReset();
	});

	it("should attach visitor headers to requests", async () => {
		mockRequest.mockResolvedValue({ data: { success: true } });

		const result = await request({ url: "/test", method: "get" });

		expect(result).toEqual({ success: true });
		expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
			headers: expect.objectContaining({
				"X-Visitor-Id": "visitor-123",
				"Authorization": "Bearer token-abc"
			})
		}));
	});

	it("should validate response data against schema", async () => {
		const validData = { id: "1", name: "Shop 1", lat: 13.7, lng: 100.5 };
		mockRequest.mockResolvedValue({ data: validData });

		const result = await request({ 
			url: "/shops/1", 
			method: "get", 
			schema: VenueSchema 
		});

		expect(result).toEqual(validData);
	});

	it("should throw if validation fails", async () => {
		const invalidData = { id: "1", name: "Shop 1" }; // Missing lat/lng
		mockRequest.mockResolvedValue({ data: invalidData });

		await expect(request({ 
			url: "/shops/1", 
			method: "get", 
			schema: VenueSchema 
		})).rejects.toThrow();
	});
});
