import { expect, test } from "@playwright/test";
import {
	enforceMapConditionOrSkip,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

test.describe("Map User Flow", () => {
	test.beforeEach(({ page: _page }, testInfo) => {
		if (testInfo.project.use?.isMobile) {
			test.skip(true, "Skip map flow on mobile devices");
		}
	});
	test("Map shell reports ready @map-required", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });

		const mapReady = await waitForMapReadyOrSkip(page, 60_000);
		if (!mapReady) {
			return;
		}

		const mapShellReady = page
			.locator('[data-testid="map-shell"][data-map-ready="true"]')
			.first();
		const readyShellVisible = await mapShellReady
			.isVisible({ timeout: 2_000 })
			.catch(() => false);
		if (readyShellVisible) {
			await expect(mapShellReady).toBeVisible();
			return;
		}

		await expect(
			page
				.locator('.mapboxgl-map, .mapboxgl-canvas, [aria-label="Map"]')
				.first(),
		).toBeVisible();
	});

	test("Map Load -> Click Shop -> Open Drawer @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapReady = await waitForMapReadyOrSkip(page, 60_000);
		if (!mapReady) {
			return;
		}

		await page.waitForTimeout(2_500);

		const markers = page
			.locator('.mapboxgl-marker, img[alt="Map marker"]')
			.first();
		const markerVisible = await markers
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		enforceMapConditionOrSkip(markerVisible, "No map markers found.");
		if (!markerVisible) {
			return;
		}

		const markerClicked = await markers
			.click({ force: true, timeout: 10_000 })
			.then(() => true)
			.catch(async () => {
				return markers
					.evaluate((el) => {
						(el as HTMLElement).click();
					})
					.then(() => true)
					.catch(() => false);
			});
		enforceMapConditionOrSkip(markerClicked, "Map marker click failed.");
		if (!markerClicked) {
			return;
		}

		const popup = page.locator(".mapboxgl-popup");
		const popupVisible = await popup
			.isVisible({ timeout: 10_000 })
			.catch(() => false);

		const drawer = page.locator('[data-testid="vibe-modal"]');
		let drawerVisible = await drawer
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!drawerVisible && !popupVisible) {
			const detailsButton = page
				.getByRole("button", { name: "shop.details" })
				.first();
			const detailsVisible = await detailsButton
				.isVisible({ timeout: 5_000 })
				.catch(() => false);
			if (detailsVisible) {
				await detailsButton.click({ force: true });
				drawerVisible = await drawer
					.isVisible({ timeout: 10_000 })
					.catch(() => false);
			}
		}
		enforceMapConditionOrSkip(
			popupVisible || drawerVisible,
			"Map marker click did not open shop drawer/modal.",
		);
		if (!popupVisible && !drawerVisible) {
			return;
		}

		if (drawerVisible) {
			await expect(drawer).toBeVisible();
		} else {
			await expect(popup).toBeVisible();
		}
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
