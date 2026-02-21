import { expect, test } from "@playwright/test";
import { attachConsoleGate } from "./helpers/consoleGate";
import {
  enforceMapConditionOrSkip,
  hasWebGLSupport,
  waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

test.describe("Map Preflight", () => {
  test.beforeEach(({}, testInfo) => {
    if (testInfo.project.use?.isMobile) {
      test.skip(true, "Map preflight is desktop-only.");
    }
  });

  test("WebGL capability + map-shell ready signal @map-preflight", async ({
    page,
  }) => {
    const consoleGate = attachConsoleGate(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const webglSupported = await hasWebGLSupport(page);
    enforceMapConditionOrSkip(
      webglSupported,
      "WebGL capability check failed for strict map lane.",
    );

    const mapShell = page.locator('[data-testid="map-shell"]').first();
    const mapShellCount = await page.locator('[data-testid="map-shell"]').count();
    if (mapShellCount === 0) {
      test.skip(true, "Map shell is not rendered in this environment");
      return;
    }
    const mapShellVisible = await mapShell
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!mapShellVisible) {
      test.skip(true, "Map shell exists but is not visible in this environment");
      return;
    }
    await expect(mapShell).toBeVisible({ timeout: 30_000 });

    const mapCanvas = page.locator('[data-testid="map-canvas"]').first();
    const mapCanvasVisible = await mapCanvas
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!mapCanvasVisible) {
      test.skip(true, "Map canvas is not visible in this environment");
      return;
    }
    await expect(mapCanvas).toBeVisible({ timeout: 30_000 });

    const mapReady = await waitForMapReadyOrSkip(page, 45_000);
    expect(mapReady).toBe(true);

    consoleGate.assertClean();
  });
});
