import { expect, test } from "@playwright/test";

const hasConfig = () =>
	Boolean(process.env.VITE_SUPABASE_EDGE_URL || process.env.VITE_SUPABASE_URL);

test.describe("Edge CORS/Auth policy", { tag: "@smoke" }, () => {
	test("rejects unauthorized get-order-status call", async ({ request }) => {
		if (!hasConfig()) {
			test.skip(true, "Edge URL env is not configured for this environment.");
			return;
		}

		const edgeBase =
			process.env.VITE_SUPABASE_EDGE_URL ||
			`${process.env.VITE_SUPABASE_URL}/functions/v1`;

		const response = await request.post(`${edgeBase}/get-order-status`, {
			data: { session_id: "cs_test_missing_auth" },
			headers: {
				Origin: "https://malicious.example",
				"Content-Type": "application/json",
			},
			failOnStatusCode: false,
		});

		expect([401, 403]).toContain(response.status());
	});
});
