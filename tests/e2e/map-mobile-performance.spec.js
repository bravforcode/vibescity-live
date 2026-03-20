import { devices, expect, test } from "@playwright/test";

const MOBILE_DEVICES = [
	{ name: "iPhone 12", ...devices["iPhone 12"] },
	{ name: "Pixel 5", ...devices["Pixel 5"] },
	{ name: "Galaxy S21", ...devices["Galaxy S21"] },
];

const FPS_THRESHOLD = 30; // Minimum acceptable FPS
const MEMORY_THRESHOLD = 100 * 1024 * 1024; // 100MB

const withDevicePage = async (browser, device, callback) => {
	const context = await browser.newContext({ ...device });
	const page = await context.newPage();
	try {
		return await callback(page);
	} finally {
		await context.close();
	}
};

const dragMap = async (page, map) => {
	const box = await map.boundingBox();
	if (!box) return;
	const startX = box.x + box.width * 0.6;
	const startY = box.y + box.height * 0.55;
	const endX = box.x + box.width * 0.35;
	const endY = box.y + box.height * 0.35;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(endX, endY, { steps: 12 });
	await page.mouse.up();
};

test.describe("Map Mobile Performance", () => {
	for (const device of MOBILE_DEVICES) {
		test.describe(device.name, () => {
			test("should maintain acceptable FPS on map interaction", async ({
				browser,
			}) => {
				await withDevicePage(browser, device, async (page) => {
					await page.goto("/");
					await page.waitForSelector('[data-testid="map-canvas"]');

					// Start performance monitoring
					await page.evaluate(() => {
						window.fpsLog = [];
						let lastTime = performance.now();
						let frames = 0;

						function measureFPS() {
							frames++;
							const currentTime = performance.now();
							if (currentTime >= lastTime + 1000) {
								const fps = Math.round(
									(frames * 1000) / (currentTime - lastTime),
								);
								window.fpsLog.push(fps);
								frames = 0;
								lastTime = currentTime;
							}
							if (window.fpsLog.length < 10) {
								requestAnimationFrame(measureFPS);
							}
						}

						requestAnimationFrame(measureFPS);
					});

					// Interact with map
					const map = page.locator('[data-testid="map-canvas"]');
					await map.click({ position: { x: 100, y: 100 } });
					await dragMap(page, map);

					// Wait for FPS measurements
					await page.waitForTimeout(11000);

					// Check FPS
					const fpsLog = await page.evaluate(() => window.fpsLog || []);
					expect(fpsLog.length).toBeGreaterThan(0);
					const avgFPS =
						fpsLog.reduce((left, right) => left + right, 0) / fpsLog.length;

					console.log(`${device.name} Average FPS: ${avgFPS.toFixed(2)}`);
					expect(avgFPS).toBeGreaterThanOrEqual(FPS_THRESHOLD);
				});
			});

			test("should not exceed memory threshold", async ({ browser }) => {
				await withDevicePage(browser, device, async (page) => {
					await page.goto("/");
					await page.waitForSelector('[data-testid="map-canvas"]');

					// Get initial memory
					const initialMemory = await page.evaluate(() => {
						if (performance.memory) {
							return performance.memory.usedJSHeapSize;
						}
						return 0;
					});

					// Interact with map extensively
					const map = page.locator('[data-testid="map-canvas"]');
					for (let i = 0; i < 10; i++) {
						await dragMap(page, map);
						await page.waitForTimeout(100);
					}

					// Get final memory
					const finalMemory = await page.evaluate(() => {
						if (performance.memory) {
							return performance.memory.usedJSHeapSize;
						}
						return 0;
					});

					const memoryIncrease = finalMemory - initialMemory;
					console.log(
						`${device.name} Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
					);

					if (initialMemory > 0) {
						expect(memoryIncrease).toBeLessThan(MEMORY_THRESHOLD);
					}
				});
			});

			test("should load map within acceptable time", async ({ browser }) => {
				await withDevicePage(browser, device, async (page) => {
					const startTime = Date.now();

					await page.goto("/");
					await page.waitForSelector('[data-testid="map-canvas"]');

					// Wait for map to be ready
					await page.waitForFunction(
						() => {
							const canvas = document.querySelector(
								'[data-testid="map-canvas"] canvas',
							);
							return canvas && canvas.width > 0;
						},
						{ timeout: 10000 },
					);

					const loadTime = Date.now() - startTime;
					console.log(`${device.name} Map load time: ${loadTime}ms`);

					expect(loadTime).toBeLessThan(5000);
				});
			});

			test("should handle touch gestures smoothly", async ({ browser }) => {
				await withDevicePage(browser, device, async (page) => {
					await page.goto("/");
					await page.waitForSelector('[data-testid="map-canvas"]');

					const map = page.locator('[data-testid="map-canvas"]');

					await page.touchscreen.tap(200, 200);
					await page.waitForTimeout(100);
					await dragMap(page, map);
					await page.waitForTimeout(500);

					// Check no errors
					const errors = await page.evaluate(() => {
						return window.errors || [];
					});

					expect(errors.length).toBe(0);
				});
			});

			test("should render markers efficiently", async ({ browser }) => {
				await withDevicePage(browser, device, async (page) => {
					await page.goto("/");
					await page.waitForSelector('[data-testid="map-canvas"]');

					// Count markers
					const markerCount = await page.evaluate(() => {
						return document.querySelectorAll(".vibe-e2e-pin-marker").length;
					});

					console.log(`${device.name} Markers rendered: ${markerCount}`);

					expect(markerCount).toBeGreaterThan(0);
					expect(markerCount).toBeLessThan(200);
				});
			});
		});
	}
});
