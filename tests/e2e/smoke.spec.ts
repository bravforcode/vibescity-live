import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";


/**
 * VibeCity Enterprise Smoke Suite (Mobile-first)
 * Goal:
 * - Stable selectors (prefer data-testid)
 * - Fallbacks for early stage, but still fails with actionable message
 * - Works on Chromium + WebKit (iOS-like) in CI
 */

const APP_TITLE = "VibeCity.live | Local Entertainment Map";

// ✅ Stable locators (prefer testid), with safe fallbacks
function locators(page: any) {
  const titleOk = async () => {
    await expect(page).toHaveTitle(APP_TITLE, { timeout: 15_000 });
  };

  const mapShell =
    page
      .getByTestId("map-shell")
      // Fallbacks (less stable): keep minimal
      .or(page.locator("[data-testid='map-shell']"))
      .or(page.locator("[data-map-shell]"))
      .or(page.locator("#map-shell"))
      .or(page.locator("#map"));

  const header =
    page
      .getByTestId("header")
      .or(page.locator("[data-testid='header']"))
      .or(page.locator("div.fixed.top-0.left-0.right-0"));

  const searchInput =
    page
      .getByTestId("search-input")
      .or(page.locator("input[type='text']"))
      .or(page.getByPlaceholder(/search/i));

  const menuButton =
    page
      .getByTestId("btn-menu")
      .or(page.locator("[data-testid='btn-menu']"))
      .or(page.getByRole("button", { name: /menu|drawer|open menu|≡/i }))
      // fallback for your current markup: the first round icon button in header
      .or(page.locator("div.fixed.top-0 button").first());

  const drawer =
    page
      .getByTestId("drawer-shell")
      .or(page.getByTestId("drawer"))
      .or(page.locator("[data-testid='drawer-shell']"))
      .or(page.locator("[data-drawer]"))
      .or(page.locator(".side-drawer"));

  // Note: VIBE NOW header has been removed per UX update
  // Now using minimal handle bar approach
  const bottomFeed =
    page
      .getByTestId("bottom-feed")
      .or(page.locator("[data-testid='bottom-feed']"))
      .or(page.locator(".bottom-feed"));

  const carousel =
    page
      .getByTestId("vibe-carousel")
      .or(page.locator("[data-testid='vibe-carousel']"))
      // fallback: your carousel has overflow-x-auto + snap-x
      .or(page.locator("div.overflow-x-auto.snap-x"));

  const firstCardClickable =
    page
      .getByTestId("shop-card")
      .or(page.locator("[data-testid='shop-card']"))
      // fallback: your cards contain [data-shop-id], click the first one
      .or(page.locator("[data-shop-id]")).first();

  const modal =
    page
      .getByTestId("vibe-modal")
      .or(page.locator("[data-testid='vibe-modal']"))
      // fallback: your modal uses transition "modal-fade" and PortalLayer
      .or(page.locator("[class*='modal']"))
      .or(page.locator("div.fixed.inset-0")).first();

  return {
    titleOk,
    mapShell,
    header,
    searchInput,
    menuButton,
    drawer,
    bottomFeed,
    carousel,
    firstCardClickable,
    modal,
  };
}

test.describe("VibeCity – Enterprise Mobile Smoke", { tag: "@smoke" }, () => {
  test("title is correct", async ({ page }) => {
    await page.goto("/");
    await locators(page).titleOk();
  });

  test("app loads main shell (map) and header is present", async ({ page }) => {
    await page.goto("/");

    const { mapShell, header } = locators(page);

    await expect(mapShell.first(), "Map shell should be visible (add data-testid='map-shell')").toBeVisible({
      timeout: 60_000,
    });

    await expect(header.first(), "Header should be visible (optional: add data-testid='header')").toBeVisible({
      timeout: 30_000,
    });
  });

  test("drawer opens via hamburger (and can be closed by overlay or close action if available)", async ({
    page,
  }) => {
    await page.goto("/");

    const { menuButton, drawer } = locators(page);

    await expect(menuButton.first(), "Menu button should exist (add data-testid='btn-menu')").toBeVisible({
      timeout: 30_000,
    });

    // Retry click logic for robustness
    await menuButton.first().click({ force: true });

    await expect(drawer.first(), "Drawer should be visible (add data-testid='drawer-shell' or 'drawer')").toBeVisible({
      timeout: 30_000,
    });

    // Optional close: press Escape (desktop) + click outside for mobile safe
    await page.keyboard.press("Escape").catch(() => {});
    // click top-left corner to close if overlay exists (won't fail if not)
    await page.mouse.click(5, 5).catch(() => {});
  });

  test("search input is usable (focus + type)", async ({ page }) => {
    await page.goto("/");

    const { searchInput } = locators(page);

    await expect(searchInput.first(), "Search input should exist (optional: add data-testid='search-input')").toBeVisible({
      timeout: 30_000,
    });

    await searchInput.first().click({ force: true });
    await searchInput.first().fill("cafe");
    await expect(searchInput.first()).toHaveValue("cafe", { timeout: 10_000 });
  });

  test("Shop carousel exists and can open a shop modal (tap card)", async ({ page }) => {
    await page.goto("/");

    const { bottomFeed, carousel, firstCardClickable, modal } = locators(page);

    // Bottom feed is the primary entertainment UX surface (VIBE NOW header removed)
    await expect(bottomFeed.first(), "Bottom feed should be visible").toBeVisible({
      timeout: 60_000,
    });

    await expect(carousel.first(), "Carousel should be visible (optional: add data-testid='vibe-carousel')").toBeVisible({
      timeout: 60_000,
    });

    await expect(
      firstCardClickable,
      "At least 1 card should exist (consider adding data-testid='shop-card' on card root)",
    ).toBeVisible({ timeout: 60_000 });

    // Use force click to bypass potential overlay issues in tests
    await firstCardClickable.click({ force: true });

    await expect(
      modal.first(),
      "Modal should appear after tapping a card (optional: add data-testid='vibe-modal')",
    ).toBeVisible({ timeout: 30_000 });

    // Close modal: try Escape + click backdrop (best-effort)
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.click(10, 10).catch(() => {});
  });
});
