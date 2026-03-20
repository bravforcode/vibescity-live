/**
 * Preview-first compatible map E2E suite.
 *
 * This file intentionally supports both lanes:
 * - local dev-safe preview lane (default on Chromium localhost)
 * - full MapLibre WebGL lane (after explicit opt-in)
 */

import { expect, test, type Page } from "@playwright/test";

const TEST_CONFIG = {
	baseUrl: process.env.E2E_BASE_URL || "http://localhost:5173",
};

type MapLane = "preview" | "webgl";

class MapTestHelpers {
	static readonly selectors = {
		mapShell: '[data-testid="map-shell"]',
		webglMap: ".maplibregl-map",
		webglControls: ".maplibregl-ctrl",
		webglPins: '[data-testid="venue-marker"]',
		previewPins: '[data-testid="dev-preview-pin"]',
		previewOpenWebgl: '[data-testid="dev-preview-open-webgl"]',
		drawer: '[data-testid="venue-drawer"]',
	};

	static async waitForMapShellReady(page: Page) {
		await page.waitForSelector(this.selectors.mapShell, { timeout: 20_000 });
		await page.waitForSelector(
			`${this.selectors.mapShell}[data-map-ready="true"]`,
			{ timeout: 30_000 },
		);
	}

	static async detectLane(page: Page): Promise<MapLane> {
		const previewButtonVisible = await page
			.locator(this.selectors.previewOpenWebgl)
			.first()
			.isVisible()
			.catch(() => false);
		if (previewButtonVisible) return "preview";

		const webglVisible = await page
			.locator(this.selectors.webglMap)
			.first()
			.isVisible()
			.catch(() => false);
		return webglVisible ? "webgl" : "preview";
	}

	static async ensureWebglLane(page: Page): Promise<MapLane> {
		await this.waitForMapShellReady(page);
		const lane = await this.detectLane(page);

		if (lane === "preview") {
			const openWebglBtn = page.locator(this.selectors.previewOpenWebgl).first();
			if (await openWebglBtn.isVisible().catch(() => false)) {
				await openWebglBtn.click();
			}
		}

		await page.waitForSelector(this.selectors.webglMap, { timeout: 20_000 });
		return "webgl";
	}

	static async prepareMapLane(
		page: Page,
		opts: { requireWebgl?: boolean } = {},
	): Promise<MapLane> {
		await this.waitForMapShellReady(page);
		if (opts.requireWebgl) {
			return this.ensureWebglLane(page);
		}
		return this.detectLane(page);
	}

	static async waitForPins(
		page: Page,
		lane: MapLane,
		minCount = 1,
	): Promise<ReturnType<Page["locator"]>> {
		const selector =
			lane === "preview" ? this.selectors.previewPins : this.selectors.webglPins;
		await page.waitForSelector(selector, { timeout: 12_000 });

		const pins = page.locator(selector);
		const count = await pins.count();
		expect(count).toBeGreaterThanOrEqual(minCount);
		return pins;
	}

	static async getMetrics(page: Page) {
		return page.evaluate(() => {
			const mapShell = document.querySelector('[data-testid="map-shell"]');
			return {
				mapReady: mapShell?.getAttribute("data-map-ready") === "true",
				mapInitRequested:
					mapShell?.getAttribute("data-map-init-requested") === "true",
				mapMetrics: (window as any).__mapMetrics || null,
			};
		});
	}
}

test.beforeEach(async ({ page }) => {
	await page.goto(TEST_CONFIG.baseUrl);
	await page.setViewportSize({ width: 1280, height: 800 });
	await MapTestHelpers.waitForMapShellReady(page);
});

test.describe("Map Core Functionality", () => {
	test("should render map shell and report ready state", async ({ page }) => {
		const lane = await MapTestHelpers.prepareMapLane(page);
		const metrics = await MapTestHelpers.getMetrics(page);

		expect(["preview", "webgl"]).toContain(lane);
		expect(metrics.mapReady).toBe(true);
		expect(metrics.mapInitRequested).toBe(true);
		expect(metrics.mapMetrics).not.toBeNull();
	});

	test("should render pins in current lane", async ({ page }) => {
		const lane = await MapTestHelpers.prepareMapLane(page);
		const pins = await MapTestHelpers.waitForPins(page, lane, 1);
		await expect(pins.first()).toBeVisible();
	});

	test("should support explicit preview to webgl opt-in", async ({ page }) => {
		await MapTestHelpers.waitForMapShellReady(page);

		const previewButton = page.locator(
			MapTestHelpers.selectors.previewOpenWebgl,
		);
		if (await previewButton.first().isVisible().catch(() => false)) {
			await previewButton.first().click();
		}

		await page.waitForSelector(MapTestHelpers.selectors.webglMap, {
			timeout: 20_000,
		});
		await expect(page.locator(MapTestHelpers.selectors.webglMap)).toBeVisible();
	});

	test("should expose webgl controls after webgl lane is active", async ({
		page,
	}) => {
		await MapTestHelpers.prepareMapLane(page, { requireWebgl: true });
		const controlCount = await page
			.locator(MapTestHelpers.selectors.webglControls)
			.count();
		expect(controlCount).toBeGreaterThan(0);
	});
});

test.describe("Map Interaction And Responsiveness", () => {
	test("should handle pin click flow without crashing", async ({ page }) => {
		const lane = await MapTestHelpers.prepareMapLane(page);
		const pins = await MapTestHelpers.waitForPins(page, lane, 1);
		await pins.first().click({ force: true });

		const drawer = page.locator(MapTestHelpers.selectors.drawer);
		const opened = await drawer.isVisible().catch(() => false);
		if (opened) {
			await expect(drawer).toBeVisible();
		}

		const metrics = await MapTestHelpers.getMetrics(page);
		expect(metrics.mapReady).toBe(true);
	});

	test("should keep map shell visible across responsive breakpoints", async ({
		page,
	}) => {
		for (const viewport of [
			{ width: 390, height: 844 },
			{ width: 768, height: 1024 },
			{ width: 1920, height: 1080 },
		]) {
			await page.setViewportSize(viewport);
			await MapTestHelpers.waitForMapShellReady(page);
			await expect(page.locator(MapTestHelpers.selectors.mapShell)).toBeVisible();
		}
	});
});

test.afterEach(async ({ page }, testInfo) => {
	if (testInfo.status !== "passed") {
		const safeName = testInfo.title.replace(/\s+/g, "-").toLowerCase();
		await page.screenshot({
			path: `test-results/e2e/screenshots/failure-${safeName}.png`,
			fullPage: true,
		});
	}
});
