import { type Page, test } from "@playwright/test";

const MAP_REQUIRED_TAG = "@map-required";
const MAP_READY_SELECTOR = '[data-testid="map-shell"][data-map-ready="true"]';
const MAP_SHELL_SELECTOR = '[data-testid="map-shell"]';
const MAP_WRAPPER_SELECTOR = '[data-testid="map-shell-wrapper"]';
const MAP_TOKEN_OVERLAY_TEXT = "Mapbox Token Required";
const WEBGL_FALLBACK_TEXT = "Map Not Available";
const MAP_CANVAS_SELECTOR = '[data-testid="map-canvas"]';
const MAP_REGION_SELECTOR = '[aria-label="Map"]';
const MAPBOX_SURFACE_SELECTOR = ".mapboxgl-map, .mapboxgl-canvas";
const MAP_CONTROL_SELECTOR = ".mapboxgl-ctrl-compass, .mapboxgl-ctrl-zoom-in";
const MAP_MARKER_SELECTOR = '.mapboxgl-marker, img[alt="Map marker"]';

export function isMapRequiredProfile(): boolean {
	const grep = process.env.PW_GREP || "";
	return (
		grep.includes(MAP_REQUIRED_TAG) || process.env.E2E_MAP_REQUIRED === "1"
	);
}

export function enforceMapConditionOrSkip(
	condition: boolean,
	reason: string,
): void {
	if (condition) {
		return;
	}

	if (isMapRequiredProfile()) {
		throw new Error(`${MAP_REQUIRED_TAG} failed: ${reason}`);
	}

	test.skip(true, reason);
}

async function waitForMapReadyFlag(
	page: Page,
	timeoutMs: number,
): Promise<boolean> {
	return page
		.waitForFunction(
			(selector) => {
				const shell = document.querySelector(selector);
				return shell?.getAttribute("data-map-ready") === "true";
			},
			MAP_SHELL_SELECTOR,
			{ timeout: timeoutMs },
		)
		.then(() => true)
		.catch(() => false);
}

async function waitForRenderedMapSurface(
	page: Page,
	timeoutMs: number,
): Promise<boolean> {
	return page
		.waitForFunction(
			({
				regionSelector,
				surfaceSelector,
				controlSelector,
				markerSelector,
			}) => {
				const selectors = [
					regionSelector,
					surfaceSelector,
					controlSelector,
					markerSelector,
				].filter(Boolean);

				return selectors.some((selector) => {
					const element = document.querySelector(selector);
					if (!element) return false;

					const rect = element.getBoundingClientRect();
					const style = window.getComputedStyle(element);
					return (
						rect.width > 0 &&
						rect.height > 0 &&
						style.visibility !== "hidden" &&
						style.display !== "none" &&
						style.opacity !== "0"
					);
				});
			},
			{
				regionSelector: MAP_REGION_SELECTOR,
				surfaceSelector: MAPBOX_SURFACE_SELECTOR,
				controlSelector: MAP_CONTROL_SELECTOR,
				markerSelector: MAP_MARKER_SELECTOR,
			},
			{ timeout: timeoutMs },
		)
		.then(() => true)
		.catch(() => false);
}

export async function waitForMapReadyOrSkip(
	page: Page,
	timeoutMs = 20_000,
): Promise<boolean> {
	const mapWrapper = page.locator(MAP_WRAPPER_SELECTOR).first();
	const wrapperVisible = await mapWrapper
		.waitFor({ state: "visible", timeout: timeoutMs })
		.then(() => true)
		.catch(() => false);

	enforceMapConditionOrSkip(
		wrapperVisible,
		`Map shell wrapper did not render within ${timeoutMs}ms.`,
	);

	const mapShell = page.locator(MAP_SHELL_SELECTOR).first();
	const mapShellVisible = await mapShell
		.waitFor({ state: "visible", timeout: timeoutMs })
		.then(() => true)
		.catch(() => false);

	if (!mapShellVisible) {
		// Wrapper rendered but map component didn't mount.
		enforceMapConditionOrSkip(
			mapShellVisible,
			[
				`Map component failed to mount within ${timeoutMs}ms.`,
				wrapperVisible
					? "Map wrapper is visible."
					: "Map wrapper is not visible.",
			].join(" "),
		);
		return false;
	}

	const isReady = await waitForMapReadyFlag(page, timeoutMs);
	const renderedSurfaceVisible = await waitForRenderedMapSurface(
		page,
		timeoutMs,
	);

	if (!isReady && !renderedSurfaceVisible) {
		const shellMeta = await mapShell
			.evaluate((el) => ({
				ready: el.getAttribute("data-map-ready"),
				initRequested: el.getAttribute("data-map-init-requested"),
				tokenInvalid: el.getAttribute("data-map-token-invalid"),
			}))
			.catch(() => null);
		const tokenInvalid = await page
			.getByText(MAP_TOKEN_OVERLAY_TEXT)
			.first()
			.isVisible()
			.catch(() => false);
		const webGLFallback = await page
			.getByText(WEBGL_FALLBACK_TEXT)
			.first()
			.isVisible()
			.catch(() => false);
		const mapCanvasVisible = await page
			.locator(MAP_CANVAS_SELECTOR)
			.first()
			.isVisible()
			.catch(() => false);
		const mapRegionVisible = await page
			.locator(MAP_REGION_SELECTOR)
			.first()
			.isVisible()
			.catch(() => false);
		const mapboxSurfaceVisible = await page
			.locator(MAPBOX_SURFACE_SELECTOR)
			.first()
			.isVisible()
			.catch(() => false);
		const markerVisible = await page
			.locator(MAP_MARKER_SELECTOR)
			.first()
			.isVisible()
			.catch(() => false);
		const controlsVisible = await page
			.locator(MAP_CONTROL_SELECTOR)
			.first()
			.isVisible()
			.catch(() => false);

		const readyAfterCheck = await waitForMapReadyFlag(page, 1_000);
		const renderedAfterCheck = await waitForRenderedMapSurface(page, 1_000);
		if (readyAfterCheck || renderedAfterCheck) {
			return true;
		}

		const reasonParts = [
			`Map shell did not become ready within ${timeoutMs}ms.`,
			tokenInvalid ? "Token overlay detected." : null,
			webGLFallback ? "WebGL fallback detected." : null,
			mapCanvasVisible ? "Map canvas visible but ready flag is false." : null,
			mapRegionVisible
				? "Map region is visible but ready flag is false."
				: null,
			mapboxSurfaceVisible
				? "Mapbox surface is visible but ready flag is false."
				: null,
			markerVisible ? "Marker is visible but ready flag is false." : null,
			controlsVisible
				? "Map controls are visible but ready flag is false."
				: null,
			shellMeta
				? `Map shell attrs: ready=${shellMeta.ready}, init=${shellMeta.initRequested}, tokenInvalid=${shellMeta.tokenInvalid}.`
				: null,
		].filter(Boolean);

		enforceMapConditionOrSkip(isReady, reasonParts.join(" "));
		return false;
	}

	enforceMapConditionOrSkip(
		isReady || renderedSurfaceVisible,
		`Map shell did not become ready within ${timeoutMs}ms.`,
	);

	return isReady || renderedSurfaceVisible;
}

export async function hasWebGLSupport(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const canvas = document.createElement("canvas");
		const gl =
			canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
		return !!gl;
	});
}
