import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import MallDrawerGiantContent from "../../../src/components/modal/MallDrawerGiantContent.vue";
import i18n from "../../../src/i18n.js";

const imageLoaderStub = {
	name: "ImageLoader",
	props: ["src", "alt"],
	template: '<img :src="src" :alt="alt" />',
};

describe("MallDrawerGiantContent", () => {
	it("changes the hero on card click without auto-opening detail, then emits CTA intent explicitly", async () => {
		const wrapper = mount(MallDrawerGiantContent, {
			props: {
				context: {
					contextId: "giant-pin:map:mall-1:shop-1",
					mode: "giant-pin",
					buildingId: "mall-1",
					buildingName: "Mega Mall",
					representativeShopId: "shop-1",
					initialShopId: "shop-1",
				},
				building: {
					id: "mall-1",
					name: "Mega Mall",
				},
				shops: [
					{
						id: "shop-1",
						Building: "mall-1",
						name: "Coffee Lab",
						category: "Cafe",
						Image_URL1: "https://cdn.example.com/coffee.jpg",
					},
					{
						id: "shop-2",
						Building: "mall-1",
						name: "Ramen Works",
						category: "Restaurant",
						Image_URL1: "https://cdn.example.com/ramen.jpg",
					},
				],
			},
			global: {
				plugins: [i18n],
				stubs: {
					ImageLoader: imageLoaderStub,
				},
			},
		});

		expect(wrapper.get('[data-testid="giant-pin-hero-title"]').text()).toBe(
			"Coffee Lab",
		);

		await wrapper.findAll('[data-testid="giant-pin-card"]')[1].trigger("click");

		expect(wrapper.get('[data-testid="giant-pin-hero-title"]').text()).toBe(
			"Ramen Works",
		);
		expect(wrapper.emitted("preview-shop-change")?.[0]?.[0]?.id).toBe("shop-2");
		expect(wrapper.emitted("open-shop-detail")).toBeUndefined();

		await wrapper.get('[data-testid="giant-pin-detail-cta"]').trigger("click");

		expect(wrapper.emitted("open-shop-detail")?.[0]?.[0]?.id).toBe("shop-2");
	});
});
