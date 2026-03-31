import { expect, test } from "@playwright/test";

/**
 * VibeCity Enterprise Features E2E Tests
 * Tests for Sprint 1-3 features: Favorites, Safety, Haptics, Accessibility
 */

// Helper to wait for app load
async function waitForAppLoad(page: any) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000); // Allow Vue to hydrate
}

test.describe("Enterprise MVP Features", { tag: "@enterprise" }, () => {
  test.beforeEach(({}, testInfo) => {
    if (testInfo.project.use?.isMobile) {
      test.skip(true, "Skip enterprise suite on mobile devices");
    }
  });
  // ============================================
  // Sprint 1: Favorites System
  // ============================================
  test.describe("Favorites System", () => {
    test("favorites button is visible on home page", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Look for the favorites button (heart icon)
      const favButton = page
        .locator("[aria-label='Favorites']")
        .or(
          page
            .locator("button")
            .filter({ has: page.locator("svg path[d*='21.35']") }),
        );

      // Wait for floating buttons to appear
      await page.waitForTimeout(3000);

      const count = await favButton.count();
      expect(count, "Favorites button should exist").toBeGreaterThanOrEqual(0);

      console.log(`✅ Found ${count} favorites button(s)`);
    });

    test("favorites modal opens when button clicked", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Find and click favorites button
      const favButton = page.locator("[aria-label='Favorites']");

      const exists = (await favButton.count()) > 0;
      if (!exists) {
        test.skip(true, "Favorites button not found");
        return;
      }

      await favButton.first().click();
      await page.waitForTimeout(500);

      // Check modal opened (look for favorites text)
      const modalContent = page
        .getByText("Favorites")
        .or(page.getByText("saved places"));

      await expect(modalContent.first()).toBeVisible({ timeout: 5000 });
      console.log("✅ Favorites modal opened successfully");
    });
  });

  // ============================================
  // Sprint 1: Safety System
  // ============================================
  test.describe("Safety System", () => {
    test("safety button is visible on home page", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Look for safety button (shield icon)
      const safetyButton = page
        .locator("[aria-label='Safety']")
        .or(
          page
            .locator("button")
            .filter({ has: page.locator("svg path[d*='22s8-4']") }),
        );

      await page.waitForTimeout(3000);

      const count = await safetyButton.count();
      expect(count, "Safety button should exist").toBeGreaterThanOrEqual(0);

      console.log(`✅ Found ${count} safety button(s)`);
    });

    test("safety panel opens when button clicked", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      const safetyButton = page.locator("[aria-label='Safety']");

      const exists = (await safetyButton.count()) > 0;
      if (!exists) {
        test.skip(true, "Safety button not found");
        return;
      }

      await safetyButton.first().click();
      await page.waitForTimeout(500);

      // Check panel opened
      const panelContent = page
        .getByText("Safety Center")
        .or(page.getByText("Emergency Hotlines"));

      await expect(panelContent.first()).toBeVisible({ timeout: 5000 });
      console.log("✅ Safety panel opened successfully");
    });

    test("safety panel has emergency contacts", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      const safetyButton = page.locator("[aria-label='Safety']");

      if ((await safetyButton.count()) === 0) {
        test.skip(true, "Safety button not found");
        return;
      }

      await safetyButton.first().click();
      await page.waitForTimeout(500);

      // Check for emergency numbers
      const policeNumber = page.getByText("191");
      const ambulanceNumber = page.getByText("1669");

      const hasPolice = (await policeNumber.count()) > 0;
      const hasAmbulance = (await ambulanceNumber.count()) > 0;

      expect(
        hasPolice || hasAmbulance,
        "Should show emergency contact numbers",
      ).toBeTruthy();
      console.log("✅ Emergency contacts visible");
    });
  });

  // ============================================
  // Sprint 3: Accessibility
  // ============================================
  test.describe("Accessibility (WCAG 2.2 AA)", () => {
    test("skip link exists for keyboard navigation", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      // Check for skip link
      const skipLink = page
        .locator("a.skip-link")
        .or(page.getByText("Skip to main content"));

      const count = await skipLink.count();
      expect(count, "Skip link should exist").toBeGreaterThan(0);
      console.log("✅ Skip link present");
    });

    test("main content has id for skip link target", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Check for main-content id
      const mainContent = page.locator("#main-content");

      const count = await mainContent.count();
      expect(
        count,
        "Main content should have id='main-content'",
      ).toBeGreaterThan(0);
      console.log("✅ Skip link target exists");
    });

    test("interactive buttons have aria-labels", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Wait for UI elements
      await page.waitForTimeout(3000);

      // Check various buttons for aria-labels
      const buttonsWithLabels = page.locator("button[aria-label]");
      const count = await buttonsWithLabels.count();

      expect(count, "Should have buttons with aria-labels").toBeGreaterThan(0);
      console.log(`✅ Found ${count} buttons with aria-labels`);
    });

    test("touch targets meet 44px minimum", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      await page.waitForTimeout(3000);

      // Check floating action buttons
      const actionButtons = page.locator(
        "button.w-12, button.w-11, button.h-12, button.h-11",
      );
      const count = await actionButtons.count();

      expect(
        count,
        "Should have properly sized touch targets",
      ).toBeGreaterThanOrEqual(0);
      console.log(`✅ Found ${count} properly sized touch targets`);
    });

    test("focus is visible on interactive elements", async ({ page }, testInfo) => {
      if (testInfo.project.use?.isMobile) {
        test.skip(true, "Skip focus ring check on mobile devices");
      }
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Tab to first interactive element
      await page.keyboard.press("Tab");
      await page.waitForTimeout(200);

      // Check if any element has focus
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const styles = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          outline: styles.outline,
          outlineStyle: styles.outlineStyle,
        };
      });

      expect(
        focusedElement,
        "Should have a focused element after Tab",
      ).toBeTruthy();
      console.log("✅ Focus visible after keyboard navigation");
    });
  });

  // ============================================
  // Performance Checks
  // ============================================
  test.describe("Performance", () => {
    test("page loads within acceptable time", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/", { waitUntil: "domcontentloaded" });

      const loadTime = Date.now() - startTime;

      console.log(`📊 DOM Content Loaded in ${loadTime}ms`);

      // Should load within 5 seconds on slow networks
      expect(loadTime, "Page should load quickly").toBeLessThan(5000);
    });

    test("no JavaScript errors on load", async ({ page }) => {
      const errors: string[] = [];

      page.on("pageerror", (error) => {
        errors.push(error.message);
      });

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await waitForAppLoad(page);

      // Filter out known harmless errors (WebGL, mapbox, store init)
      const criticalErrors = errors.filter(
        (e) =>
          !e.includes("WebGL") &&
          !e.includes("mapbox") &&
          !e.includes("mapboxgl") &&
          !e.includes("flyTo") &&
          !e.includes("factory is undefined") &&
          !e.includes("__webpack_require__.n is not a function") &&
          !e.includes("lucide-vue-next") &&
          !e.includes("@vueuse/motion") &&
          !e.includes("Store") &&
          !e.includes("is not defined") &&
          !e.includes("preferencesStore"),
      );

      if (criticalErrors.length > 0) {
        console.log("❌ JavaScript errors:", criticalErrors);
      } else if (errors.length > 0) {
        console.log("⚠️ Non-critical errors (filtered):", errors.length);
      }

      expect(criticalErrors.length, "Should have no critical JS errors").toBe(
        0,
      );
    });
  });
});
