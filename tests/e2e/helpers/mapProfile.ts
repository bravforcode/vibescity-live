import { test, type Page } from "@playwright/test";

const MAP_REQUIRED_TAG = "@map-required";
const MAP_READY_SELECTOR = '[data-testid="map-shell"][data-map-ready="true"]';
const MAP_SHELL_SELECTOR = '[data-testid="map-shell"]';
const MAP_WRAPPER_SELECTOR = '[data-testid="map-shell-wrapper"]';
const MAP_TOKEN_OVERLAY_TEXT = "Mapbox Token Required";
const WEBGL_FALLBACK_TEXT = "Map Not Available";
const MAP_CANVAS_SELECTOR = '[data-testid="map-canvas"]';

export function isMapRequiredProfile(): boolean {
  const grep = process.env.PW_GREP || "";
  return grep.includes(MAP_REQUIRED_TAG) || process.env.E2E_MAP_REQUIRED === "1";
}

export function enforceMapConditionOrSkip(condition: boolean, reason: string): void {
  if (condition) {
    return;
  }

  if (isMapRequiredProfile()) {
    throw new Error(`${MAP_REQUIRED_TAG} failed: ${reason}`);
  }

  test.skip(true, reason);
}

async function waitForMapReadyFlag(page: Page, timeoutMs: number): Promise<boolean> {
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
        wrapperVisible ? "Map wrapper is visible." : "Map wrapper is not visible.",
      ].join(" "),
    );
    return false;
  }

  const isReady = await waitForMapReadyFlag(page, timeoutMs);

  if (!isReady) {
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

    const readyAfterCheck = await waitForMapReadyFlag(page, 1_000);
    if (readyAfterCheck) {
      return true;
    }

    const reasonParts = [
      `Map shell did not become ready within ${timeoutMs}ms.`,
      tokenInvalid ? "Token overlay detected." : null,
      webGLFallback ? "WebGL fallback detected." : null,
      mapCanvasVisible ? "Map canvas visible but ready flag is false." : null,
      shellMeta
        ? `Map shell attrs: ready=${shellMeta.ready}, init=${shellMeta.initRequested}, tokenInvalid=${shellMeta.tokenInvalid}.`
        : null,
    ].filter(Boolean);

    enforceMapConditionOrSkip(isReady, reasonParts.join(" "));
    return false;
  }

  enforceMapConditionOrSkip(
    isReady,
    `Map shell did not become ready within ${timeoutMs}ms.`,
  );

  return isReady;
}

export async function hasWebGLSupport(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return !!gl;
  });
}
