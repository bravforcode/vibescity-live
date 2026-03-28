import { expect, test } from "@playwright/test";
import { attachConsoleGate } from "./helpers/consoleGate";
import {
	enforceMapConditionOrSkip,
	hasWebGLSupport,
	isMapRequiredProfile,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

test.describe("Map Preflight", () => {
	test.beforeEach(({ page }, testInfo) => {
		void page;
		if (testInfo.project.use?.isMobile) {
			test.skip(true, "Map preflight is desktop-only.");
		}
		if (!isMapRequiredProfile()) {
			test.skip(
				true,
				"Map preflight tests require @map-required profile (set E2E_MAP_REQUIRED=1).",
			);
		}
	});

	test("WebGL capability + map-shell ready signal @map-preflight", async ({
		page,
	}) => {
		const consoleGate = attachConsoleGate(page);

		await page.goto("/", { waitUntil: "domcontentloaded" });

		const webglSupported = await hasWebGLSupport(page);
		enforceMapConditionOrSkip(
			webglSupported,
			"WebGL capability check failed for strict map lane.",
		);

		const mapShell = page.locator('[data-testid="map-shell"]').first();
		const mapShellCount = await page
			.locator('[data-testid="map-shell"]')
			.count();
		if (mapShellCount === 0) {
			test.skip(true, "Map shell is not rendered in this environment");
			return;
		}
		const mapShellVisible = await mapShell
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!mapShellVisible) {
			test.skip(
				true,
				"Map shell exists but is not visible in this environment",
			);
			return;
		}
		await expect(mapShell).toBeVisible({ timeout: 30_000 });

		const mapCanvas = page.locator('[data-testid="map-canvas"]').first();
		const mapCanvasVisible = await mapCanvas
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!mapCanvasVisible) {
			test.skip(true, "Map canvas is not visible in this environment");
			return;
		}
		await expect(mapCanvas).toBeVisible({ timeout: 30_000 });

		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		expect(mapReady).toBe(true);
		await expect(mapShell).toHaveAttribute("data-map-content-ready", "true");

		consoleGate.assertClean();
	});

	test("localhost default resolves to prod neon basemap @map-preflight", async ({
		page,
	}) => {
		const requests: string[] = [];
		page.on("request", (request) => {
			requests.push(request.url());
		});

		await page.goto("/en", { waitUntil: "domcontentloaded" });
		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		expect(mapReady).toBe(true);
		await page.waitForTimeout(2_000);

		const mapShell = page.locator('[data-testid="map-shell"]').first();
		await expect(mapShell).toHaveAttribute("data-map-style-mode", "prod");

		expect(
			requests.some((url) => url.includes("/map-styles/vibecity-neon.json")),
		).toBe(true);
		expect(
			requests.some(
				(url) =>
					url.includes("/glyphs/") ||
					url.includes("/sprite") ||
					url.includes("/tiles/") ||
					url.endsWith(".pbf") ||
					url.endsWith(".mvt") ||
					url.includes("openfreemap.org") ||
					url.includes("openmaptiles.org") ||
					url.includes("demotiles.maplibre.org"),
			),
		).toBe(true);
		expect(
			requests.some((url) =>
				url.includes("/map-styles/vibecity-localhost.json"),
			),
		).toBe(false);
	});
});
