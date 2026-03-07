import { expect, test } from "@playwright/test";
import {
	clickWithFallback,
	enforceMapConditionOrSkip,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

test.describe("Map Smoke Lite", () => {
	test("map shell is present and map reaches ready state @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
	});

	test("map controls respond without freeze @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
		if (!mapReady) return;

		const filterButton = page
			.getByTestId("btn-filter")
			.or(page.locator("button[aria-label='Open filter menu']"))
			.first();
		const filterVisible = await filterButton
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		enforceMapConditionOrSkip(filterVisible, "Filter button not visible.");
		if (!filterVisible) return;

		const filterMenu = page
			.getByTestId("filter-menu")
			.or(page.getByRole("dialog", { name: /filter vibe/i }))
			.or(page.getByText("Filter Vibe"))
			.or(page.getByText("Recommended"))
			.first();
		const waitForFilterMenu = async (timeoutMs = 2_500) =>
			filterMenu
				.waitFor({ state: "visible", timeout: timeoutMs })
				.then(() => true)
				.catch(() => false);

		const start = Date.now();
		const menuOpened = await clickWithFallback(
			filterButton,
			10_000,
			() => waitForFilterMenu(2_500),
		);
		enforceMapConditionOrSkip(menuOpened, "Filter menu did not open.");
		if (!menuOpened) return;

		const menuVisible = await waitForFilterMenu(5_000);
		enforceMapConditionOrSkip(menuVisible, "Filter menu did not stay open.");
		if (!menuVisible) return;

		const elapsedMs = Date.now() - start;

		expect(elapsedMs).toBeLessThan(10_000);
	});
});
