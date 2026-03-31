import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useGiantPinSelection } from "../../../src/composables/useGiantPinSelection";

describe("useGiantPinSelection", () => {
	it("uses representative shop first, then manual selection inside the same building", async () => {
		const context = ref({
			contextId: "giant-pin:map:mall-1:shop-1",
			buildingId: "mall-1",
			representativeShopId: "shop-1",
			initialShopId: "shop-2",
		});
		const shops = ref([
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
		]);

		const selection = useGiantPinSelection({ context, shops });

		expect(selection.selectedShop.value?.id).toBe("shop-1");
		expect(selection.preloadTargets.value.map((shop) => shop.id)).toEqual([
			"shop-1",
			"shop-2",
		]);

		selection.selectShop("shop-2");
		await nextTick();

		expect(selection.selectedShop.value?.id).toBe("shop-2");
		expect(selection.heroImage.value).toContain("shop-2.jpg");
	});

	it("falls back to shops with media and resets when the drawer context changes", async () => {
		const context = ref({
			contextId: "giant-pin:map:mall-a:none",
			buildingId: "mall-a",
			representativeShopId: "missing",
			initialShopId: "missing-too",
		});
		const shops = ref([
			{
				id: "shop-a1",
				buildingId: "mall-a",
			},
			{
				id: "shop-a2",
				buildingId: "mall-a",
				Image_URL1: "https://cdn.example.com/shop-a2.jpg",
			},
			{
				id: "shop-b1",
				buildingId: "mall-b",
				Image_URL1: "https://cdn.example.com/shop-b1.jpg",
			},
		]);

		const selection = useGiantPinSelection({ context, shops });

		expect(selection.selectedShop.value?.id).toBe("shop-a2");

		selection.selectShop("shop-a1");
		await nextTick();
		expect(selection.selectedShop.value?.id).toBe("shop-a1");

		context.value = {
			contextId: "giant-pin:map:mall-b:shop-b1",
			buildingId: "mall-b",
			representativeShopId: "shop-b1",
			initialShopId: "shop-b1",
		};
		await nextTick();

		expect(selection.shopsInBuilding.value.map((shop) => shop.id)).toEqual([
			"shop-b1",
		]);
		expect(selection.selectedShop.value?.id).toBe("shop-b1");
	});
});
