import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveVenueMedia } from "../../src/domain/venue/viewModel";
import {
	markMediaUrlFailed,
	resetFailedMediaUrls,
} from "../../src/utils/mediaSourceGuard";

describe("resolveVenueMedia", () => {
	beforeEach(() => {
		resetFailedMediaUrls();
	});

	afterEach(() => {
		resetFailedMediaUrls();
	});

	it("falls back to the next image when the preferred video has failed", () => {
		const venue = {
			Video_URL: "https://cdn.example.com/media/hero.mp4",
			Image_URL1: "https://cdn.example.com/media/hero.jpg",
			Image_URL2: "https://cdn.example.com/media/detail.jpg",
		};

		expect(resolveVenueMedia(venue)).toMatchObject({
			videoUrl: "https://cdn.example.com/media/hero.mp4",
			primaryImage: "https://cdn.example.com/media/hero.jpg",
		});

		markMediaUrlFailed(venue.Video_URL);

		expect(resolveVenueMedia(venue)).toMatchObject({
			videoUrl: "",
			primaryImage: "https://cdn.example.com/media/hero.jpg",
			images: [
				"https://cdn.example.com/media/hero.jpg",
				"https://cdn.example.com/media/detail.jpg",
			],
		});
	});

	it("skips failed images and keeps the next usable candidate", () => {
		const venue = {
			Image_URL1: "https://cdn.example.com/media/broken.jpg",
			Image_URL2: "https://cdn.example.com/media/fallback.jpg",
			image_urls: [
				"https://cdn.example.com/media/broken.jpg",
				"https://cdn.example.com/media/fallback.jpg",
			],
		};

		markMediaUrlFailed(venue.Image_URL1);

		expect(resolveVenueMedia(venue)).toMatchObject({
			videoUrl: "",
			primaryImage: "https://cdn.example.com/media/fallback.jpg",
			images: ["https://cdn.example.com/media/fallback.jpg"],
		});
	});
});
