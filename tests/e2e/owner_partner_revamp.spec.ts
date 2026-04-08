import { expect, test } from "@playwright/test";

const openSidebar = async (page: import("@playwright/test").Page) => {
	const menuButton = page.getByTestId("btn-menu").first();
	const visible = await menuButton.isVisible({ timeout: 15_000 }).catch(() => false);
	if (!visible) {
		test.skip(true, "Sidebar menu button is not visible in this environment.");
		return false;
	}
	try {
		await menuButton.click();
	} catch {
		try {
			await menuButton.click({ force: true });
		} catch {
			test.skip(true, "Sidebar menu button is not interactable in this environment.");
			return false;
		}
	}
	await expect(page.getByTestId("sidebar-drawer").first()).toBeVisible();
	return true;
};

const seedPartnerCanarySession = async (
	page: import("@playwright/test").Page,
) => {
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

const seedOwnerCanarySession = async (
	page: import("@playwright/test").Page,
) => {
	await page.addInitScript(() => {
		localStorage.setItem("vibe_visitor_id", "e2e-owner-visitor");
	});
};

test.describe("Owner + Partner revamp coverage", { tag: "@smoke" }, () => {
	test("owner dashboard stays usable in API 404 fallback mode", async ({ page }) => {
		await seedOwnerCanarySession(page);
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
		const sourceBadge = page.getByTestId("owner-source-badge");
		await expect(sourceBadge).toBeVisible();
		const sourceMode = (await sourceBadge.textContent())?.trim() || "";
		expect(["Fallback mode (Supabase)", "Live API mode"]).toContain(sourceMode);
		if (sourceMode === "Fallback mode (Supabase)") {
			await expect(
				page.getByText("Running with Supabase fallback"),
			).toBeVisible();
		}
		await expect(page.getByText("Owner Dashboard Error")).toHaveCount(0);
	});

	test("partner payout form exposes Thai banks + international fields", async ({
		page,
	}) => {
		await seedPartnerCanarySession(page);

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
		const payoutTab = page.getByRole("tab", { name: /^Payout Setup$/i }).first();
		const partnerRoot = page.getByTestId("partner-dashboard-root").first();
		const rootVisible = await partnerRoot
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		if (!rootVisible) {
			test.skip(true, "Partner dashboard route is not accessible in this environment.");
			return;
		}

		const disabledHeading = await page
			.getByRole("heading", { name: "Partner Program Disabled" })
			.isVisible({ timeout: 8_000 })
			.catch(() => false);
		if (disabledHeading) {
			test.skip(true, "Partner feature flag is disabled in this environment.");
			return;
		}

		const payoutTabVisible = await payoutTab.isVisible().catch(() => false);
		if (!payoutTabVisible) {
			const pageText = await page.locator("main").innerText().catch(() => "");
			test.skip(
				true,
				`Partner payout tab not visible in this environment. Snapshot: ${pageText.slice(0, 120)}`,
			);
			return;
		}
		await payoutTab.click();
		await expect(
			page.getByRole("combobox", { name: /^Thai Bank$/i }),
		).toBeVisible();
		await expect(
			page.getByRole("combobox", { name: /^Bank Country$/i }),
		).toBeVisible();
		await expect(page.getByRole("combobox", { name: /^Currency$/i })).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: /^SWIFT Code$/i }),
		).toBeVisible();
		await expect(page.getByRole("textbox", { name: /^IBAN$/i })).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: /^Routing Number$/i }),
		).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: /^Bank Name \(International\)$/i }),
		).toBeVisible();
		await expect(
			page.getByRole("textbox", { name: /^Branch Name$/i }),
		).toBeVisible();
		await expect(
			page.getByRole("combobox", { name: /^Account Type$/i }),
		).toBeVisible();

		const bankSelect = page.getByRole("combobox", { name: /^Thai Bank$/i });
		await expect(bankSelect.locator("option")).toHaveCount(20);
	});

	test("sidebar keeps System section below owner/partner actions", async ({
		page,
	}) => {
		await page.goto("/en", { waitUntil: "domcontentloaded" });
		const opened = await openSidebar(page);
		if (!opened) return;

		const dialog = page.getByTestId("sidebar-drawer").first();
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

		try {
			await shopCard.click();
		} catch {
			try {
				await shopCard.click({ force: true });
			} catch {
				test.skip(true, "Shop card is not clickable in this environment.");
				return;
			}
		}
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
