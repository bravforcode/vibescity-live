import { expect, type Page, test } from "@playwright/test";
import { waitForMapReadyOrSkip } from "./helpers/mapProfile";

const ACTIVE_CARD_SELECTOR = '[data-testid="shop-card"][data-active="true"]';
const FAVORITE_BUTTON_SELECTOR = 'button[aria-label*="favorite" i]';
const DETAIL_MODAL_SELECTOR = '[data-testid="vibe-modal"]';
const STARTUP_POPUP_SELECTOR = ".vibe-maplibre-popup";

const dismissBlockingUi = async (page: Page) => {
	const consentButton = page
		.getByRole("button", { name: /okay, cool/i })
		.first();
	if (await consentButton.isVisible().catch(() => false)) {
		await consentButton.click();
		await page.waitForTimeout(250);
	}

	const offlineToast = page.locator('[role="alert"]').filter({
		hasText: /ready for offline/i,
	});
	if (
		await offlineToast
			.first()
			.isVisible()
			.catch(() => false)
	) {
		await offlineToast
			.first()
			.getByRole("button", { name: /close/i })
			.first()
			.click();
		await page.waitForTimeout(250);
	}
};

const openHomeCarousel = async (page: Page) => {
	await page.goto("/en", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(1200);
	await dismissBlockingUi(page);
	await waitForMapReadyOrSkip(page, 30_000);
	await expect(page.getByTestId("vibe-carousel").first()).toBeVisible();
	await expect
		.poll(async () => page.locator('[data-testid="shop-card"]').count(), {
			timeout: 30_000,
		})
		.toBeGreaterThan(2);
	await dismissBlockingUi(page);
};

const getVisibleInactiveShopId = async (page: Page) =>
	page.evaluate(() => {
		const cards = Array.from(
			document.querySelectorAll(
				'[data-testid="shop-card"][data-active="false"]',
			),
		);
		const visibleCard = cards.find((card) => {
			const rect = card.getBoundingClientRect();
			return (
				rect.width > 0 && rect.right > 24 && rect.left < window.innerWidth - 24
			);
		});
		return (
			visibleCard?.closest("[data-shop-id]")?.getAttribute("data-shop-id") ||
			null
		);
	});

const dragCurrentActiveCard = async (page: Page) => {
	const activeCard = page.locator(ACTIVE_CARD_SELECTOR).first();
	await expect(activeCard).toBeVisible();
	const box = await activeCard.boundingBox();
	if (!box) {
		throw new Error("Active card bounding box is null.");
	}

	const y = box.y + box.height * 0.42;
	await page.mouse.move(box.x + box.width * 0.78, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.22, y, { steps: 10 });
	await page.mouse.up();
	await page.waitForTimeout(180);
};

const getActiveShopId = async (page: Page) =>
	page.evaluate(() => {
		const activeCard = document.querySelector(
			'[data-testid="shop-card"][data-active="true"]',
		);
		return (
			activeCard?.closest("[data-shop-id]")?.getAttribute("data-shop-id") ||
			null
		);
	});

const getStartupPreviewGeometry = async (page: Page) =>
	page.evaluate((popupSelector) => {
		const popup = Array.from(document.querySelectorAll(popupSelector))
			.map((element) => {
				const rect = element.getBoundingClientRect();
				const visibleWidth = Math.max(
					0,
					Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
				);
				const visibleHeight = Math.max(
					0,
					Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
				);
				return {
					element,
					rect,
					visibleArea: visibleWidth * visibleHeight,
				};
			})
			.filter(
				(candidate) => candidate.rect.width > 0 && candidate.rect.height > 0,
			)
			.sort((left, right) => right.visibleArea - left.visibleArea)[0]?.element;
		const selectedMarker =
			document.querySelector(".ns--selected") ||
			document.querySelector(".ns[role='button']");
		const header = document.querySelector(".smart-header");
		const search = document.querySelector('[data-testid="search-input"]');
		const bottomFeed = document.querySelector('[data-testid="bottom-feed"]');
		const popupRect = popup?.getBoundingClientRect();
		const markerRect = selectedMarker?.getBoundingClientRect();
		const popupVisible =
			Boolean(popupRect) && popupRect.width > 0 && popupRect.height > 0;
		const hasDomMarker =
			Boolean(markerRect) && markerRect.width > 0 && markerRect.height > 0;
		const markerVisible = hasDomMarker || popupVisible;
		const markerTop = hasDomMarker
			? Math.round(markerRect.top)
			: popupRect
				? Math.round(popupRect.bottom - 18)
				: -1;
		const markerBottom = hasDomMarker
			? Math.round(markerRect.bottom)
			: popupRect
				? Math.round(popupRect.bottom + 14)
				: -1;
		const safeTop = Math.max(
			92,
			Math.round(header?.getBoundingClientRect?.().bottom || 0),
			Math.round(search?.getBoundingClientRect?.().bottom || 0),
		);
		const safeBottom = Math.min(
			window.innerHeight - 24,
			Math.round(
				bottomFeed?.getBoundingClientRect?.().top || window.innerHeight,
			),
		);
		return {
			popupVisible,
			markerVisible,
			markerMode: hasDomMarker ? "dom" : popupVisible ? "popup-tip" : "missing",
			popupTop: popupRect ? Math.round(popupRect.top) : -1,
			popupBottom: popupRect ? Math.round(popupRect.bottom) : -1,
			markerTop,
			markerBottom,
			safeTop,
			safeBottom,
		};
	}, STARTUP_POPUP_SELECTOR);

const openDetailFromActiveCard = async (page: Page) => {
	const detailPill = page.locator(`${ACTIVE_CARD_SELECTOR} .sc-pill`).first();
	await expect(detailPill).toBeVisible();
	await detailPill.click();
	await expect(page.locator(DETAIL_MODAL_SELECTOR)).toBeVisible();
};

const closeDetailModal = async (page: Page) => {
	const closeButton = page.getByRole("button", { name: /close details/i });
	await expect(closeButton).toBeVisible();
	await closeButton.click();
	await expect(page.locator(DETAIL_MODAL_SELECTOR)).toHaveCount(0);
};

const pullUpActiveCardToOpenDetail = async (page: Page) => {
	const activeCard = page.locator(ACTIVE_CARD_SELECTOR).first();
	await expect(activeCard).toBeVisible();
	const box = await activeCard.boundingBox();
	if (!box) {
		throw new Error("Active card bounding box is null.");
	}

	const startX = box.x + box.width * 0.18;
	const startY = box.y + box.height * 0.28;
	const endY = box.y - 30;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX, endY, { steps: 22 });
	await page.mouse.up();
	await expect(page.locator(DETAIL_MODAL_SELECTOR)).toBeVisible();
};

test.describe("@mobile-contracts @carousel Home carousel interaction contract", () => {
	test.beforeEach(async ({ page, isMobile }) => {
		test.skip(!isMobile, "Home carousel contract is mobile-only.");

		await page.addInitScript(() => {
			localStorage.setItem("vibe_pwa_dismissed", "1");
		});

		await openHomeCarousel(page);
	});

	test("renders one widened active card before any user scroll", async ({
		page,
	}) => {
		const metrics = await page.evaluate(() => {
			const activeCards = Array.from(
				document.querySelectorAll(
					'[data-testid="shop-card"][data-active="true"]',
				),
			);
			const activeRect = activeCards[0]?.getBoundingClientRect();
			const inactiveRect = document
				.querySelector('[data-testid="shop-card"][data-active="false"]')
				?.getBoundingClientRect();

			return {
				activeCount: activeCards.length,
				activeWidth: activeRect ? Math.round(activeRect.width) : 0,
				inactiveWidth: inactiveRect ? Math.round(inactiveRect.width) : 0,
			};
		});

		expect(metrics.activeCount).toBe(1);
		expect(metrics.activeWidth).toBeGreaterThan(metrics.inactiveWidth);
		expect(metrics.activeWidth).toBeGreaterThanOrEqual(200);
		expect(metrics.inactiveWidth).toBeGreaterThanOrEqual(160);
	});

	test("startup centered card stays in preview mode with visible popup", async ({
		page,
	}) => {
		await expect(page.locator(DETAIL_MODAL_SELECTOR)).toHaveCount(0);
		await expect(page.locator(STARTUP_POPUP_SELECTOR).first()).toBeVisible({
			timeout: 12_000,
		});
		expect(page.url()).toMatch(/\/en\/?$/);

		const geometry = await getStartupPreviewGeometry(page);
		expect(geometry.popupVisible).toBe(true);
		expect(geometry.markerVisible).toBe(true);
		expect(geometry.popupTop).toBeGreaterThanOrEqual(geometry.safeTop - 16);
		expect(geometry.popupBottom).toBeLessThanOrEqual(geometry.safeBottom + 4);
		expect(geometry.markerTop).toBeGreaterThanOrEqual(geometry.safeTop - 24);
		expect(geometry.markerBottom).toBeLessThanOrEqual(geometry.safeBottom + 56);
	});

	test("cards with venue media use full-bleed image surfaces", async ({
		page,
	}) => {
		const cardMetrics = await page.evaluate(() => {
			const cards = Array.from(
				document.querySelectorAll(
					'[data-testid="shop-card"][data-has-real-image="true"]',
				),
			);
			const card = cards.find((candidate) => {
				const rect = candidate.getBoundingClientRect();
				return (
					rect.width > 0 &&
					rect.right > 24 &&
					rect.left < window.innerWidth - 24
				);
			});
			if (!card) return null;

			const surface = card.querySelector(".sc-surface");
			const infoSurface = card.querySelector(".sc-info-surface");
			const surfaceStyle = surface ? getComputedStyle(surface) : null;
			const infoStyle = infoSurface ? getComputedStyle(infoSurface) : null;
			return {
				cardVisual: card.getAttribute("data-card-visual"),
				backgroundImage: surfaceStyle?.backgroundImage || "none",
				backdropFilter:
					infoStyle?.backdropFilter ||
					infoStyle?.webkitBackdropFilter ||
					"none",
			};
		});

		if (!cardMetrics) {
			test.skip(
				true,
				"No visible shop card with venue image in this environment.",
			);
			return;
		}

		expect(cardMetrics.cardVisual).toBe("full-bleed");
		expect(cardMetrics.backgroundImage).toContain("url(");
		expect(cardMetrics.backdropFilter).not.toBe("none");
	});

	test("repeated horizontal drags do not toggle favorite", async ({ page }) => {
		const beforePressedCount = await page
			.locator('[data-testid="shop-card"] button[aria-pressed="true"]')
			.count();

		const trackedCard = await page.evaluate((favoriteSelector) => {
			const activeCard = document.querySelector(
				'[data-testid="shop-card"][data-active="true"]',
			);
			const shopId =
				activeCard?.closest("[data-shop-id]")?.getAttribute("data-shop-id") ||
				null;
			const favoriteButton = activeCard?.querySelector(favoriteSelector);
			return {
				shopId,
				favoriteLabel: favoriteButton?.getAttribute("aria-label") || null,
			};
		}, FAVORITE_BUTTON_SELECTOR);

		expect(trackedCard.shopId).toBeTruthy();
		expect(trackedCard.favoriteLabel).toMatch(/favorite/i);

		await dragCurrentActiveCard(page);
		await dragCurrentActiveCard(page);

		const trackedFavoriteButton = page
			.locator(
				`[data-shop-id="${trackedCard.shopId}"] ${FAVORITE_BUTTON_SELECTOR}`,
			)
			.first();
		await expect(trackedFavoriteButton).toHaveAttribute(
			"aria-label",
			trackedCard.favoriteLabel as string,
		);

		const afterPressedCount = await page
			.locator('[data-testid="shop-card"] button[aria-pressed="true"]')
			.count();
		expect(afterPressedCount).toBe(beforePressedCount);
	});

	test("closing detail keeps the active card settled and only reopens on manual pull", async ({
		page,
	}) => {
		const initialActiveShopId = await getActiveShopId(page);
		expect(initialActiveShopId).toBeTruthy();

		await openDetailFromActiveCard(page);
		await closeDetailModal(page);

		await page.waitForTimeout(1200);
		await expect(page.locator(DETAIL_MODAL_SELECTOR)).toHaveCount(0);
		expect(page.url()).toMatch(/\/en\/?$/);

		const activeShopIdAfterClose = await getActiveShopId(page);
		expect(activeShopIdAfterClose).toBe(initialActiveShopId);

		await pullUpActiveCardToOpenDetail(page);
		expect(page.url()).toContain("/venue/");
	});

	test("inactive ride CTA area does not trigger ghost tap actions", async ({
		page,
	}) => {
		const inactiveShopId = await getVisibleInactiveShopId(page);
		expect(inactiveShopId).toBeTruthy();

		const beforeUrl = page.url();
		const inactiveRideButton = page
			.locator(`[data-shop-id="${inactiveShopId}"] .sc-cta--primary`)
			.first();
		const box = await inactiveRideButton.boundingBox();
		if (!box) {
			throw new Error("Inactive ride CTA bounding box is null.");
		}

		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await page.waitForTimeout(300);

		expect(page.url()).toBe(beforeUrl);
		await expect(
			page.getByRole("dialog", { name: /ride comparison/i }),
		).toHaveCount(0);
	});
});
