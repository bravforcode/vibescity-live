import { defineConfig, devices } from "@playwright/test";

const noWebServer = process.env.PW_NO_WEBSERVER === "1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5417";

export default defineConfig({
	testDir: "./tests/visual",
	timeout: 90_000,
	expect: {
		timeout: 20_000,
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.02,
		},
	},
	reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
	outputDir: "test-results/visual",
	use: {
		baseURL,
		serviceWorkers: "block",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
	},
	webServer: noWebServer
		? undefined
		: {
				command:
					"npm run build -- --env-mode e2e && npm run preview -- --env-mode e2e --host 0.0.0.0 --port 5417",
				url: baseURL,
				reuseExistingServer: false,
				timeout: 180_000,
				env: {
					VITE_E2E: "true",
					VITE_DISABLE_ANIMATIONS: "true",
				},
			},
	projects: [
		{
			name: "Desktop Chromium",
			use: {
				...devices["Desktop Chrome"],
				browserName: "chromium",
				viewport: { width: 1440, height: 900 },
			},
		},
	],
});
