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

	it("prefers authoritative real media over legacy image and video fields", () => {
		const venue = {
			Image_URL1: "https://cdn.example.com/media/legacy.jpg",
			Video_URL: "https://youtube.com/watch?v=legacy",
			real_media: [
				{
					type: "image",
					url: "https://cdn.example.com/media/real-cover.jpg",
				},
				{
					type: "video",
					url: "https://cdn.example.com/media/real-reel.mp4",
				},
			],
			media_counts: {
				images: 1,
				videos: 1,
				total: 2,
			},
		};

		expect(resolveVenueMedia(venue)).toMatchObject({
			videoUrl: "https://cdn.example.com/media/real-reel.mp4",
			primaryImage: "https://cdn.example.com/media/real-cover.jpg",
			images: ["https://cdn.example.com/media/real-cover.jpg"],
			counts: {
				images: 1,
				videos: 1,
				total: 2,
			},
			hasRealMedia: true,
		});
	});

	it("does not fall back to legacy media when explicit real media counts are zero", () => {
		const venue = {
			Image_URL1: "https://cdn.example.com/media/legacy.jpg",
			Video_URL: "https://cdn.example.com/media/legacy.mp4",
			real_media: [],
			media_counts: {
				images: 0,
				videos: 0,
				total: 0,
			},
		};

		expect(resolveVenueMedia(venue)).toMatchObject({
			videoUrl: "",
			primaryImage: "",
			images: [],
			counts: {
				images: 0,
				videos: 0,
				total: 0,
			},
			hasRealMedia: true,
		});
	});
});
