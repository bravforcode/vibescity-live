import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MAPBOX_CONTAINER_PATH = path.resolve(
	process.cwd(),
	"src/components/map/MapboxContainer.vue",
);

const extractLayerBlock = (source, layerIdMarker) => {
	const start = source.indexOf(layerIdMarker);
	if (start < 0) return "";
	const end = source.indexOf("});", start);
	if (end < 0) return source.slice(start, start + 500);
	return source.slice(start, end + 3);
};

describe("MapLibre neon expression contract", () => {
	it("keeps selected pin layer as a simple symbol without zoom interpolate", () => {
		const source = fs.readFileSync(MAPBOX_CONTAINER_PATH, "utf8");
		const block = extractLayerBlock(source, "id: SELECTED_PIN_LAYER_ID");
		expect(block).toContain('type: "symbol"');
		expect(block).not.toContain('"interpolate"');
		expect(block).not.toContain('"*",');
	});

	it("keeps hitbox layer as a simple circle without zoom interpolate", () => {
		const source = fs.readFileSync(MAPBOX_CONTAINER_PATH, "utf8");
		const block = extractLayerBlock(source, "id: PIN_HITBOX_LAYER_ID");
		expect(block).toContain('type: "circle"');
		expect(block).not.toContain('"interpolate"');
		expect(block).not.toContain('"*",');
	});
});
