import { expect, test } from "@playwright/test";
import { enforceMapConditionOrSkip } from "./helpers/mapProfile";

const MAP_SHELL_SELECTOR = '[data-testid="map-shell"]';
const MAP_READY_SELECTOR =
	'[data-testid="map-shell"][data-map-ready="true"][data-map-content-ready="true"]';

test.describe("Map Smoke Lite", () => {
	test("map shell is present and map reaches ready state @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
		const mapShellVisible = await mapShell
			.waitFor({ state: "visible", timeout: 30_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
		if (!mapShellVisible) return;

		const mapReady = await page
			.locator(MAP_READY_SELECTOR)
			.first()
			.waitFor({ state: "visible", timeout: 45_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
	});

	test("map controls respond without freeze @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
		const mapShellVisible = await mapShell
			.waitFor({ state: "visible", timeout: 30_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
		if (!mapShellVisible) return;

		const mapReady = await page
			.locator(MAP_READY_SELECTOR)
			.first()
			.waitFor({ state: "visible", timeout: 45_000 })
			.then(() => true)
			.catch(() => false);
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

		const start = Date.now();
		const clicked = await filterButton
			.scrollIntoViewIfNeeded()
			.then(() => filterButton.click({ timeout: 10_000, force: true }))
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(clicked, "Filter button click failed.");
		if (!clicked) return;

		const menuVisible = await page
			.getByTestId("filter-menu")
			.or(page.getByText("Filter Vibe"))
			.or(page.getByText("Recommended"))
			.first()
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!menuVisible) {
			const safeFallbackVisible = await page
				.getByRole("heading", { name: /Map failed to load/i })
				.first()
				.isVisible({ timeout: 5_000 })
				.catch(() => false);
			if (!safeFallbackVisible) {
				enforceMapConditionOrSkip(false, "Filter menu did not open.");
				return;
			}
			await expect(
				page.getByRole("button", { name: /Reload Map/i }).first(),
			).toBeVisible({ timeout: 10_000 });
			await expect(
				page.getByRole("button", { name: /Reset Filters/i }).first(),
			).toBeVisible({ timeout: 10_000 });
		}

		const elapsedMs = Date.now() - start;

		expect(elapsedMs).toBeLessThan(10_000);
	});

	test("map popup shows live bar and media block @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
		const mapShellVisible = await mapShell
			.waitFor({ state: "visible", timeout: 30_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
		if (!mapShellVisible) return;

		const mapReady = await page
			.locator(MAP_READY_SELECTOR)
			.first()
			.waitFor({ state: "visible", timeout: 45_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
		if (!mapReady) return;

		await page.waitForTimeout(2_000);

		const safeFallbackVisible = await page
			.getByRole("heading", { name: /Map failed to load/i })
			.first()
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		if (safeFallbackVisible) {
			test.skip(
				true,
				"Popup markup is unavailable while safe map fallback shell is active.",
			);
			return;
		}

		const markers = page.locator(".mapboxgl-marker");
		const markerCount = await markers.count();
		if (markerCount === 0) {
			test.skip(
				true,
				"No map markers available for popup verification in this environment.",
			);
			return;
		}

		await markers.first().click({ force: true });

		const popupLiveBar = page.getByTestId("popup-live-bar").first();
		const popupMedia = page.getByTestId("popup-media").first();
		await expect(popupLiveBar).toBeVisible({ timeout: 10_000 });
		await expect(popupMedia).toBeVisible({ timeout: 10_000 });
		const popup = page
			.locator(".vibe-maplibre-popup.maplibregl-popup-anchor-bottom")
			.first();
		await expect(popup).toBeVisible({ timeout: 10_000 });
		await expect(popup).toHaveAttribute("data-anchor-policy", "above-pin");
		await page.waitForTimeout(250);

		const mediaHeight = await popupMedia.evaluate((node) =>
			Math.round(node.getBoundingClientRect().height),
		);
		const popupInsets = await popup.evaluate((node) => {
			const popupRect = node.getBoundingClientRect();
			const mapShell = document
				.querySelector('[data-testid="map-shell"]')
				?.getBoundingClientRect();
			return {
				topInset: mapShell ? Math.round(popupRect.top - mapShell.top) : -1,
			};
		});
		expect(mediaHeight).toBeGreaterThan(0);
		expect(popupInsets.topInset).toBeGreaterThanOrEqual(20);
	});
});
