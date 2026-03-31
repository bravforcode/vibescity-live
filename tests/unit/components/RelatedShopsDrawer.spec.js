import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RelatedShopsDrawer from "../../../src/components/ui/RelatedShopsDrawer.vue";

describe("RelatedShopsDrawer", () => {
	it("renders authoritative media badges and image from real media only", () => {
		const wrapper = mount(RelatedShopsDrawer, {
			props: {
				isOpen: true,
				shops: [
					{
						id: "shop-1",
						name: "Real Media Shop",
						category: "Restaurant",
						distance: 0.4,
						Image_URL1: "https://cdn.example.com/legacy.jpg",
						real_media: [
							{
								type: "image",
								url: "https://cdn.example.com/real-cover.jpg",
							},
						],
						media_counts: {
							images: 2,
							videos: 1,
							total: 3,
						},
					},
				],
			},
		});

		const image = wrapper.find("img");

		expect(image.exists()).toBe(true);
		expect(image.attributes("src")).toContain("real-cover.jpg");
		expect(wrapper.html()).not.toContain("legacy.jpg");
		expect(wrapper.text()).toContain("IMG 2");
		expect(wrapper.text()).toContain("VID 1");
	});

	it("shows gallery count placeholder when authoritative media has no image", () => {
		const wrapper = mount(RelatedShopsDrawer, {
			props: {
				isOpen: true,
				shops: [
					{
						id: "shop-2",
						name: "Video Only Shop",
						category: "Live Music",
						real_media: [
							{
								type: "video",
								url: "https://cdn.example.com/teaser.mp4",
							},
						],
						media_counts: {
							images: 0,
							videos: 1,
							total: 1,
						},
					},
				],
			},
		});

		expect(wrapper.text()).toContain("Gallery 1");
		expect(wrapper.text()).toContain("VID 1");
	});
});
