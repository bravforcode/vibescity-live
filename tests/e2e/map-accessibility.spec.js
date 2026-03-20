import { expect, test } from "@playwright/test";

const createAxeBuilder = async (page) => {
	try {
		const module = await import("@axe-core/playwright");
		return new module.default({ page });
	} catch {
		return null;
	}
};

test.describe("Map Accessibility", () => {
	test("should have no accessibility violations", async ({ page }) => {
		const axeBuilder = await createAxeBuilder(page);
		test.skip(!axeBuilder, "@axe-core/playwright is not installed");
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		const accessibilityScanResults = await axeBuilder
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();

		expect(accessibilityScanResults.violations).toEqual([]);
	});

	test("should support keyboard navigation", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		// Tab to map
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");

		// Check focus
		const focusedElement = await page.evaluate(() => {
			return document.activeElement?.tagName;
		});

		expect(focusedElement).toBeTruthy();

		// Test keyboard shortcuts
		await page.keyboard.press("+");
		await page.waitForTimeout(500);

		await page.keyboard.press("-");
		await page.waitForTimeout(500);

		await page.keyboard.press("r");
		await page.waitForTimeout(500);

		// No errors should occur
		const errors = await page.evaluate(() => window.errors || []);
		expect(errors.length).toBe(0);
	});

	test("should have proper ARIA labels", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		// Check map container
		const mapAriaLabel = await page.getAttribute(
			'[data-testid="map-canvas"]',
			"aria-label",
		);
		expect(mapAriaLabel).toBeTruthy();

		// Check markers
		const markers = await page.locator(".vibe-e2e-pin-marker").all();
		for (const marker of markers.slice(0, 5)) {
			const ariaLabel = await marker.getAttribute("aria-label");
			expect(ariaLabel).toBeTruthy();
		}
	});

	test("should support screen reader announcements", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		// Check for live regions
		const liveRegions = await page.locator("[aria-live]").count();
		expect(liveRegions).toBeGreaterThan(0);
	});

	test("should have sufficient color contrast", async ({ page }) => {
		const axeBuilder = await createAxeBuilder(page);
		test.skip(!axeBuilder, "@axe-core/playwright is not installed");
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		const contrastResults = await axeBuilder
			.withTags(["wcag2aa"])
			.include('[data-testid="map-canvas"]')
			.analyze();

		const contrastViolations = contrastResults.violations.filter(
			(violation) => violation.id === "color-contrast",
		);

		expect(contrastViolations.length).toBe(0);
	});

	test("should respect prefers-reduced-motion", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		// Check animations are disabled
		const hasAnimations = await page.evaluate(() => {
			const elements = document.querySelectorAll(".neon-sign, .marker-pulse");
			return Array.from(elements).some((element) => {
				const style = window.getComputedStyle(element);
				return style.animation !== "none" && style.animation !== "";
			});
		});

		expect(hasAnimations).toBe(false);
	});

	test("should have focus indicators", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector('[data-testid="map-canvas"]');

		// Tab through interactive elements
		await page.keyboard.press("Tab");
		await page.keyboard.press("Tab");

		// Check focus outline
		const hasFocusOutline = await page.evaluate(() => {
			const focused = document.activeElement;
			if (!focused) return false;

			const style = window.getComputedStyle(focused);
			return style.outline !== "none" && style.outline !== "";
		});

		expect(hasFocusOutline).toBe(true);
	});
});
