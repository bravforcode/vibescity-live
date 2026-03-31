// Dedicated map/feed visual lane only.
// Ownership: feed cards, map popup alignment, and map/feed responsive polish.
// Do not reintroduce legacy critical coverage here; keep shell/search/detail/merchant
// stabilization in tests/visual/critical.spec.ts or a separate lane.

import { devices, expect, test } from "@playwright/test";
import { waitForMapReadyOrSkip } from "../e2e/helpers/mapProfile";

const settleUi = async (page) => {
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(1500);
};

const dismissConsentIfPresent = async (page) => {
	const okButton = page.getByRole("button", { name: /okay, cool/i }).first();
	if (await okButton.isVisible().catch(() => false)) {
		await okButton.click();
		await page.waitForTimeout(350);
	}
};

const openPopupForInViewportVenue = async (page) => {
	const result = await page.evaluate(async () => {
		const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		const markerRoots = [...document.querySelectorAll(".ns[role='button']")];
		const visibleMarkers = markerRoots
			.map((root) => {
				const rect = root.getBoundingClientRect();
				const tipRect = root.querySelector(".ns__tip")?.getBoundingClientRect();
				if (!tipRect || rect.width === 0 || rect.height === 0) return null;
				return {
					root,
					label: root.getAttribute("aria-label") || "",
					rect,
				};
			})
			.filter(Boolean)
			.filter(
				(entry) =>
					entry.rect.left >= 24 &&
					entry.rect.right <= window.innerWidth - 24 &&
					entry.rect.top >= 96 &&
					entry.rect.bottom <= window.innerHeight - 180,
			)
			.sort((a, b) => {
				const ac = Math.hypot(
					a.rect.left + a.rect.width / 2 - window.innerWidth / 2,
					a.rect.top + a.rect.height / 2 - window.innerHeight / 2,
				);
				const bc = Math.hypot(
					b.rect.left + b.rect.width / 2 - window.innerWidth / 2,
					b.rect.top + b.rect.height / 2 - window.innerHeight / 2,
				);
				return ac - bc;
			});

		const target = visibleMarkers[0];
		if (!target) {
			return { ok: false, reason: "no-visible-marker" };
		}

		target.root.click();
		await wait(500);

		const popup = document.querySelector(".vibe-maplibre-popup");
		const tip = popup?.querySelector(".maplibregl-popup-tip");
		const targetTipRect = target.root
			.querySelector(".ns__tip")
			?.getBoundingClientRect();
		if (!popup || !tip) {
			return {
				ok: false,
				reason: "popup-not-rendered",
				target: { label: target.label },
			};
		}
		if (!targetTipRect) {
			return {
				ok: false,
				reason: "marker-tip-missing",
				target: { label: target.label },
			};
		}

		const tipRect = tip.getBoundingClientRect();
		let anchorX = targetTipRect.left + targetTipRect.width / 2;
		let anchorY = targetTipRect.bottom;

		const map = window.__vibecityMapDebug;
		const sourceData = map?.getSource?.("pins_source")?._data;
		const features = Array.isArray(sourceData?.features)
			? sourceData.features
			: [];
		if (map && features.length > 0) {
			const markerCenterX = anchorX;
			const markerCenterY = anchorY;
			const canvasRect = map.getCanvas()?.getBoundingClientRect?.();
			const nearest = features
				.map((feature) => {
					const coordinates = feature?.geometry?.coordinates;
					if (!Array.isArray(coordinates) || coordinates.length < 2)
						return null;
					try {
						const pt = map.project(coordinates);
						return {
							x: canvasRect.left + pt.x,
							y: canvasRect.top + pt.y,
							dist: Math.hypot(
								canvasRect.left + pt.x - markerCenterX,
								canvasRect.top + pt.y - markerCenterY,
							),
						};
					} catch {
						return null;
					}
				})
				.filter(Boolean)
				.sort((a, b) => a.dist - b.dist)[0];

			if (nearest && nearest.dist <= 120) {
				anchorX = nearest.x;
				anchorY = nearest.y;
			}
		}

		return {
			ok: true,
			target: {
				label: target.label,
			},
			delta: {
				x: +(tipRect.left + tipRect.width / 2 - anchorX).toFixed(2),
				y: +(tipRect.bottom - anchorY).toFixed(2),
			},
		};
	});

	if (!result.ok) {
		throw new Error(
			`Popup alignment target could not be prepared: ${JSON.stringify(result)}`,
		);
	}

	return result;
};

test("@visual Desktop feed card polish", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	await waitForMapReadyOrSkip(page, 30000);

	const desktopPanel = page.getByTestId("desktop-feed-panel").first();
	const desktopPanelVisible = await desktopPanel.isVisible().catch(() => false);
	if (!desktopPanelVisible) {
		test.skip(true, "Desktop feed panel not visible for the current viewport.");
	}

	const firstCard = page.getByTestId("desktop-shop-card").first();
	await expect(firstCard).toBeVisible();
	const infoPanel = firstCard.locator(".shop-info-panel").first();
	await expect(infoPanel).toBeVisible();
	await expect(infoPanel).toHaveScreenshot("desktop-feed-card-polish.png", {
		animations: "disabled",
	});
});

test.describe("@visual Mobile popup alignment", () => {
	test.use({
		deviceScaleFactor: devices["Pixel 7"].deviceScaleFactor,
		hasTouch: true,
		isMobile: true,
		userAgent: devices["Pixel 7"].userAgent,
		viewport: devices["Pixel 7"].viewport,
	});

	test("popup tail stays centered on a visible venue pin", async ({ page }) => {
		await page.goto("/th");
		await settleUi(page);
		await dismissConsentIfPresent(page);
		await waitForMapReadyOrSkip(page, 30000);

		const result = await openPopupForInViewportVenue(page);
		expect(Math.abs(result.delta.x)).toBeLessThanOrEqual(2);
		expect(Math.abs(result.delta.y)).toBeLessThanOrEqual(56);

		const popup = page.locator(".vibe-maplibre-popup").first();
		await expect(popup).toBeVisible();
		await page.addStyleTag({
			content: `
				.vibe-maplibre-popup .vibe-popup > * {
					visibility: hidden !important;
				}
				.vibe-maplibre-popup .vibe-popup {
					min-height: 92px !important;
					background: rgba(15, 23, 42, 0.96) !important;
					border: 1px solid rgba(255, 255, 255, 0.12) !important;
					box-shadow: 0 12px 30px rgba(2, 6, 23, 0.4) !important;
				}
			`,
		});
		await expect(popup).toHaveScreenshot("mobile-popup-alignment.png", {
			animations: "disabled",
		});
	});
});

test.describe("@visual Landscape feed card polish", () => {
	test.use({
		hasTouch: true,
		isMobile: false,
		viewport: { width: 1180, height: 760 },
	});

	test("landscape feed uses the refined swipe card shell", async ({ page }) => {
		await page.goto("/th");
		await settleUi(page);
		await dismissConsentIfPresent(page);
		await waitForMapReadyOrSkip(page, 30000);

		const layout = page.getByTestId("video-layout-landscape").first();
		await expect(layout).toBeVisible();

		const firstCard = page.getByTestId("landscape-shop-card").first();
		await expect(firstCard).toBeVisible();
		const infoSurface = firstCard.locator(".sc-info-surface").first();
		await expect(infoSurface).toBeVisible();
		await expect(infoSurface).toHaveScreenshot(
			"landscape-feed-card-polish.png",
			{
				animations: "disabled",
			},
		);
	});
});
