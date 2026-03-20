import { expect, test } from "@playwright/test";
import {
	enforceMapConditionOrSkip,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

const AUTH_SPAM_PATTERN = /(?:\b401\b|42501|row-level security)/i;
const VIDEO_CACHE_PATTERN = /ERR_CACHE_OPERATION_NOT_SUPPORTED/i;
const SPECULATION_MUTATION_PATTERN =
	/Inline speculation rules cannot currently be modified/i;
const MAP_EXPR_PATTERN =
	/Expected value to be of type (?:number|array<number,\s*2>)/i;

function attachConsoleCollector(page: import("@playwright/test").Page) {
	const errors: string[] = [];
	const warnings: string[] = [];

	page.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
			return;
		}
		if (message.type() === "warning") {
			warnings.push(message.text());
		}
	});

	return {
		errors,
		warnings,
		clear() {
			errors.length = 0;
			warnings.length = 0;
		},
	};
}

test.describe("Console regression baseline", () => {
	test.beforeEach(({ page }, testInfo) => {
		void page;
		if (testInfo.project.use?.isMobile) {
			test.skip(true, "Console baseline lane is desktop-only.");
		}
	});

	test("App load — no critical regressions", async ({ page }) => {
		const consoleCollector = attachConsoleCollector(page);
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForLoadState("networkidle");
		await page.waitForTimeout(1200);

		expect(
			consoleCollector.errors.some((line) => AUTH_SPAM_PATTERN.test(line)),
		).toBe(false);
		expect(
			consoleCollector.errors.some((line) => VIDEO_CACHE_PATTERN.test(line)),
		).toBe(false);
		expect(
			consoleCollector.warnings.some((line) =>
				SPECULATION_MUTATION_PATTERN.test(line),
			),
		).toBe(false);
		expect(
			consoleCollector.warnings.some((line) => MAP_EXPR_PATTERN.test(line)),
		).toBe(false);
	});

	test("Favorite toggle — no 401/42501 console spam", async ({ page }) => {
		const consoleCollector = attachConsoleCollector(page);
		await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });
		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		if (!mapReady) return;
		await page.waitForTimeout(1200);

		const favoriteButton = page
			.locator(
				[
					'[data-testid="favorite-btn"]',
					'.sc-action-btn[aria-pressed="true"]',
					'.sc-action-btn[aria-pressed="false"]',
					'button[aria-label*="favorite"]',
					'button[aria-label*="Favorite"]',
				].join(","),
			)
			.first();

		const canClickFavorite = await favoriteButton
			.isVisible({ timeout: 12_000 })
			.catch(() => false);
		enforceMapConditionOrSkip(
			canClickFavorite,
			"Favorite action button is not visible in this environment.",
		);
		if (!canClickFavorite) return;

		consoleCollector.clear();
		await favoriteButton.click({ force: true });
		await page.waitForTimeout(1800);

		expect(
			consoleCollector.errors.some((line) => AUTH_SPAM_PATTERN.test(line)),
		).toBe(false);
	});

	test("Map pan/zoom — no expression type warnings", async ({ page }) => {
		const consoleCollector = attachConsoleCollector(page);
		await page.goto("/", { waitUntil: "domcontentloaded", timeout: 90_000 });
		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		if (!mapReady) return;

		const mapCanvas = page.locator('[data-testid="map-canvas"]').first();
		const mapVisible = await mapCanvas
			.isVisible({ timeout: 12_000 })
			.catch(() => false);
		enforceMapConditionOrSkip(
			mapVisible,
			"Map canvas is not visible in this environment.",
		);
		if (!mapVisible) return;

		const box = await mapCanvas.boundingBox();
		enforceMapConditionOrSkip(Boolean(box), "Map canvas bounds unavailable.");
		if (!box) return;

		consoleCollector.clear();

		await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45, {
			steps: 12,
		});
		await page.mouse.up();

		await page.keyboard.press("+");
		await page.keyboard.press("+");
		await page.waitForTimeout(1200);

		expect(
			consoleCollector.warnings.some((line) => MAP_EXPR_PATTERN.test(line)),
		).toBe(false);
	});
});
