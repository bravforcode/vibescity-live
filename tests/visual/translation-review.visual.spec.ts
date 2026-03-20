import { expect, test, type Page } from "@playwright/test";
import {
	seedLocaleVisitor,
	seedPartnerSession,
	stubOwnerReviewApis,
	stubPartnerReviewApis,
} from "./helpers/translationReview";

const locales = ["th", "en"] as const;

const settlePage = async (page: Page) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(350);
};

for (const locale of locales) {
	test(`@visual-i18n Privacy page ${locale}`, async ({ page }) => {
		await seedLocaleVisitor(page, { locale });
		await page.setViewportSize({ width: 1440, height: 1400 });
		await page.goto(`/${locale}/privacy`, { waitUntil: "domcontentloaded" });
		await settlePage(page);
		await expect(page.locator("main").first()).toBeVisible();
		await expect(page.locator("main").first()).toHaveScreenshot(
			`translation-privacy-${locale}-desktop.png`,
			{ animations: "disabled" },
		);
	});

	test(`@visual-i18n Terms page ${locale}`, async ({ page }) => {
		await seedLocaleVisitor(page, { locale });
		await page.setViewportSize({ width: 1440, height: 1400 });
		await page.goto(`/${locale}/terms`, { waitUntil: "domcontentloaded" });
		await settlePage(page);
		await expect(page.locator("main").first()).toBeVisible();
		await expect(page.locator("main").first()).toHaveScreenshot(
			`translation-terms-${locale}-desktop.png`,
			{ animations: "disabled" },
		);
	});

	test(`@visual-i18n Owner review pack ${locale}`, async ({ page }) => {
		await seedLocaleVisitor(page, { locale });
		await stubOwnerReviewApis(page);
		await page.setViewportSize({ width: 1440, height: 960 });
		await page.goto(`/${locale}/merchant`, { waitUntil: "domcontentloaded" });
		await settlePage(page);

		await expect(page.getByTestId("owner-dashboard-root")).toBeVisible();
		await expect(page.getByTestId("owner-dashboard-hero")).toHaveScreenshot(
			`translation-owner-hero-${locale}-desktop.png`,
			{ animations: "disabled" },
		);
		await expect(page.getByTestId("owner-venue-panel")).toHaveScreenshot(
			`translation-owner-venues-${locale}-desktop.png`,
			{ animations: "disabled" },
		);

		await page.getByTestId("owner-open-promote-desktop").first().click();
		await expect(page.getByTestId("owner-promote-modal")).toBeVisible();
		await expect(page.getByTestId("buy-pins-panel")).toBeVisible();
		await expect(page.getByTestId("owner-promote-modal")).toHaveScreenshot(
			`translation-owner-promote-${locale}-desktop.png`,
			{ animations: "disabled" },
		);
		await page.getByTestId("owner-close-promote").click();
	});

	test(`@visual-i18n Owner mobile promotion ${locale}`, async ({ page }) => {
		await seedLocaleVisitor(page, { locale });
		await stubOwnerReviewApis(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/${locale}/merchant`, { waitUntil: "domcontentloaded" });
		await settlePage(page);

		await expect(page.getByTestId("owner-dashboard-root")).toBeVisible();
		await page.getByTestId("owner-open-promote-mobile").first().click();
		await expect(page.getByTestId("owner-promote-modal")).toBeVisible();
		await expect(page.getByTestId("owner-promote-modal")).toHaveScreenshot(
			`translation-owner-promote-${locale}-mobile.png`,
			{ animations: "disabled" },
		);
	});

	test(`@visual-i18n Partner review pack ${locale}`, async ({ page }) => {
		await seedPartnerSession(page, locale);
		await stubPartnerReviewApis(page);
		await page.setViewportSize({ width: 1440, height: 960 });
		await page.goto(`/${locale}/partner`, { waitUntil: "domcontentloaded" });
		await settlePage(page);

		await expect(page.getByTestId("partner-dashboard-root")).toBeVisible();
		await expect(page.getByTestId("partner-subscription-panel")).toHaveScreenshot(
			`translation-partner-subscription-${locale}-desktop.png`,
			{ animations: "disabled" },
		);
		await expect(page.getByTestId("partner-forms-grid")).toHaveScreenshot(
			`translation-partner-forms-${locale}-desktop.png`,
			{ animations: "disabled" },
		);
	});

	test(`@visual-i18n Partner mobile subscription ${locale}`, async ({ page }) => {
		await seedPartnerSession(page, locale);
		await stubPartnerReviewApis(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/${locale}/partner`, { waitUntil: "domcontentloaded" });
		await settlePage(page);

		await expect(page.getByTestId("partner-dashboard-root")).toBeVisible();
		await expect(page.getByTestId("partner-subscription-panel")).toHaveScreenshot(
			`translation-partner-subscription-${locale}-mobile.png`,
			{ animations: "disabled" },
		);
	});
}
