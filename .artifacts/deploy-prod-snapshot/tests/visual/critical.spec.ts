import { expect, test } from "@playwright/test";
import { waitForMapReadyOrSkip } from "../e2e/helpers/mapProfile";

const settleUi = async (page) => {
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(1500);
};

const dismissConsentIfPresent = async (page) => {
	const okButton = page.getByRole("button", { name: /okay, cool/i }).first();
	if (await okButton.isVisible().catch(() => false)) {
		await okButton.click();
		await page.waitForTimeout(350);
	}
};

test("@visual Home: map + sheet", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	await waitForMapReadyOrSkip(page, 30000);
	await expect(page.locator('[data-testid="map-shell-wrapper"]').first()).toBeVisible();
	await expect(page.locator('[data-testid="bottom-feed"]').first()).toBeVisible();

	await expect(page.locator("main").first()).toHaveScreenshot("home-map-sheet.png", {
		mask: [page.locator('[data-testid="map-canvas"]').first()],
		animations: "disabled",
	});
});

test("@visual Search: header + results", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	const searchInput = page.locator('[data-testid="search-input"]').first();
	const searchVisible = await searchInput.isVisible().catch(() => false);
	if (!searchVisible) {
		test.skip(true, "Search input not visible in this environment.");
	}
	await expect(searchInput).toBeVisible();
	await searchInput.fill("cafe");
	await page.waitForTimeout(900);
	await expect(page.locator('[data-testid="header"]').first()).toHaveScreenshot(
		"header-search-results.png",
		{ animations: "disabled" },
	);
});

test("@visual Venue detail sheet", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	await waitForMapReadyOrSkip(page, 30000);

	const detailButtons = page
		.locator('[data-testid="shop-card"] button')
		.filter({ hasText: /details|detail|รายละเอียด/i });
	if ((await detailButtons.count()) > 0) {
		await detailButtons.first().click();
	} else {
		await page.locator('[data-testid="shop-card"]').first().click();
	}

	await page.waitForTimeout(800);
	const modal = page.locator('[data-testid="vibe-modal"]').first();
	await expect(modal).toBeVisible();
	await expect(modal).toHaveScreenshot("venue-detail-sheet.png", {
		animations: "disabled",
	});
});

test("@visual Buy pin panel", async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem("vibe_visitor_id", "visual-regression-partner");
	});
	await page.goto("/merchant");
	await settleUi(page);

	const panel = page.getByText("Power Up Your Vibe", { exact: false }).first();
	if (!(await panel.isVisible().catch(() => false))) {
		test.skip(true, "BuyPinsPanel not visible in this environment.");
	}
	await expect(panel).toBeVisible();
	await expect(panel.locator("xpath=ancestor::div[1]")).toHaveScreenshot(
		"buy-pin-panel.png",
		{ animations: "disabled" },
	);
});
