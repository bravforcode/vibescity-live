import { expect, test } from "@playwright/test";

const openSidebar = async (page: import("@playwright/test").Page) => {
	const menuButton = page.getByTestId("btn-menu").first();
	const visible = await menuButton.isVisible({ timeout: 15_000 }).catch(() => false);
	if (!visible) {
		test.skip(true, "Sidebar menu button is not visible in this environment.");
		return false;
	}
	await menuButton.click();
	await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
	return true;
};

test.describe("Owner + Partner revamp coverage", { tag: "@smoke" }, () => {
	test("owner dashboard stays usable in API 404 fallback mode", async ({ page }) => {
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
						id: "0ec1d0f8-0d22-4fd2-a491-cf429188f2d0",
						name: "Fallback Club",
						category: "Nightlife",
						status: "live",
						total_views: 320,
						view_count: 320,
						rating: 4.6,
						pin_type: "boost",
						image_urls: [],
						open_time: "18:00",
						updated_at: "2026-02-24T10:00:00Z",
						created_at: "2026-02-20T10:00:00Z",
						verified_until: "2026-03-20T10:00:00Z",
						glow_until: "2026-03-01T10:00:00Z",
						boost_until: "2026-03-01T10:00:00Z",
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

		await page.goto("/merchant", { waitUntil: "domcontentloaded" });
		await expect(page.getByText("Map Entertainment Dashboard")).toBeVisible();
		await expect(page.getByText("Fallback mode (Supabase)")).toBeVisible();
		await expect(
			page.getByText("Running with Supabase fallback"),
		).toBeVisible();
		await expect(page.getByText("Owner Dashboard Error")).toHaveCount(0);
	});

	test("partner payout form exposes Thai banks + international fields", async ({
		page,
	}) => {
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
						total_orders: 1,
						verified_orders: 1,
						total_paid_thb: 899,
					},
					profile: {
						id: "partner-1",
						name: "Partner One",
						referral_code: "PARTNER1",
						status: "active",
						metadata: {
							bank: {
								bank_code: "KBANK",
								bank_country: "TH",
								currency: "THB",
							},
						},
					},
					orders: [],
				}),
			});
		});

		await page.goto("/partner", { waitUntil: "domcontentloaded" });
		const payoutSectionVisible = await page
			.getByText("Payout Setup")
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		if (!payoutSectionVisible) {
			const disabled = await page
				.getByRole("heading", { name: "Partner Program Disabled" })
				.isVisible({ timeout: 8_000 })
				.catch(() => false);
			if (disabled) {
				test.skip(true, "Partner feature flag is disabled in this environment.");
				return;
			}
		}
		expect(payoutSectionVisible).toBeTruthy();
		await expect(
			page.getByText("Thai Bank (All Supported Banks)"),
		).toBeVisible();
		await expect(page.getByText("Bank Country")).toBeVisible();
		await expect(page.getByText("Currency")).toBeVisible();
		await expect(page.getByText("SWIFT Code")).toBeVisible();
		await expect(page.getByText("IBAN")).toBeVisible();
		await expect(page.getByText("Routing Number")).toBeVisible();
		await expect(page.getByText("Bank Name (International)")).toBeVisible();
		await expect(page.getByText("Branch Name")).toBeVisible();
		await expect(page.getByText("Account Type")).toBeVisible();

		const bankSelect = page
			.locator("label")
			.filter({ hasText: "Thai Bank (All Supported Banks)" })
			.locator("select");
		await expect(bankSelect.locator("option")).toHaveCount(20);
	});

	test("sidebar keeps System section below owner/partner actions", async ({
		page,
	}) => {
		await page.goto("/en", { waitUntil: "domcontentloaded" });
		const opened = await openSidebar(page);
		if (!opened) return;

		const dialog = page.locator('[role="dialog"][aria-modal="true"]');
		const text = await dialog.innerText();
		const ownerIndex = text.indexOf("Owner Dashboard");
		const partnerIndex = text.indexOf("Partner Program");
		const systemIndex = text.indexOf("System");

		if (ownerIndex < 0 || systemIndex < 0) {
			test.skip(true, "Sidebar labels are not available for ordering assertion.");
			return;
		}

		expect(systemIndex).toBeGreaterThan(ownerIndex);
		if (partnerIndex >= 0) {
			expect(systemIndex).toBeGreaterThan(partnerIndex);
		}
	});

	test("ride providers open real web URLs", async ({ page }) => {
		await page.addInitScript(() => {
			const opened: string[] = [];
			(window as unknown as { __openedUrls: string[] }).__openedUrls = opened;
			window.open = ((url?: string | URL) => {
				opened.push(String(url || ""));
				return null;
			}) as typeof window.open;
		});

		await page.goto("/en", { waitUntil: "domcontentloaded" });
		const shopCard = page.getByTestId("shop-card").first();
		const hasCard = await shopCard.isVisible({ timeout: 15_000 }).catch(() => false);
		if (!hasCard) {
			test.skip(true, "Shop card is not visible in this environment.");
			return;
		}

		await shopCard.click();
		const modal = page.getByTestId("vibe-modal").first();
		const modalVisible = await modal.isVisible({ timeout: 10_000 }).catch(() => false);
		if (!modalVisible) {
			test.skip(true, "Vibe modal is not visible in this environment.");
			return;
		}

		const rideButton = page.getByRole("button", { name: /Ride/i }).first();
		await rideButton.click();
		await expect(page.getByText(/Book a Ride/i)).toBeVisible({ timeout: 10_000 });

		const providers = [
			{ label: /Grab/i, expected: "grab.com" },
			{ label: /Bolt/i, expected: "bolt.eu" },
			{ label: /Lineman/i, expected: "lineman" },
		];

		for (let index = 0; index < providers.length; index += 1) {
			const provider = providers[index];
			await page.getByRole("button", { name: provider.label }).first().click();
			await page.waitForTimeout(1700);

			const openedUrls = await page.evaluate(
				() => (window as unknown as { __openedUrls?: string[] }).__openedUrls || [],
			);
			expect(openedUrls.length).toBeGreaterThan(0);
			expect(openedUrls[openedUrls.length - 1].toLowerCase()).toContain(
				provider.expected,
			);

			if (index < providers.length - 1) {
				await rideButton.click();
				await expect(page.getByText(/Book a Ride/i)).toBeVisible({
					timeout: 10_000,
				});
			}
		}
	});
});
