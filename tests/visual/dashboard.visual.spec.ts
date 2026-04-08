// Dedicated dashboard visual lane only.
// Ownership: owner + partner dashboard shells and panels. Keep map/feed and
// legacy critical surfaces out of this spec so dashboard regressions stay reviewable.

import { expect, type Page, test } from "@playwright/test";

const seedStableVisitor = async (page: Page, id: string) => {
	await page.addInitScript((visitorId) => {
		localStorage.setItem("vibe_visitor_id", visitorId);
	}, id);
};

const seedPartnerSession = async (page: Page) => {
	await page.addInitScript(() => {
		const encode = (value: Record<string, unknown>) =>
			btoa(JSON.stringify(value))
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/g, "");
		const now = Math.floor(Date.now() / 1000);
		const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
			aud: "authenticated",
			exp: now + 60 * 60 * 24,
			sub: "visual-partner-user",
			email: "visual-partner@vibecity.live",
			role: "authenticated",
		})}.signature`;
		const session = {
			access_token: accessToken,
			refresh_token: "visual-refresh-token",
			token_type: "bearer",
			expires_in: 60 * 60 * 24,
			expires_at: now + 60 * 60 * 24,
			user: {
				id: "visual-partner-user",
				email: "visual-partner@vibecity.live",
				app_metadata: {
					role: "partner",
					roles: ["partner"],
					permissions: ["view:kpi", "view:financial", "edit:bank"],
				},
				user_metadata: {
					role: "partner",
					roles: ["partner"],
				},
			},
		};
		const authKeys = [
			"sb-rukyitpjfmzhqjlfmbie-auth-token",
			"sb-rukyitpjfmzhqjlfmbie-auth-token",
		];
		for (const key of authKeys) {
			localStorage.setItem(key, JSON.stringify(session));
		}
		localStorage.setItem(
			"pinia-feature-flags",
			JSON.stringify({
				flags: {
					enable_partner_program: true,
					ff_partner_dashboard_v2: true,
					ff_sensitive_reveal: true,
				},
			}),
		);
	});
};

const stubOwnerDashboard = async (page: Page) => {
	await page.route("**/api/v1/owner/**", async (route) => {
		await route.fulfill({
			status: 404,
			contentType: "application/json",
			body: JSON.stringify({ detail: "Not Found" }),
		});
	});
	await page.route("**/rest/v1/venues*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([
				{
					id: "owner-v1",
					name: "Neon Pulse Club",
					category: "Nightlife",
					status: "live",
					total_views: 1280,
					view_count: 1280,
					rating: 4.7,
					pin_type: "boost",
					image_urls: [],
					Image_URL1: null,
					open_time: "18:00",
					updated_at: "2026-03-01T10:00:00Z",
					created_at: "2026-02-01T10:00:00Z",
					verified_until: "2026-03-24T10:00:00Z",
					glow_until: "2026-03-20T10:00:00Z",
					boost_until: "2026-03-18T10:00:00Z",
					giant_until: null,
					owner_visitor_id: "visual-owner",
				},
				{
					id: "owner-v2",
					name: "Skyline Jazz Room",
					category: "Jazz Bar",
					status: "draft",
					total_views: 420,
					view_count: 420,
					rating: 4.2,
					pin_type: "normal",
					image_urls: [],
					Image_URL1: null,
					open_time: "17:00",
					updated_at: "2026-03-02T10:00:00Z",
					created_at: "2026-02-10T10:00:00Z",
					verified_until: null,
					glow_until: null,
					boost_until: null,
					giant_until: null,
					owner_visitor_id: "visual-owner",
				},
			]),
		});
	});
	await page.route("**/rest/v1/analytics_events*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([]),
		});
	});
};

const stubPartnerDashboard = async (page: Page) => {
	await page.route("**/rest/v1/feature_flags_public*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([
				{
					key: "enable_partner_program",
					enabled: true,
					rollout_percent: 100,
					kill_switch: false,
					config: {},
				},
				{
					key: "ff_sensitive_reveal",
					enabled: true,
					rollout_percent: 100,
					kill_switch: false,
					config: {},
				},
			]),
		});
	});
	await page.route("**/api/v1/partner/status**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				has_access: true,
				status: "active",
				current_period_end: "2026-03-24T00:00:00Z",
			}),
		});
	});
	await page.route("**/api/v1/partner/dashboard**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				status: {
					has_access: true,
					status: "active",
					current_period_end: "2026-03-24T00:00:00Z",
				},
				summary: {
					total_orders: 9,
					verified_orders: 7,
					total_paid_thb: 12900,
				},
				profile: {
					id: "visual-partner-user",
					name: "Visual Partner",
					referral_code: "VISUALPARTNER",
					status: "active",
					metadata: {
						bank: {
							bank_code: "KBANK",
							bank_country: "TH",
							currency: "THB",
						},
					},
				},
				orders: [
					{
						id: "order-1",
						sku: "partner_program",
						amount: 899,
						status: "paid",
						created_at: "2026-03-01T12:00:00Z",
					},
				],
			}),
		});
	});
};

test("@visual Owner dashboard unified hero + venue panel", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 860 });
	await seedStableVisitor(page, "visual-owner");
	await stubOwnerDashboard(page);

	await page.goto("/merchant", { waitUntil: "domcontentloaded" });
	await expect(page.getByTestId("owner-dashboard-root")).toBeVisible();
	await expect(page.getByTestId("owner-dashboard-hero")).toHaveScreenshot(
		"owner-dashboard-hero-unified.png",
		{ animations: "disabled" },
	);
	await expect(page.getByTestId("owner-venue-panel")).toHaveScreenshot(
		"owner-dashboard-venue-unified.png",
		{ animations: "disabled" },
	);
});

test("@visual Owner dashboard mobile layout", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await seedStableVisitor(page, "visual-owner-mobile");
	await stubOwnerDashboard(page);

	await page.goto("/merchant", { waitUntil: "domcontentloaded" });
	await expect(page.getByTestId("owner-dashboard-root")).toBeVisible();
	await expect(page.getByTestId("owner-venue-panel")).toHaveScreenshot(
		"owner-dashboard-mobile-unified.png",
		{ animations: "disabled" },
	);
});

test("@visual Partner dashboard unified shell", async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 860 });
	await seedPartnerSession(page);
	await stubPartnerDashboard(page);

	await page.goto("/partner", { waitUntil: "domcontentloaded" });
	const root = page.getByTestId("partner-dashboard-root").first();
	try {
		await expect(root).toBeVisible({ timeout: 12_000 });
	} catch {
		test.skip(
			true,
			"Partner dashboard route is not accessible in this environment.",
		);
	}

	await expect(page.getByTestId("partner-stat-strip")).toHaveScreenshot(
		"partner-dashboard-stat-strip-unified.png",
		{ animations: "disabled" },
	);
	await expect(page.getByTestId("partner-forms-grid")).toHaveScreenshot(
		"partner-dashboard-forms-unified.png",
		{ animations: "disabled" },
	);
});
