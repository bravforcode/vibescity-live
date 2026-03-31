// Legacy critical visual lane only.
// Ownership: shell/search/detail/merchant-boost regressions that are not part of
// the dedicated map/feed lane. Do not move map/feed snapshots back into this file.

import { expect, type Page, test } from "@playwright/test";
import { waitForMapReadyOrSkip } from "../e2e/helpers/mapProfile";

const DETAIL_BUTTON_LABEL = /details|detail|รายละเอียด/i;
const STABLE_VENUE_NAME = /vibe cafe/i;
const STABLE_OWNER_VISITOR_ID = "visual-owner";

const settleUi = async (page) => {
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(1500);
};

const injectCriticalVisualStyles = async (page: Page, css: string) => {
	await page.addStyleTag({ content: css });
};

const dismissConsentIfPresent = async (page) => {
	const okButton = page.getByRole("button", { name: /okay, cool/i }).first();
	if (await okButton.isVisible().catch(() => false)) {
		await okButton.click();
		await page.waitForTimeout(350);
	}
};

const neutralizeSplitShell = async (page: Page) => {
	await injectCriticalVisualStyles(
		page,
		`
			[data-testid="map-shell-wrapper"] {
				background:
					radial-gradient(circle at 20% 20%, rgba(34, 211, 238, 0.18), transparent 32%),
					linear-gradient(135deg, #050816 0%, #0b1020 48%, #111827 100%) !important;
			}
			[data-testid="map-shell-wrapper"] > * {
				visibility: hidden !important;
			}
			[data-testid="bottom-feed"] > * {
				visibility: hidden !important;
			}
		`,
	);
};

const getUnionClip = async (page: Page, selectors: string[], padding = 10) => {
	const clip = await page.evaluate(
		({ selectors: rawSelectors, padding: clipPadding }) => {
			const rects = rawSelectors
				.map((selector) => document.querySelector(selector))
				.filter(Boolean)
				.map((node) => node.getBoundingClientRect())
				.filter((rect) => rect.width > 0 && rect.height > 0);

			if (!rects.length) return null;

			const left =
				window.scrollX +
				Math.max(0, Math.min(...rects.map((rect) => rect.left)) - clipPadding);
			const top =
				window.scrollY +
				Math.max(0, Math.min(...rects.map((rect) => rect.top)) - clipPadding);
			const right =
				window.scrollX +
				Math.min(
					window.innerWidth,
					Math.max(...rects.map((rect) => rect.right)) + clipPadding,
				);
			const bottom =
				window.scrollY +
				Math.min(
					window.innerHeight,
					Math.max(...rects.map((rect) => rect.bottom)) + clipPadding,
				);

			return {
				x: left,
				y: top,
				width: Math.max(1, right - left),
				height: Math.max(1, bottom - top),
			};
		},
		{ selectors, padding },
	);

	if (!clip) {
		throw new Error(
			`Could not compute a screenshot clip for selectors: ${selectors.join(", ")}`,
		);
	}

	return clip;
};

const openStableVenueDetail = async (page: Page) => {
	const preferredCard = page
		.getByTestId("shop-card")
		.filter({ hasText: STABLE_VENUE_NAME })
		.first();
	const preferredDetails = preferredCard.getByRole("button", {
		name: DETAIL_BUTTON_LABEL,
	});

	if (await preferredDetails.isVisible().catch(() => false)) {
		await preferredDetails.click();
	} else {
		const anyDetails = page
			.getByRole("button", { name: DETAIL_BUTTON_LABEL })
			.first();
		if (await anyDetails.isVisible().catch(() => false)) {
			await anyDetails.click();
		} else {
			const fallbackCard = page.getByTestId("shop-card").first();
			await fallbackCard.click();
		}
	}

	await page.waitForTimeout(800);
	const dialog = page.getByRole("dialog").first();
	await expect(dialog).toBeVisible();
	return dialog;
};

const neutralizeVenueDialogMedia = async (page: Page) => {
	await injectCriticalVisualStyles(
		page,
		`
			[data-testid="vibe-modal"] [role="dialog"] {
				width: 1024px !important;
				max-width: 1024px !important;
				height: 684px !important;
				max-height: 684px !important;
			}
			[data-testid="vibe-modal-media"] {
				background:
					radial-gradient(circle at top left, rgba(34, 211, 238, 0.35), transparent 38%),
					linear-gradient(135deg, rgba(15, 23, 42, 1), rgba(17, 24, 39, 0.96) 46%, rgba(8, 47, 73, 0.9) 100%) !important;
			}
			[data-testid="vibe-modal-media"] > * {
				visibility: hidden !important;
			}
		`,
	);
};

const seedStableOwnerDashboard = async (page: Page) => {
	await page.addInitScript((visitorId) => {
		localStorage.setItem("vibe_visitor_id", visitorId);
	}, STABLE_OWNER_VISITOR_ID);
};

const stubOwnerDashboard = async (page: Page) => {
	await page.route("**/api/v1/owner/**", async (route) => {
		await route.fulfill({
			status: 404,
			contentType: "application/json",
			body: JSON.stringify({ detail: "Not Found" }),
		});
	});

	await page.route("**/rest/v1/venues*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([
				{
					id: "critical-owner-venue-1",
					name: "Neon Pulse Club",
					category: "Nightlife",
					status: "live",
					total_views: 1280,
					view_count: 1280,
					rating: 4.7,
					pin_type: "boost",
					image_urls: [],
					Image_URL1: null,
					open_time: "18:00",
					updated_at: "2026-03-01T10:00:00Z",
					created_at: "2026-02-01T10:00:00Z",
					verified_until: "2026-03-24T10:00:00Z",
					glow_until: "2026-03-20T10:00:00Z",
					boost_until: "2026-03-18T10:00:00Z",
					giant_until: null,
					owner_visitor_id: STABLE_OWNER_VISITOR_ID,
				},
			]),
		});
	});

	await page.route("**/rest/v1/rpc/get_venue_stats", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				live_visitors: 18,
				total_views: 1280,
			}),
		});
	});

	await page.route("**/rest/v1/analytics_events*", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([]),
		});
	});
};

test("@visual Home: map + sheet", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	await waitForMapReadyOrSkip(page, 30000);
	await expect(
		page.locator('[data-testid="map-shell-wrapper"]').first(),
	).toBeVisible();
	await expect(
		page.locator('[data-testid="bottom-feed"]').first(),
	).toBeVisible();
	await neutralizeSplitShell(page);

	await expect(page.locator("main").first()).toHaveScreenshot(
		"home-map-sheet.png",
		{
			animations: "disabled",
		},
	);
});

test("@visual Search: header + results", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	await waitForMapReadyOrSkip(page, 30000);
	const searchInput = page.locator('[data-testid="search-input"]').first();
	const searchVisible = await searchInput.isVisible().catch(() => false);
	if (!searchVisible) {
		test.skip(true, "Search input not visible in this environment.");
	}
	await expect(searchInput).toBeVisible();
	await searchInput.fill("cafe");
	await expect(
		page.locator('[data-testid="search-result"]').first(),
	).toBeVisible();
	await neutralizeSplitShell(page);
	await injectCriticalVisualStyles(
		page,
		`
			#search-results {
				min-height: 188px !important;
				max-height: 188px !important;
				overflow: hidden !important;
			}
		`,
	);

	const clip = await getUnionClip(
		page,
		['[data-testid="header"]', "#search-results"],
		12,
	);
	clip.height = 262;
	const screenshot = await page.screenshot({
		animations: "disabled",
		caret: "hide",
		clip,
	});
	expect(screenshot).toMatchSnapshot("header-search-results.png");
});

test("@visual Venue detail sheet", async ({ page }) => {
	await page.goto("/th");
	await settleUi(page);
	await dismissConsentIfPresent(page);
	await waitForMapReadyOrSkip(page, 30000);

	const dialog = await openStableVenueDetail(page);
	await neutralizeVenueDialogMedia(page);
	await dialog.evaluate((node) => {
		Object.assign((node as HTMLElement).style, {
			width: "1024px",
			maxWidth: "1024px",
			height: "684px",
			minHeight: "684px",
			maxHeight: "684px",
		});
	});
	await expect(dialog).toHaveScreenshot("venue-detail-sheet.png", {
		animations: "disabled",
	});
});

test("@visual Buy pin panel", async ({ page }) => {
	await seedStableOwnerDashboard(page);
	await stubOwnerDashboard(page);
	await page.goto("/merchant", { waitUntil: "domcontentloaded" });
	await settleUi(page);
	await expect(page.getByTestId("owner-dashboard-root")).toBeVisible();
	await expect(page.getByTestId("owner-kpi-strip")).toBeVisible();

	await page.getByRole("button", { name: /boost/i }).first().click();

	const panel = page.getByText("Power Up Your Vibe", { exact: false }).first();
	await expect(panel).toBeVisible();

	const panelModal = page
		.locator("[data-testid='owner-dashboard-root'] .fixed.inset-0 .max-w-5xl")
		.first();
	await expect(panelModal).toBeVisible();
	await expect(panelModal).toHaveScreenshot("buy-pin-panel.png", {
		animations: "disabled",
	});
});
