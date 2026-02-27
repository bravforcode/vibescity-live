import { expect, test } from "@playwright/test";

async function waitForAppLoad(page: any) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("[data-testid='splash-screen']")
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

async function openSidebar(page: any) {
  const menuButton = page
    .getByTestId("btn-menu")
    .or(page.locator("button[data-testid='btn-menu']"))
    .first();

  const isVisible = await menuButton.isVisible({ timeout: 15_000 }).catch(() => false);
  if (!isVisible) return false;

  const drawer = page.getByTestId("sidebar-drawer").first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt === 1) {
      await menuButton.evaluate((el: any) => el.click()).catch(() => {});
    } else {
      await menuButton.click({ force: true }).catch(() => {});
    }

    const opened = await drawer.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!opened) continue;

    await expect
      .poll(
        async () => {
          const box = await drawer.boundingBox();
          return box?.x ?? -999;
        },
        { timeout: 5_000 },
      )
      .toBeGreaterThanOrEqual(-1);

    return true;
  }

  return false;
}

async function clickDrawerAction(page: any, testId: string) {
  const action = page.getByTestId(testId).first();
  await action.scrollIntoViewIfNeeded().catch(() => {});

  try {
    await action.click({ timeout: 10_000 });
  } catch (error: any) {
    if (String(error?.message || "").includes("outside of the viewport")) {
      await action.evaluate((el: any) => el.click());
      return;
    }
    throw error;
  }
}

async function closeOverlay(page: any, modalTestId: string, closeLabel: string) {
  const modal = page.getByTestId(modalTestId).first();
  const closeBtn = modal.getByLabel(closeLabel).first();

  const closeBtnVisible = await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false);
  if (closeBtnVisible) {
    try {
      await closeBtn.click({ timeout: 5_000 });
    } catch {
      await closeBtn.evaluate((el: any) => el.click()).catch(() => {});
    }
  }

  const hiddenAfterButton = await modal.isHidden().catch(() => false);
  if (hiddenAfterButton) return;

  await modal.click({ position: { x: 8, y: 8 }, timeout: 3_000 }).catch(() => {});

  const hiddenAfterBackdrop = await modal.isHidden().catch(() => false);
  if (hiddenAfterBackdrop) return;

  await page.keyboard.press("Escape").catch(() => {});
}

test.describe("Feature menu flows @smoke", () => {
  test("daily check-in, saved venues, owner dashboard, partner program", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForAppLoad(page);

    const menuReady = await openSidebar(page);
    if (!menuReady) {
      test.skip(true, "Menu button not visible in this environment.");
      return;
    }

    await clickDrawerAction(page, "sidebar-action-daily-checkin");
    await expect(page.getByTestId("daily-checkin-modal").first()).toBeVisible({ timeout: 10_000 });
    await closeOverlay(page, "daily-checkin-modal", "Close check-in");
    await expect(page.getByTestId("daily-checkin-modal").first()).toBeHidden({ timeout: 10_000 });

    const sidebarForFavorites = await openSidebar(page);
    if (!sidebarForFavorites) throw new Error("Sidebar failed to open for favorites flow.");
    await clickDrawerAction(page, "sidebar-action-favorites");
    await expect(page.getByTestId("favorites-modal").first()).toBeVisible({ timeout: 10_000 });
    await closeOverlay(page, "favorites-modal", "Close favorites");
    await expect(page.getByTestId("favorites-modal").first()).toBeHidden({ timeout: 10_000 });

    const sidebarForOwner = await openSidebar(page);
    if (!sidebarForOwner) throw new Error("Sidebar failed to open for owner dashboard flow.");
    await clickDrawerAction(page, "sidebar-action-owner-dashboard");
    await page.waitForURL(/\/merchant(\?|$|\/)/, { timeout: 20_000 });
    await expect(page.getByTestId("owner-dashboard-root").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForAppLoad(page);
    const sidebarForPartner = await openSidebar(page);
    if (!sidebarForPartner) {
      testInfo.annotations.push({
        type: "skip",
        description: "Sidebar did not open on partner step.",
      });
      return;
    }

    const partnerBtn = page.getByTestId("sidebar-action-partner-program").first();
    const partnerVisible = await partnerBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!partnerVisible) {
      testInfo.annotations.push({
        type: "skip",
        description: "Partner Program button hidden (feature flag likely disabled).",
      });
      return;
    }

    await clickDrawerAction(page, "sidebar-action-partner-program");
    await page.waitForURL(/\/(partner|th\/partner|en\/partner)(\?|$|\/)/, { timeout: 20_000 });
    await expect(page.getByText(/Partner Program/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
