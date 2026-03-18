import { expect, test } from "@playwright/test";
import {
	enforceMapConditionOrSkip,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

const MAP_SHELL_SELECTOR = '[data-testid="map-shell"]';
const MAP_READY_SELECTOR = '[data-testid="map-shell"][data-map-ready="true"]';

test.describe("Map Smoke Lite", () => {
	test("map shell is present and map reaches ready state @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		if (!mapReady) return;
		await expect(page.locator(MAP_READY_SELECTOR).first()).toBeVisible();
	});

	test("map controls respond without freeze @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		if (!mapReady) return;

		const filterButton = page
			.getByTestId("btn-filter")
			.or(page.locator("button[aria-label='Open filter menu']"))
			.first();
		const filterVisible = await filterButton
			.waitFor({ state: "visible", timeout: 10_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(filterVisible, "Filter button not visible.");
		if (!filterVisible) return;

		const start = Date.now();
		await page.waitForTimeout(500);
		const clicked = await filterButton
			.click({ timeout: 10_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(clicked, "Filter button click failed.");
		if (!clicked) return;

		const menuVisible = await page
			.getByTestId("filter-menu")
			.or(page.getByText("Filter Vibe"))
			.or(page.getByText("Recommended"))
			.first()
			.waitFor({ state: "visible", timeout: 10_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(menuVisible, "Filter menu did not open.");
		if (!menuVisible) return;

		const elapsedMs = Date.now() - start;

		expect(elapsedMs).toBeLessThan(10_000);
	});
});
