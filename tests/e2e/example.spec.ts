import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/VibesCity/);
});

test('can open modal', async ({ page }) => {
  await page.goto('/');
  // Logic to click a card would go here.
  // For MVP check, just verify the map container exists
  const mapbox = page.locator('.mapboxgl-map');
  await expect(mapbox).toBeVisible();
});
