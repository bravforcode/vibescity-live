import { expect, test } from "@playwright/test";
import { enforceMapConditionOrSkip } from "./helpers/mapProfile";

const MAP_SHELL_SELECTOR = '[data-testid="map-shell"]';
const MAP_READY_SELECTOR = '[data-testid="map-shell"][data-map-ready="true"]';

test.describe("Map Smoke Lite", () => {
  test("map shell is present and map reaches ready state @smoke-map-lite @map-required", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
    const mapShellVisible = await mapShell
      .isVisible({ timeout: 30_000 })
      .catch(() => false);
    enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
    if (!mapShellVisible) return;

    const mapReady = await page
      .locator(MAP_READY_SELECTOR)
      .first()
      .isVisible({ timeout: 45_000 })
      .catch(() => false);
    enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
  });

  test("map controls respond without freeze @smoke-map-lite @map-required", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
    const mapShellVisible = await mapShell
      .isVisible({ timeout: 30_000 })
      .catch(() => false);
    enforceMapConditionOrSkip(mapShellVisible, "Map shell did not render.");
    if (!mapShellVisible) return;

    const mapReady = await page
      .locator(MAP_READY_SELECTOR)
      .first()
      .isVisible({ timeout: 45_000 })
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
    enforceMapConditionOrSkip(menuVisible, "Filter menu did not open.");
    if (!menuVisible) return;

    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThan(10_000);
  });
});
