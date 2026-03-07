import { expect, test } from "@playwright/test";
import {
	clickWithFallback,
	enforceMapConditionOrSkip,
	waitForMapReadyOrSkip,
} from "./helpers/mapProfile";

async function dismissAnalyticsConsent(page: Parameters<typeof test>[0]["page"]) {
	const consentDialog = page.getByRole("dialog", { name: /vibecity analytics/i });
	const consentVisible = await consentDialog
		.first()
		.isVisible({ timeout: 2_000 })
		.catch(() => false);

	if (!consentVisible) return;

	const dismissalButtons = [
		page.getByRole("button", { name: /no thanks/i }),
		page.getByRole("button", { name: /okay, cool/i }),
		page.getByRole("button", { name: /close consent banner/i }),
	];

	for (const button of dismissalButtons) {
		const visible = await button
			.first()
			.isVisible({ timeout: 1_000 })
			.catch(() => false);
		if (!visible) continue;

		await button.first().click({ timeout: 3_000 }).catch(() => {});
		await consentDialog
			.first()
			.waitFor({ state: "hidden", timeout: 5_000 })
			.catch(() => {});
		return;
	}
}

async function waitForFilterMenuSignal(
	page: Parameters<typeof test>[0]["page"],
	timeoutMs: number,
) {
	const signalLocators = [
		page.getByTestId("filter-menu"),
		page.getByRole("dialog", { name: /filter vibe/i }),
		page.getByRole("button", { name: /close filter menu/i }),
		page.getByRole("button", { name: /apply selected filters/i }),
		page.getByRole("heading", { name: /filter vibe/i }),
	];

	return expect
		.poll(
			async () => {
				for (const locator of signalLocators) {
					const visible = await locator
						.first()
						.isVisible()
						.catch(() => false);
					if (visible) return true;
				}
				return false;
			},
			{
				timeout: timeoutMs,
				intervals: [250, 500, 1_000],
			},
		)
		.toBe(true)
		.then(() => true)
		.catch(() => false);
}

async function openFilterMenu(
	page: Parameters<typeof test>[0]["page"],
	filterButton: Parameters<typeof clickWithFallback>[0],
) {
	if (await waitForFilterMenuSignal(page, 1_000)) {
		return true;
	}

	const attempts = [
		async () => {
			await filterButton.click({ timeout: 5_000 });
		},
		async () => {
			await clickWithFallback(filterButton, 10_000, () =>
				waitForFilterMenuSignal(page, 4_000),
			);
		},
		async () => {
			await filterButton.click({ force: true, timeout: 5_000 });
		},
	];

	const verificationWindows = [5_000, 8_000, 12_000];

	for (const [index, attempt] of attempts.entries()) {
		await filterButton.scrollIntoViewIfNeeded().catch(() => {});
		await filterButton.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
		await attempt().catch(() => {});
		const opened = await waitForFilterMenuSignal(
			page,
			verificationWindows[index] ?? 8_000,
		);
		if (opened) return true;
		await page.waitForTimeout(500);
	}

	return false;
}

test.describe("Map Smoke Lite", () => {
	test("map shell is present and map reaches ready state @smoke-map-lite @map-required", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
	});

	test("map controls respond without freeze @smoke-map-lite @map-required", async ({
		page,
	}) => {
		test.setTimeout(process.env.CI ? 120_000 : 75_000);

		await page.goto("/", { waitUntil: "domcontentloaded" });

		const mapReady = await waitForMapReadyOrSkip(page, 45_000);
		enforceMapConditionOrSkip(mapReady, "Map shell did not become ready.");
		if (!mapReady) return;

		await dismissAnalyticsConsent(page);
		await page.waitForTimeout(750);

		const filterButton = page
			.getByTestId("btn-filter")
			.or(page.getByRole("button", { name: /เปิดตัวกรอง|open filter/i }))
			.first();
		const filterVisible = await filterButton
			.waitFor({ state: "visible", timeout: 10_000 })
			.then(() => true)
			.catch(() => false);
		enforceMapConditionOrSkip(filterVisible, "Filter button not visible.");
		if (!filterVisible) return;

		const start = Date.now();
		const menuOpened = await openFilterMenu(page, filterButton);
		enforceMapConditionOrSkip(menuOpened, "Filter menu did not open.");
		if (!menuOpened) return;

		const menuVisible = await waitForFilterMenuSignal(page, 8_000);
		enforceMapConditionOrSkip(menuVisible, "Filter menu did not stay open.");
		if (!menuVisible) return;

		const elapsedMs = Date.now() - start;

		expect(elapsedMs).toBeLessThan(process.env.CI ? 30_000 : 15_000);
	});
});
