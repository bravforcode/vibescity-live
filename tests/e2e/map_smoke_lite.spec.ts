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

    const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
    const mapShellVisible = await mapShell
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
    if (!mapShellVisible) return;

    const mapReady = await page.locator(MAP_READY_SELECTOR).first()
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
  });

		const start = Date.now();
		await page.waitForTimeout(500);
		const clicked = await filterButton
			.click({ timeout: 10_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(clicked, "Filter button click failed.");
		if (!clicked) return;

    const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
    const mapShellVisible = await mapShell
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
    if (!mapShellVisible) return;

    const mapReady = await page.locator(MAP_READY_SELECTOR).first()
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
    if (!mapReady) return;

		expect(elapsedMs).toBeLessThan(10_000);
	});
});
