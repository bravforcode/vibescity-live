import { describe, expect, it } from "vitest";
import {
	normalizeGiantPinPayload,
	resolveGiantPinSelection,
} from "../../../src/domain/venue/giantPinContext";

describe("giantPinContext", () => {
	it("normalizes representative giant-pin payloads without guessing from name", () => {
		const context = normalizeGiantPinPayload(
			{
				id: "shop-1",
				name: "Coffee Lab",
				pin_type: "giant",
				building_id: "mall-1",
				building_name: "Mega Mall",
			},
			[],
			{
				"mall-1": {
					id: "mall-1",
					name: "Mega Mall",
				},
			},
		);

		expect(context).toEqual({
			contextId: "giant-pin:map:mall-1:shop-1",
			mode: "giant-pin",
			source: "map",
			buildingId: "mall-1",
			buildingName: "Mega Mall",
			representativeShopId: "shop-1",
			initialShopId: "shop-1",
		});
	});

	it("treats canonical building payloads as mall mode and allows key as identifier", () => {
		const context = normalizeGiantPinPayload(
			{
				key: "mall-2",
				name: "Central Plaza",
				floors: ["G", "1"],
			},
			[],
			{
				"mall-2": {
					id: "mall-2",
					name: "Central Plaza",
				},
			},
		);

		expect(context.mode).toBe("mall");
		expect(context.buildingId).toBe("mall-2");
		expect(context.buildingName).toBe("Central Plaza");
		expect(context.representativeShopId).toBeNull();
	});

	it("fails closed when a giant payload only provides names", () => {
		const context = normalizeGiantPinPayload({
			id: "shop-2",
			name: "Mega Mall",
			pin_type: "giant",
			building_name: "Mega Mall",
		});

		expect(context.mode).toBe("giant-pin");
		expect(context.buildingId).toBeNull();
		expect(context.buildingName).toBe("Mega Mall");
	});

	it("resolves selection priority inside the same building only", () => {
		const selection = resolveGiantPinSelection(
			{
				contextId: "giant-pin:map:mall-1:shop-1",
				buildingId: "mall-1",
				representativeShopId: "shop-1",
				initialShopId: "shop-2",
			},
			[
				{
					id: "shop-1",
					Building: "mall-1",
				},
				{
					id: "shop-2",
					Building: "mall-1",
					Image_URL1: "https://cdn.example.com/shop-2.jpg",
				},
				{
					id: "shop-3",
					Building: "mall-9",
					Image_URL1: "https://cdn.example.com/shop-3.jpg",
				},
			],
		);

		expect(selection.shopsInBuilding.map((shop) => shop.id)).toEqual([
			"shop-1",
			"shop-2",
		]);
		expect(selection.selectedShopId).toBe("shop-1");
	});
});
