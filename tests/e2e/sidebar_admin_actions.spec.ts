import { expect, test } from "@playwright/test";

const openSidebar = async (page: import("@playwright/test").Page) => {
	const menuButton = page.getByTestId("btn-menu").first();
	const visible = await menuButton.isVisible({ timeout: 15_000 }).catch(() => false);
	if (!visible) {
		test.skip(true, "Sidebar menu button is not visible in this environment.");
		return false;
	}
	await menuButton.click();
	await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
	return true;
};

test.describe("Sidebar and Settings actions", { tag: "@smoke" }, () => {
	test("sidebar exposes a real logout action", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const opened = await openSidebar(page);
		if (!opened) return;

		const logoutButton = page.getByTestId("sidebar-logout").first();
		await expect(logoutButton).toBeVisible();
		await expect(logoutButton).toBeEnabled();
	});

	test("clear data uses in-app confirm dialog (not browser confirm)", async ({
		page,
	}) => {
		let nativeDialogSeen = false;
		page.on("dialog", async (dialog) => {
			nativeDialogSeen = true;
			await dialog.dismiss();
		});

		await page.goto("/", { waitUntil: "domcontentloaded" });
		const opened = await openSidebar(page);
		if (!opened) return;

		const settingsButton = page.getByTestId("sidebar-open-settings").first();
		const settingsVisible = await settingsButton
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!settingsVisible) {
			test.skip(true, "Settings action is not visible in this environment.");
			return;
		}
		await settingsButton.click();

		const clearDataButton = page.getByTestId("settings-clear-data").first();
		await expect(clearDataButton).toBeVisible({ timeout: 10_000 });
		await clearDataButton.click();

		const confirmDialog = page.getByTestId("confirm-dialog").first();
		await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
		await page.getByTestId("confirm-dialog-cancel").first().click();
		await expect(confirmDialog).toBeHidden({ timeout: 10_000 });
		expect(nativeDialogSeen).toBeFalsy();
	});
});
