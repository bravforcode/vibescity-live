import { expect, type Locator, type Page, test } from "@playwright/test";

const assertNoLegacyPrefixClasses = async (
	target: Locator,
	prefix: string,
	label: string,
) => {
	const legacy = await target.evaluate((node, pfx) => {
		const out = new Set<string>();
		const walk = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
		while (walk.nextNode()) {
			const current = walk.currentNode as Element;
			for (const cls of Array.from(current.classList || [])) {
				if (cls.startsWith(pfx)) out.add(cls);
			}
		}
		return Array.from(out).sort();
	}, prefix);
	expect(legacy, `${label} still contains legacy ${prefix}* classes`).toEqual(
		[],
	);
};

const seedOwnerCanarySession = async (page: Page) => {
	await page.addInitScript(() => {
		localStorage.setItem("vibe_visitor_id", "e2e-owner-visitor");
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
					id: "e2e-owner-venue-1",
					name: "Canary Club",
					category: "Nightlife",
					status: "live",
					total_views: 640,
					view_count: 640,
					rating: 4.8,
					pin_type: "boost",
					image_urls: [],
					open_time: "18:00",
					updated_at: "2026-03-01T10:00:00Z",
					created_at: "2026-02-20T10:00:00Z",
					verified_until: "2026-03-20T10:00:00Z",
					glow_until: "2026-03-10T10:00:00Z",
					boost_until: "2026-03-12T10:00:00Z",
					giant_until: null,
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

const openOwnerDashboard = async (page: Page) => {
	await seedOwnerCanarySession(page);
	await stubOwnerDashboard(page);
	await page.goto("/merchant", { waitUntil: "domcontentloaded" });
	await expect(page.getByTestId("owner-dashboard-root").first()).toBeVisible({
		timeout: 20_000,
	});
};

const seedPartnerCanarySession = async (page: Page) => {
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
			sub: "e2e-partner-user",
			email: "partner-e2e@vibecity.live",
			role: "authenticated",
		})}.signature`;
		const session = {
			access_token: accessToken,
			refresh_token: "e2e-refresh-token",
			token_type: "bearer",
			expires_in: 60 * 60 * 24,
			expires_at: now + 60 * 60 * 24,
			user: {
				id: "e2e-partner-user",
				email: "partner-e2e@vibecity.live",
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
		const storageKeys = [
			"sb-rukyitpjfmzhqjlfmbie-auth-token",
			"sb-rukyitpjfmzhqjlfmbie-auth-token",
		];
		for (const key of storageKeys) {
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

test.describe("Dashboard UI canary matrix", { tag: "@smoke" }, () => {
	test("owner dashboard: Tailwind-only surface (no od-* class remnants)", async ({
		page,
	}) => {
		await openOwnerDashboard(page);
		await expect(page.getByText(/Merchant Portal/i)).toBeVisible();
		await assertNoLegacyPrefixClasses(
			page.getByTestId("owner-dashboard-root").first(),
			"od-",
			"Owner dashboard",
		);
	});

	test("owner dashboard: responsive matrix keeps key sections usable", async ({
		page,
	}) => {
		const matrix = [
			{ width: 390, height: 844, label: "mobile" },
			{ width: 768, height: 1024, label: "tablet" },
			{ width: 1366, height: 860, label: "desktop" },
		];

		for (const viewport of matrix) {
			await page.setViewportSize({
				width: viewport.width,
				height: viewport.height,
			});
			await openOwnerDashboard(page);
			await expect(page.getByTestId("owner-dashboard-hero")).toBeVisible();
			await expect(page.getByText(/Merchant Portal/i)).toBeVisible();
			await expect(page.getByTestId("owner-kpi-strip")).toBeVisible();
			await expect(page.getByTestId("owner-venue-panel")).toBeVisible();
		}
	});

	test("partner dashboard: guard/feature canary path", async ({ page }) => {
		await seedPartnerCanarySession(page);
		await page.goto("/partner", { waitUntil: "domcontentloaded" });

		const partnerRoot = page.getByTestId("partner-dashboard-root").first();
		const partnerVisible = await partnerRoot
			.isVisible({ timeout: 10_000 })
			.catch(() => false);

		if (!partnerVisible) {
			await expect(page).toHaveURL(/\/(en|th)(\?|$|\/)/);
			return;
		}

		await assertNoLegacyPrefixClasses(partnerRoot, "pd-", "Partner dashboard");

		const disabledHeading = page
			.getByRole("heading", { name: /Partner Program Disabled/i })
			.first();
		const disabledVisible = await disabledHeading
			.isVisible({ timeout: 8_000 })
			.catch(() => false);

		if (disabledVisible) {
			await expect(page.getByText(/enable_partner_program/i)).toBeVisible();
			return;
		}

		await expect(page.getByTestId("partner-tab-bar")).toBeVisible();
		const tabs = page.getByTestId("partner-tab-bar").locator("button");
		try {
			await tabs.nth(1).click();
		} catch {
			await tabs.nth(1).click({ force: true });
		}
		await expect(page.getByTestId("partner-bank-provider")).toBeVisible();
		await expect(page.getByTestId("partner-bank-account-name")).toBeVisible();
		await expect(page.getByTestId("partner-bank-account-number")).toBeVisible();
		await expect(page.getByTestId("partner-bank-promptpay")).toBeVisible();
	});
});
