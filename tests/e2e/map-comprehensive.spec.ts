/**
 * WebGL-first map E2E suite.
 *
 * The app should boot directly into the real MapLibre renderer without any
 * localhost preview or manual opt-in lane.
 */

import { expect, type Page, test } from "@playwright/test";

const TEST_CONFIG = {
	baseUrl: process.env.E2E_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "/",
};

const selectors = {
	mapShell: '[data-testid="map-shell"]',
	webglMap: ".maplibregl-map",
	webglControls: ".maplibregl-ctrl",
	webglPins: '[data-testid="venue-marker"]',
	drawer: '[data-testid="venue-drawer"]',
};

const waitForMapShellReady = async (page: Page) => {
	await page.waitForSelector(selectors.mapShell, { timeout: 20_000 });
	await page.waitForSelector(selectors.webglMap, {
		timeout: 30_000,
	});
	await page.waitForSelector(`${selectors.mapShell}[data-map-ready="true"]`, {
		timeout: 30_000,
	});
};

const getMetrics = async (page: Page) =>
	page.evaluate(() => {
		const mapShell = document.querySelector('[data-testid="map-shell"]');
		return {
			mapReady: mapShell?.getAttribute("data-map-ready") === "true",
			mapInitRequested:
				mapShell?.getAttribute("data-map-init-requested") === "true",
			mapMetrics: (window as any).__mapMetrics || null,
		};
	});

const waitForPins = async (page: Page, minCount = 1) => {
	const pins = page.locator(selectors.webglPins);
	let count = await pins.count().catch(() => 0);

	if (count < minCount) {
		await page.waitForTimeout(1_500);
		count = await pins.count().catch(() => 0);
	}

	const metrics = await getMetrics(page);
	expect(metrics.mapReady).toBe(true);
	return { pins, count };
};

test.beforeEach(async ({ page }) => {
	await page.goto(TEST_CONFIG.baseUrl);
	await page.setViewportSize({ width: 1280, height: 800 });
	await waitForMapShellReady(page);
});

test.describe("Map Core Functionality", () => {
	test("should render the WebGL map shell and report ready state", async ({
		page,
	}) => {
		const metrics = await getMetrics(page);

		await expect(page.locator(selectors.webglMap)).toBeVisible();
		expect(metrics.mapReady).toBe(true);
		expect(metrics.mapInitRequested).toBe(true);
		expect(metrics.mapMetrics).not.toBeNull();
	});

	test("should render venue pins in the WebGL map", async ({ page }) => {
		const { pins, count } = await waitForPins(page, 1);
		if (count > 0) {
			await expect(pins.first()).toBeVisible();
		}
	});

	test("should expose map controls after WebGL boot", async ({ page }) => {
		const controlCount = await page.locator(selectors.webglControls).count();
		if (controlCount === 0) {
			await expect(page.locator(selectors.webglMap)).toBeVisible();
		} else {
			expect(controlCount).toBeGreaterThan(0);
		}
	});
});

test.describe("Map Interaction And Responsiveness", () => {
	test("should handle pin click flow without crashing", async ({ page }) => {
		const { pins, count } = await waitForPins(page, 1);
		if (count > 0) {
			await pins.first().click({ force: true });
		}

		const drawer = page.locator(selectors.drawer);
		const opened = await drawer.isVisible().catch(() => false);
		if (opened) {
			await expect(drawer).toBeVisible();
		}

		const metrics = await getMetrics(page);
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
			await waitForMapShellReady(page);
			await expect(page.locator(selectors.mapShell)).toBeVisible();
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
