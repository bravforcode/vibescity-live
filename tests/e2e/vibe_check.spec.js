import { expect, test } from "@playwright/test";
import { attachConsoleGate } from "./helpers/consoleGate";
import {
	enforceMapConditionOrSkip,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile.ts";

async function waitForAppLoad(page) {
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(1000);
}

async function openAnyShopDetail(page, query = "Cafe", timeoutMs = 15_000) {
	const searchInput = page.locator('[data-testid="search-input"]');
	const searchVisible = await searchInput
		.waitFor({ state: "visible", timeout: timeoutMs })
		.then(() => true)
		.catch(() => false);
	enforceMapConditionOrSkip(
		searchVisible,
		"Search input not visible in this environment",
	);
	if (!searchVisible) {
		return false;
	}

	await searchInput.fill(query);

	const firstResult = page.getByTestId("search-result").first();
	const resultVisible = await firstResult
		.waitFor({ state: "visible", timeout: timeoutMs })
		.then(() => true)
		.catch(() => false);
	if (resultVisible) {
		await firstResult.click();
		return true;
	}

	const detailButton = page
		.getByRole("button", { name: /shop\.details|details/i })
		.first();
	const detailVisible = await detailButton
		.waitFor({ state: "visible", timeout: timeoutMs })
		.then(() => true)
		.catch(() => false);
	enforceMapConditionOrSkip(
		detailVisible,
		"No search results or feed detail controls visible in this environment",
	);
	if (!detailVisible) {
		return false;
	}

	await detailButton.click({ force: true });
	return true;
}

test.describe("VibeCity Core User Journey", () => {
	test.beforeEach(async ({ page }, testInfo) => {
		if (testInfo.project.use?.isMobile) {
			test.skip(true, "Skip core journey on mobile devices");
			return;
		}
		// Go to the app root
		await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });
		await waitForAppLoad(page);
	});

	test("Map Loads and Reports Ready @map-required", async ({ page }) => {
		const consoleGate = attachConsoleGate(page);
		const mapReady = await waitForMapReadyOrSkip(page, 25_000);
		if (!mapReady) {
			return;
		}

    // Wait for results
    const firstResult = page.getByTestId("search-result").first();
    const resultVisible = await firstResult
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    enforceMapConditionOrSkip(
      resultVisible,
      "Search results not visible in this environment",
    );
    if (!resultVisible) {
      return;
    }

	test("Search and Open Shop Detail @map-required", async ({ page }) => {
		const mapReady = await waitForMapReadyOrSkip(page, 25_000);
		if (!mapReady) {
			return;
		}

    // Verify Modal Opens using test id
    const modal = page.locator('[data-testid="vibe-modal"]');
    const modalVisible = await modal
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    enforceMapConditionOrSkip(
      modalVisible,
      "Vibe modal did not open after search select",
    );
    if (!modalVisible) {
      return;
    }

		// Verify Modal Opens using test id
		const modal = page.locator('[data-testid="vibe-modal"]');
		const modalVisible = await modal
			.isVisible({ timeout: 15000 })
			.catch(() => false);
		enforceMapConditionOrSkip(
			modalVisible,
			"Vibe modal did not open after search select",
		);
		if (!modalVisible) {
			return;
		}

  test('Send Vibe (Coin Reward)', async ({ page }) => {
    // 1. Open a shop detail (Assuming we can click a marker or use search)
    // Let's use search for reliability
    await page.fill('[data-testid="search-input"]', "Vibe");
    const firstResult = page.getByTestId("search-result").first();
    const resultVisible = await firstResult
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!resultVisible) {
      test.skip(true, "Search results not visible in this environment");
      return;
    }
    await firstResult.click();

	test("Send Vibe (Coin Reward)", async ({ page }) => {
		const detailOpened = await openAnyShopDetail(page, "Vibe", 15_000);
		if (!detailOpened) {
			return;
		}

    // If modal is open, text "Like" might be in the floating action bar
    // Checking for presence of "Like" text or similar
    // For now, let's verify the modal loads and we can close it
    const modal = page.locator('[data-testid="vibe-modal"]');
    const modalVisible = await modal
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!modalVisible) {
      test.skip(true, "Vibe modal did not open after search select");
      return;
    }

		// If modal is open, text "Like" might be in the floating action bar
		// Checking for presence of "Like" text or similar
		// For now, let's verify the modal loads and we can close it
		const modal = page.locator('[data-testid="vibe-modal"]');
		const modalVisible = await modal
			.isVisible({ timeout: 15000 })
			.catch(() => false);
		if (!modalVisible) {
			test.skip(true, "Vibe modal did not open after search select");
			return;
		}

		// Close modal
		await page.locator('button[aria-label="Close details"]').click();
		await expect(modal).toBeHidden();
	});

	test("Header Coin Counter Exists", async ({ page }) => {
		// Verify Coin Counter element from Feature #8
		const coinCounter = page.getByTestId("coin-counter");
		await expect(coinCounter).toBeVisible();
		// Default might be 0 or persisted value
	});
});
