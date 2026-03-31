import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ImageLoader from "../../../src/components/ui/ImageLoader.vue";
import {
	getUsableMediaUrl,
	resetFailedMediaUrls,
} from "../../../src/utils/mediaSourceGuard";

vi.mock("@vueuse/core", () => ({
	useIntersectionObserver: (_target, callback) => {
		queueMicrotask(() => {
			callback([{ isIntersecting: true }]);
		});
		return {
			stop: vi.fn(),
		};
	},
}));

let imageOutcome = "load";

class MockImage {
	constructor() {
		this.onload = null;
		this.onerror = null;
		this.fetchPriority = "auto";
		this.crossOrigin = "";
	}

	set src(value) {
		this._src = value;
		queueMicrotask(() => {
			if (imageOutcome === "error") {
				this.onerror?.(new Event("error"));
				return;
			}
			this.onload?.(new Event("load"));
		});
	}

	get src() {
		return this._src;
	}
}

const flushImageLoader = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await nextTick();
};

describe("ImageLoader", () => {
	beforeEach(() => {
		imageOutcome = "load";
		resetFailedMediaUrls();
		vi.stubGlobal("Image", MockImage);
	});

	afterEach(() => {
		resetFailedMediaUrls();
		vi.unstubAllGlobals();
	});

	it("renders the original image URL without synthesizing a webp sibling path", async () => {
		const source =
			"https://rukyitpjfmzhqjlfmbie.supabase.co/storage/v1/object/public/venue-media/images/example.png";

		const wrapper = mount(ImageLoader, {
			props: {
				src: source,
				alt: "Example",
			},
		});

		await flushImageLoader();

		const img = wrapper.find("img");
		expect(img.exists()).toBe(true);
		expect(img.attributes("src")).toBe(source);
		expect(wrapper.find("source").exists()).toBe(false);
	});

	it("blacklists failed image URLs so later callers stop retrying them", async () => {
		imageOutcome = "error";
		const source = "https://cdn.example.com/broken-image.png";

		const wrapper = mount(ImageLoader, {
			props: {
				src: source,
				alt: "Broken",
			},
		});

		await flushImageLoader();

		expect(wrapper.emitted("error")).toBeTruthy();
		expect(getUsableMediaUrl(source)).toBe("");
	});
});
