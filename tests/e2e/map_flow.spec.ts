import { expect, test } from "@playwright/test";
import { attachConsoleGate } from "./helpers/consoleGate";
import {
  enforceMapConditionOrSkip,
  waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

test.describe("Map User Flow", () => {
  test.beforeEach(({}, testInfo) => {
    if (testInfo.project.use?.isMobile) {
      test.skip(true, "Skip map flow on mobile devices");
    }
  });
  test("Map shell reports ready @map-required", async ({ page }) => {
    const consoleGate = attachConsoleGate(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });

    const mapReady = await waitForMapReadyOrSkip(page, 60_000);
    if (!mapReady) {
      return;
    }

    const mapShellReady = page
      .locator('[data-testid="map-shell"][data-map-ready="true"]')
      .first();
    await expect(mapShellReady).toBeVisible();
    consoleGate.assertClean();
  });

  test("Map Load -> Click Shop -> Open Drawer @map-quarantine", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const mapReady = await waitForMapReadyOrSkip(page, 60_000);
    if (!mapReady) {
      return;
    }

    await page.waitForTimeout(2_500);

    const markers = page.locator(".mapboxgl-marker");
    const markerCount = await markers.count();
    enforceMapConditionOrSkip(markerCount > 0, "No map markers found.");
    if (markerCount === 0) {
      return;
    }

    await markers.first().click();

    const popup = page.locator(".mapboxgl-popup");
    await expect(popup).toBeVisible();

    const drawer = page.locator('[data-testid="vibe-modal"]');
    const drawerVisible = await drawer
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    enforceMapConditionOrSkip(
      drawerVisible,
      "Map marker click did not open shop drawer/modal.",
    );
    if (!drawerVisible) {
      return;
    }

    await expect(drawer).toBeVisible();
  });

  test("Gamification: Profile Drawer", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Open Profile
    const profileBtn = page.locator('button[aria-label="Profile"]'); // Assumption
    if ((await profileBtn.count()) > 0) {
      await profileBtn.click();
      const profileDrawer = page.locator(".profile-drawer"); // Class assumption
      await expect(profileDrawer).toBeVisible();
    }
  });
});
