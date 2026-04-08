import { describe, expect, it } from "vitest";
import {
	isSupabaseFunctionRequest,
	sanitizeSupabaseRequestHeaders,
} from "../../src/lib/supabaseRequestHeaders";

describe("supabaseRequestHeaders", () => {
	it("recognizes Supabase Edge Function requests", () => {
		expect(
			isSupabaseFunctionRequest(
				"https://rukyitpjfmzhqjlfmbie.supabase.co/functions/v1/analytics-ingest",
				"https://rukyitpjfmzhqjlfmbie.supabase.co",
			),
		).toBe(true);
		expect(
			isSupabaseFunctionRequest(
				"https://rukyitpjfmzhqjlfmbie.supabase.co/rest/v1/rpc/get_feed_cards",
				"https://rukyitpjfmzhqjlfmbie.supabase.co",
			),
		).toBe(false);
	});

	it("removes visitor headers only for function requests", () => {
		const headers = sanitizeSupabaseRequestHeaders({
			requestUrl:
				"https://rukyitpjfmzhqjlfmbie.supabase.co/functions/v1/analytics-ingest",
			supabaseBaseUrl: "https://rukyitpjfmzhqjlfmbie.supabase.co",
			headersInit: {
				apikey: "anon",
				vibe_visitor_id: "visitor-123",
				"x-vibe-visitor-id": "visitor-123",
			},
		});

		expect(headers).toBeInstanceOf(Headers);
		expect(headers.get("apikey")).toBe("anon");
		expect(headers.has("vibe_visitor_id")).toBe(false);
		expect(headers.has("x-vibe-visitor-id")).toBe(false);
	});

	it("preserves visitor headers for rpc and rest requests", () => {
		const originalHeaders = {
			vibe_visitor_id: "visitor-123",
		};
		const headers = sanitizeSupabaseRequestHeaders({
			requestUrl:
				"https://rukyitpjfmzhqjlfmbie.supabase.co/rest/v1/rpc/get_feed_cards",
			supabaseBaseUrl: "https://rukyitpjfmzhqjlfmbie.supabase.co",
			headersInit: originalHeaders,
		});

		expect(headers).toBe(originalHeaders);
	});
});
