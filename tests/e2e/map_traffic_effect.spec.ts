import { expect, test } from "@playwright/test";
import { waitForMapReadyOrSkip } from "./helpers/mapProfile";

const readTrafficSnapshot = async (page) => {
  return page.evaluate(() => {
    const map = window.__vibecityMapDebug;
    if (!map || typeof map.getStyle !== "function") {
      return {
        ok: false,
        reason: "map-debug-unavailable",
      };
    }

    const style = map.getStyle();
    const styleLayers = Array.isArray(style?.layers) ? style.layers : [];
    const getLayerDef = (layerId) =>
      styleLayers.find((layer) => layer?.id === layerId) || null;

    const hasRoadCars = Boolean(map.getLayer("road-cars"));
    const hasFlowCore = Boolean(map.getLayer("road-flow-core"));
    const hasFlowGlow = Boolean(map.getLayer("road-flow-glow"));

    return {
      ok: true,
      hasRoadCars,
      hasFlowCore,
      hasFlowGlow,
      hasLocalTrafficSource: Boolean(map.getSource("traffic-roads-local")),
      hasCompositeSource: Boolean(map.getSource("composite")),
      roadCarsSource: getLayerDef("road-cars")?.source || null,
      roadCarsSourceLayer: getLayerDef("road-cars")?.["source-layer"] || null,
      iconOffset: hasRoadCars
        ? map.getLayoutProperty("road-cars", "icon-offset")
        : null,
      flowDash: hasFlowCore
        ? map.getPaintProperty("road-flow-core", "line-dasharray")
        : null,
      sourceIds: Object.keys(style?.sources || {}),
    };
  });
};

test("traffic road effect mounts and animates @map-required", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const mapReady = await waitForMapReadyOrSkip(page, 60_000);
  if (!mapReady) return;

  await page.waitForFunction(
    () => {
      const map = window.__vibecityMapDebug;
      if (!map || typeof map.getLayer !== "function") return false;
      return Boolean(
        map.getLayer("road-cars") ||
          map.getLayer("road-flow-core") ||
          map.getLayer("road-flow-glow"),
      );
    },
    { timeout: 20_000 },
  );

  const first = await readTrafficSnapshot(page);
  expect(first.ok).toBe(true);
  expect(first.hasRoadCars || first.hasFlowCore || first.hasFlowGlow).toBe(true);
  expect(Boolean(first.roadCarsSource)).toBe(true);

  const prefersReducedMotion = await page.evaluate(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  );

  await page.waitForTimeout(1_000);
  const second = await readTrafficSnapshot(page);

  const offsetChanged =
    JSON.stringify(first.iconOffset) !== JSON.stringify(second.iconOffset);
  const dashChanged = JSON.stringify(first.flowDash) !== JSON.stringify(second.flowDash);

  if (prefersReducedMotion) {
    expect(second.hasRoadCars || second.hasFlowCore).toBe(true);
  } else {
    expect(offsetChanged || dashChanged).toBe(true);
  }
});
