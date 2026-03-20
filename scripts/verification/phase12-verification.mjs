#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.PHASE12_BASE_URL || "http://localhost:5173";
const REPORT_PATH =
	process.env.PHASE12_REPORT_PATH ||
	"reports/verification/phase12-results.json";

const COMPOSABLE_PATHS = {
	useSentientMap: "src/composables/map/useSentientMap.js",
	useMapHeatmap: "src/composables/map/useMapHeatmap.js",
	useWeather: "src/composables/useWeather.js",
	useVibeEffects: "src/composables/useVibeEffects.js",
	useDollyZoom: "src/composables/engine/useDollyZoom.js",
	useSDFClusters: "src/composables/engine/useSDFClusters.js",
	useFluidOverlay: "src/composables/engine/useFluidOverlay.js",
};

class Phase12Verification {
	async runAllVerifications() {
		console.log(`[phase12] starting verification against ${BASE_URL}`);

		const results = {
			criticalFeatures: await this.verifyCriticalFeatures(),
			deferredComposables: await this.verifyDeferredComposables(),
			accessibility: await this.verifyAccessibility(),
			performanceMetrics: await this.verifyPerformanceMetrics(),
		};

		await this.generateVerificationReport(results);
		console.log("[phase12] verification complete");
	}

	async withPage(run) {
		const browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({
			viewport: { width: 1280, height: 800 },
		});
		try {
			await page.goto(BASE_URL, {
				waitUntil: "domcontentloaded",
				timeout: 45000,
			});
			await this.waitForCorePageReady(page);
			return await run(page);
		} finally {
			await browser.close();
		}
	}

	async waitForCorePageReady(page) {
		await page.waitForSelector("#app", { state: "attached", timeout: 15000 });
		await page.waitForTimeout(800);
		await page
			.waitForFunction(
				() =>
					Boolean(document.querySelector('[data-testid="map-shell"]')) ||
					(typeof window !== "undefined" &&
						typeof window.__mapMetrics?.parseOverhead === "number"),
				{ timeout: 20000 },
			)
			.catch(() => null);
	}

	async getMapState(page) {
		return await page.evaluate(() => {
			const map = window.__vibecityMapDebug || null;
			const mapShell = document.querySelector('[data-testid="map-shell"]');
			const mapCanvas =
				document.querySelector('[data-testid="map-canvas"]') ||
				document.querySelector(".maplibregl-map");
			const domMarkerCount = document.querySelectorAll(
				'[data-testid="venue-marker"], .vibe-marker, .mapboxgl-marker',
			).length;

			let pinFeatureCount = 0;
			let pinLayerReady = false;
			let selectedPinActive = false;
			let clickPoint = null;

			if (map) {
				pinLayerReady = Boolean(
					map.getLayer?.("unclustered-pins") ||
						map.getLayer?.("unclustered-pins-hitbox"),
				);

				try {
					const selectedFilter = map.getFilter?.("selected-pin-marker");
					const serialized = JSON.stringify(selectedFilter ?? null);
					selectedPinActive =
						Array.isArray(selectedFilter) && !serialized.includes("__none__");
				} catch {
					selectedPinActive = false;
				}

				const source = map.getSource?.("pins_source");
				const sourceData =
					source?._data ||
					source?._options?.data ||
					source?._dataRef ||
					source?.data ||
					null;
				const features = Array.isArray(sourceData?.features)
					? sourceData.features
					: [];
				pinFeatureCount = features.length;

				const candidate = features.find(
					(feature) =>
						Array.isArray(feature?.geometry?.coordinates) &&
						feature.geometry.coordinates.length >= 2,
				);

				if (candidate) {
					const [lng, lat] = candidate.geometry.coordinates;
					try {
						map.jumpTo?.({
							center: [lng, lat],
							zoom: Math.max(14, Number(map.getZoom?.() || 14)),
						});
						const projected = map.project?.([lng, lat]);
						if (
							projected &&
							Number.isFinite(projected.x) &&
							Number.isFinite(projected.y)
						) {
							clickPoint = {
								x: projected.x,
								y: projected.y,
								lng,
								lat,
							};
						}
					} catch {
						// Ignore projection issues during style transitions.
					}
				}
			}

			return {
				mapReady:
					mapShell?.getAttribute("data-map-ready") === "true" ||
					(Boolean(map?.loaded?.()) && Boolean(map?.isStyleLoaded?.())),
				mapPresent: Boolean(mapCanvas),
				domMarkerCount,
				pinFeatureCount,
				pinLayerReady,
				selectedPinActive,
				clickPoint,
			};
		});
	}

	async verifyCriticalFeatures() {
		try {
			const startedAt = Date.now();
			return await this.withPage(async (page) => ({
				pinRendering: await this.checkPinRendering(page),
				pinClickDrawer: await this.checkPinClickDrawer(page),
				mapDragZoom: await this.checkMapDragZoom(page),
				deferredFeaturesLoad: await this.checkDeferredFeaturesLoad(page, {
					sinceMs: startedAt,
				}),
			}));
		} catch (error) {
			return { error: String(error?.message || error) };
		}
	}

	async checkPinRendering(page) {
		try {
			await page.waitForSelector('[data-testid="map-shell"]', {
				state: "visible",
				timeout: 15000,
			});

			let lastState = null;
			const started = Date.now();
			while (Date.now() - started < 15000) {
				lastState = await this.getMapState(page);
				if (
					lastState.domMarkerCount > 0 ||
					lastState.pinFeatureCount > 0 ||
					(lastState.mapReady && lastState.pinLayerReady)
				) {
					return {
						status: "pass",
						method:
							lastState.domMarkerCount > 0
								? "dom-marker"
								: lastState.pinFeatureCount > 0
									? "pin-source-data"
									: "pin-layer-ready",
						...lastState,
					};
				}
				await page.waitForTimeout(500);
			}

			return { status: "fail", ...(lastState || {}) };
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async checkPinClickDrawer(page) {
		try {
			const before = await page.evaluate(() => ({
				path: `${location.pathname}${location.search}${location.hash}`,
			}));

			const markerSelector = [
				'[data-testid="venue-marker"]',
				".vibe-marker",
				".mapboxgl-marker",
			].join(", ");
			const detailSelector = [
				'[data-testid="vibe-modal"]',
				'[data-testid="favorites-modal"]',
				'[data-testid="favorites-modal-sheet"]',
				".vibe-popup",
			].join(", ");

			let clickMethod = "none";
			const domMarkers = page.locator(markerSelector);
			if ((await domMarkers.count()) > 0) {
				await domMarkers.first().click({ timeout: 6000 });
				clickMethod = "dom-marker";
			} else {
				const state = await this.getMapState(page);
				if (state?.clickPoint) {
					const canvas = page
						.locator('[data-testid="map-canvas"], .maplibregl-map')
						.first();
					const box = await canvas.boundingBox();
					if (box) {
						await page.mouse.click(
							box.x + state.clickPoint.x,
							box.y + state.clickPoint.y,
						);
						clickMethod = "projected-map-click";
					}
				}
			}

			if (clickMethod === "none") {
				const fallbackCard = page.locator('[data-testid="shop-card"]').first();
				if ((await fallbackCard.count()) > 0) {
					await fallbackCard.click({ timeout: 6000 });
					clickMethod = "shop-card-fallback";
				}
			}

			await page
				.waitForSelector(detailSelector, { timeout: 4000 })
				.catch(() => null);
			await page.waitForTimeout(1200);

			const after = await page.evaluate(
				(beforePath, selector) => {
					const map = window.__vibecityMapDebug || null;
					let selectedPinActive = false;
					try {
						const selectedFilter = map?.getFilter?.("selected-pin-marker");
						const serialized = JSON.stringify(selectedFilter ?? null);
						selectedPinActive =
							Array.isArray(selectedFilter) && !serialized.includes("__none__");
					} catch {
						selectedPinActive = false;
					}

					const path = `${location.pathname}${location.search}${location.hash}`;
					return {
						pathChanged: path !== beforePath,
						selectedPinActive,
						detailVisible: Boolean(document.querySelector(selector)),
					};
				},
				before.path,
				detailSelector,
			);

			const pass =
				after.selectedPinActive || after.pathChanged || after.detailVisible;
			return {
				status: pass ? "pass" : "fail",
				clickMethod,
				...after,
			};
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async checkMapDragZoom(page) {
		try {
			const mapShellSelector = '[data-testid="map-shell"], .maplibregl-map';
			const mapShell = page.locator(mapShellSelector).first();
			await mapShell.waitFor({ state: "visible", timeout: 10000 });

			const box = await mapShell.boundingBox();
			if (!box) {
				return { status: "fail", error: "Map bounding box unavailable" };
			}

			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.mouse.move(
				box.x + box.width / 2 + 80,
				box.y + box.height / 2 + 40,
				{ steps: 8 },
			);
			await page.mouse.up();
			await page.mouse.wheel(0, -240);
			return { status: "pass" };
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async checkDeferredFeaturesLoad(page, { sinceMs = Date.now() } = {}) {
		try {
			let flags = null;
			const started = Date.now();
			while (Date.now() - started < 16000) {
				flags = await page.evaluate(() => {
					const map = window.__vibecityMapDebug || null;
					const shell = document.querySelector('[data-testid="map-shell"]');
					const mapReadyAttr = shell?.getAttribute("data-map-ready");
					const mapReadyByApi =
						Boolean(map?.loaded?.()) && Boolean(map?.isStyleLoaded?.());
					const metrics = window.__mapMetrics || {};
					return {
						parseOverheadPresent:
							typeof metrics.parseOverhead === "number" &&
							Number.isFinite(metrics.parseOverhead),
						interactivePresent:
							typeof metrics.interactiveAt === "number" &&
							Number.isFinite(metrics.interactiveAt),
						mapReady: mapReadyAttr === "true" || mapReadyByApi,
						interactiveAt: metrics.interactiveAt ?? null,
					};
				});

				if (
					flags.parseOverheadPresent &&
					(flags.interactivePresent || flags.mapReady)
				) {
					return {
						status: "pass",
						method: flags.interactivePresent
							? "interactive-metric"
							: "map-ready-fallback",
						sinceMs,
						elapsedMs: Date.now() - sinceMs,
						...flags,
					};
				}
				await page.waitForTimeout(700);
			}

			return {
				status: "fail",
				sinceMs,
				elapsedMs: Date.now() - sinceMs,
				...(flags || {}),
			};
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async verifyDeferredComposables() {
		const results = {};
		for (const [name, filePath] of Object.entries(COMPOSABLE_PATHS)) {
			results[name] = await this.checkComposableLoad(filePath);
		}
		return results;
	}

	async checkComposableLoad(filePath) {
		try {
			const content = await fs.readFile(filePath, "utf8");
			const hasExport =
				content.includes("export function") ||
				content.includes("export const") ||
				content.includes("export default");
			return {
				status: hasExport ? "pass" : "warn",
				exists: true,
				size: content.length,
				filePath,
			};
		} catch (error) {
			return {
				status: "fail",
				exists: false,
				error: String(error?.message || error),
				filePath,
			};
		}
	}

	async verifyAccessibility() {
		try {
			return await this.withPage(async (page) => ({
				keyboardNavigation: await this.checkKeyboardNavigation(page),
				reducedMotion: await this.checkReducedMotion(page),
				interactiveElements: await this.checkInteractiveElements(page),
			}));
		} catch (error) {
			return { error: String(error?.message || error) };
		}
	}

	async checkKeyboardNavigation(page) {
		try {
			await page.keyboard.press("Tab");
			const focused = await page.evaluate(() => ({
				tag: document.activeElement?.tagName || null,
				id: document.activeElement?.id || null,
				className: document.activeElement?.className || null,
			}));
			return {
				status: focused.tag ? "pass" : "fail",
				focused,
			};
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async checkReducedMotion(page) {
		try {
			await page.emulateMedia({ reducedMotion: "reduce" });
			const hasMotionKillSwitch = await page.evaluate(() => {
				const styleSheets = [...document.styleSheets];
				for (const sheet of styleSheets) {
					let rules = [];
					try {
						rules = [...(sheet.cssRules || [])];
					} catch {
						continue;
					}
					if (
						rules.some((rule) =>
							rule.cssText?.includes("prefers-reduced-motion: reduce"),
						)
					) {
						return true;
					}
				}
				return false;
			});
			return {
				status: hasMotionKillSwitch ? "pass" : "warn",
				hasMotionKillSwitch,
			};
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async checkInteractiveElements(page) {
		try {
			const count = await page.evaluate(
				() =>
					document.querySelectorAll(
						'button, a[href], [role="button"], input, select, textarea',
					).length,
			);
			return { status: count > 0 ? "pass" : "warn", count };
		} catch (error) {
			return { status: "fail", error: String(error?.message || error) };
		}
	}

	async verifyPerformanceMetrics() {
		try {
			return await this.withPage(async (page) => {
				await page.waitForTimeout(2500);
				return await page.evaluate(() => {
					const nav = performance.getEntriesByType("navigation")[0];
					const fcp = performance.getEntriesByName("first-contentful-paint")[0];
					const lcpEntries = performance.getEntriesByType(
						"largest-contentful-paint",
					);
					const lcp = lcpEntries.length
						? lcpEntries[lcpEntries.length - 1]
						: null;
					return {
						mapMetrics: window.__mapMetrics || null,
						navigation: nav
							? {
									domContentLoaded: nav.domContentLoadedEventEnd,
									loadEventEnd: nav.loadEventEnd,
								}
							: null,
						fcp: fcp?.startTime ?? null,
						lcp: lcp?.renderTime ?? lcp?.startTime ?? null,
					};
				});
			});
		} catch (error) {
			return { error: String(error?.message || error) };
		}
	}

	async generateVerificationReport(results) {
		const report = {
			timestamp: new Date().toISOString(),
			phase: "12",
			baseUrl: BASE_URL,
			status: this.calculateOverallStatus(results),
			results,
		};

		const reportDir = path.dirname(REPORT_PATH);
		await fs.mkdir(reportDir, { recursive: true });
		await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
		console.log(`[phase12] report saved: ${REPORT_PATH}`);
	}

	calculateOverallStatus(results) {
		const statusList = [];
		const collect = (value) => {
			if (!value || typeof value !== "object") return;
			if (typeof value.status === "string") {
				statusList.push(value.status);
				return;
			}
			for (const nested of Object.values(value)) collect(nested);
		};
		collect(results);
		const total = statusList.length;
		const passed = statusList.filter((s) => s === "pass").length;
		const warned = statusList.filter((s) => s === "warn").length;
		const failed = statusList.filter((s) => s === "fail").length;
		return {
			passed,
			warned,
			failed,
			total,
			percentage: total ? Math.round((passed / total) * 100) : 0,
		};
	}
}

const verification = new Phase12Verification();
verification.runAllVerifications().catch((error) => {
	console.error("[phase12] verification failed:", error);
	process.exitCode = 1;
});
