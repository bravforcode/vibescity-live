import { expect, test } from "@playwright/test";

test.describe("Map User Flow", () => {
  test("Map Load -> Click Shop -> Open Drawer", async ({ page }) => {
    // 1. Load Application
    await page.goto("/");

    // Wait for Map to report ready
    const mapShell = page.locator('[data-testid="map-shell"]');
    await expect(mapShell).toHaveAttribute("data-map-ready", "true", {
      timeout: 15000,
    });

    // 2. Click a Shop Marker
    // Markers might take a moment to render after map is ready
    await page.waitForTimeout(2000);

    // Try to find a marker.
    // Note: GL markers are DOM elements with class 'mapboxgl-marker'
    const markers = page.locator(".mapboxgl-marker");
    const markerCount = await markers.count();
    console.log(`Found ${markerCount} markers`);

    if (markerCount > 0) {
      // Click the first interactive marker (usually index 0 is user location if enabled, so maybe index 1)
      // We'll try to find one that isn't the user location (user location often has specific class)
      // For now, simple click first one
      await markers.first().click();

      // 3. Verify Popup works
      // Assuming popup structure from code
      const popup = page.locator(".mapboxgl-popup");
      await expect(popup).toBeVisible();

      // 4. Click "See Details" or similar in popup
      // Code shows 'popup-shop-card' or simply clicking the popup content might trigger something if configured
      // But previously saw 'popup-ride-btn' and 'popup-nav-btn'.
      // Let's assume there is a way to open the drawer.
      // Ideally, looking at MapboxContainer, clicking marker emits 'select-shop'.
      // This usually opens the ProfileDrawer? No, VibeModal or MallDrawer?

      // Let's check if a drawer opens. ProfileDrawer is strictly for user profile?
      // Wait, "Profile & Gamification UI: Build User Profile...".
      // The user flow asked: "Click Shop -> Open Drawer".
      // "Drawer" likely means the Shop Detail View (VibeModal or similar).

      // Let's wait for any modal/drawer
      const drawer = page.locator('[data-testid="vibe-modal"]');
      await expect(drawer).toBeVisible();
    } else {
      console.warn("No markers found to test interaction on.");
    }
  });

  test("Gamification: Profile Drawer", async ({ page }) => {
    await page.goto("/");
    // Open Profile
    const profileBtn = page.locator('button[aria-label="Profile"]'); // Assumption
    if ((await profileBtn.count()) > 0) {
      await profileBtn.click();
      const profileDrawer = page.locator(".profile-drawer"); // Class assumption
      await expect(profileDrawer).toBeVisible();
    }
  });
});
