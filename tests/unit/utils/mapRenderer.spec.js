import { describe, expect, it } from "vitest";
import { createPopupHTML } from "../../../src/utils/mapRenderer";

describe("createPopupHTML", () => {
	it("renders popup media badges from authoritative media counts", () => {
		const html = createPopupHTML({
			item: {
				id: "shop-1",
				name: "Popup Shop",
				category: "Restaurant",
				status: "LIVE",
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
		});

		expect(html).toContain("real-cover.jpg");
		expect(html).not.toContain("legacy.jpg");
		expect(html).toContain("IMG 2");
		expect(html).toContain("VID 1");
	});

	it("shows no-media badge when authoritative media counts are empty", () => {
		const html = createPopupHTML({
			item: {
				id: "shop-2",
				name: "No Media Shop",
				category: "Cafe",
				Image_URL1: "https://cdn.example.com/legacy.jpg",
				real_media: [],
				media_counts: {
					images: 0,
					videos: 0,
					total: 0,
				},
			},
		});

		expect(html).not.toContain("legacy.jpg");
		expect(html).toContain("No media");
	});
});
